import { Worker } from "bullmq";
import { connection } from "../config/paymentQueue.js";
import PaymentTransaction from "../models/paymentTransactionModel.js";
import Payroll from "../models/payrollModel.js";
import Audit from "../models/auditModel.js";
import axios from "axios";

/**
 * Payment Gateway Abstraction — Flutterwave
 */
async function disburseSinglePayment(transaction) {
  const { amount, currency, bankDetails, flutterwaveReference } = transaction;

  // Guard — bankCode is required by Flutterwave
  if (!bankDetails.bankCode) {
    throw new Error(
      `Bank code missing for account ${bankDetails.accountNumber}. Update employee bank details.`
    );
  }

  const reference = process.env.FLUTTERWAVE_ENV === "production"
  ? `${flutterwaveReference}-${transaction.attemptCount}`
  : `${flutterwaveReference}-${transaction.attemptCount}_PMCK`;

  try{
      const response = await axios.post(
    "https://api.flutterwave.com/v3/transfers",
    {
      account_bank: bankDetails.bankCode,
      account_number: bankDetails.accountNumber,
      amount,
      currency,
      narration: `Salary payment - CareerPay`,
      reference,
      callback_url: `${process.env.APP_URL}/api/payroll/payment-webhook`,
      debit_currency: currency,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.data || response.data.status !== "success") {
    throw new Error(
      response.data?.message || "Flutterwave transfer initiation failed"
    );
  }

  return {
    transferId: response.data.data.id.toString(),
    message: response.data.message,
  };
  } catch (error) {
    // Log the FULL Flutterwave response so you can see exactly what's wrong
    if (error.response) {
      console.error("Flutterwave 400 response body:", JSON.stringify(error.response.data, null, 2));
      console.error("Request payload sent:", JSON.stringify(error.config?.data, null, 2));
    }
    throw error;
    }
}

/**
 * Check if all payments for a payroll are settled
 * Updates payroll status to completed, partially_completed, or failed
 * Called from webhook handler after each payment confirmation
 */
export async function checkAndFinalizePayroll(payrollId) {
  const payroll = await Payroll.findById(payrollId);
  if (!payroll) return;

  const transactions = await PaymentTransaction.find({ payroll: payrollId });

  // Only finalize when every transaction is settled
  const allSettled = transactions.every((t) =>
    ["success", "failed"].includes(t.status)
  );

  if (!allSettled) return;

  const anyFailed = transactions.some((t) => t.status === "failed");
  const anySuccess = transactions.some((t) => t.status === "success");

  if (anyFailed && anySuccess) {
    payroll.status = "partially_completed";
  } else if (anyFailed && !anySuccess) {
    payroll.status = "failed";
  } else {
    payroll.status = "completed";
  }

  // Update individual payroll items to match transaction status
  for (const transaction of transactions) {
    const item = payroll.payrollItems.find(
      (i) => i.employee.toString() === transaction.employee.toString()
    );
    if (item) {
      item.paymentStatus =
        transaction.status === "success" ? "paid" : "failed";
      if (transaction.status === "success") {
        item.paymentDate = transaction.paidAt;
        item.paymentReference = transaction.flutterwaveReference;
      }
    }
  }

  await payroll.save();

  await Audit.log({
    company: payroll.company,
    user: payroll.processedBy, 
    action:
      payroll.status === "completed"
        ? "payroll_completed"
        : payroll.status === "partially_completed"
        ? "payroll_partially_completed"
        : "payroll_failed",
    module: "payroll",
    resourceType: "payroll",
    resourceId: payroll._id,
    details: {
      month: payroll.payrollPeriod.month,
      year: payroll.payrollPeriod.year,
      totalTransactions: transactions.length,
      successful: transactions.filter((t) => t.status === "success").length,
      failed: transactions.filter((t) => t.status === "failed").length,
    },
    status: "success",
    severity: "high",
  });
}

/**
 * Worker — processes one payment job at a time
 * BullMQ calls this function for every job in the queue
 * Automatically retries on failure based on queue config
 */
const worker = new Worker(
  "payroll-payments",
  async (job) => {
    const { transactionId } = job.data;

    const transaction = await PaymentTransaction.findById(transactionId);

    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    // Update attempt count and last attempt time
    transaction.attemptCount += 1;
    transaction.lastAttemptAt = new Date();
    transaction.status = "processing";
    await transaction.save();

    try {
      // Call Flutterwave — initiates the transfer
      const result = await disburseSinglePayment(transaction);

      // Flutterwave accepted the transfer — mark as processing
      // Final success/failure comes via webhook
      transaction.flutterwaveTransferId = result.transferId;
      transaction.gatewayMessage = result.message;
      // Status stays "processing" — webhook will update to "success" or "failed"
      await transaction.save();

    } catch (gatewayError) {
      transaction.gatewayMessage = gatewayError.message;

      if (transaction.attemptCount >= transaction.maxRetries) {
        // Permanently failed — all retries exhausted
        transaction.status = "failed";
        transaction.failureReason = `Failed after ${transaction.maxRetries} attempts. Last error: ${gatewayError.message}`;
        await transaction.save();

        // Check if payroll can be finalized after this permanent failure
        await checkAndFinalizePayroll(transaction.payroll);
      } else {
        // Will be retried — set back to pending
        transaction.status = "pending";
        await transaction.save();
      }

      // Re-throw so BullMQ knows to retry
      throw gatewayError;
    }
  },
  {
    connection,
    concurrency: 5,
  }
);

worker.on("completed", (job) => {
  console.log(`Payment job ${job.id} completed — awaiting webhook confirmation`);
});

worker.on("failed", (job, error) => {
  console.error(`Payment job ${job.id} failed: ${error.message}`);
});

worker.on("error", (error) => {
  console.error("Worker error:", error);
});

export default worker;