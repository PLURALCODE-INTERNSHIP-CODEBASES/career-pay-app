import { Worker } from "bullmq";
import { connection } from "../config/paymentQueue.js";
import PaymentTransaction from "../models/paymentTransactionModel.js";
import Payroll from "../models/payrollModel.js";
import Audit from "../models/auditModel.js";
import gateways, { GATEWAY_PRIORITY } from "./gateways/index.js";

/**
 * Try each gateway in priority order
 * Falls back to next gateway if current one fails
 */
async function disburseSinglePayment(transaction) {
  let lastError;

  for (const gatewayName of GATEWAY_PRIORITY) {
    try {
      console.log(`Attempting payment via ${gatewayName} for transaction ${transaction._id}`);

      const gateway = gateways[gatewayName];
      const result = await gateway.initiateTransfer(transaction);

      console.log(`Payment initiated via ${gatewayName} for transaction ${transaction._id}`);

      return { ...result, gateway: gatewayName };

    } catch (error) {
      console.error(
        `${gatewayName} failed for transaction ${transaction._id}: ${error.message} — trying next gateway`
      );
      lastError = error;
    }
  }

  // All gateways failed
  throw lastError;
}

/**
 * Check if all payments for a payroll are settled
 * Updates payroll status to completed, partially_completed, or failed
 */
export async function checkAndFinalizePayroll(payrollId) {
  const payroll = await Payroll.findById(payrollId);
  if (!payroll) return;

  const transactions = await PaymentTransaction.find({ payroll: payrollId });

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
      item.paymentStatus = transaction.status === "success" ? "paid" : "failed";
      if (transaction.status === "success") {
        item.paymentDate = transaction.paidAt;
        item.paymentReference = transaction.paymentReference;
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
 */
const worker = new Worker(
  "payroll-payments",
  async (job) => {
    const { transactionId } = job.data;

    const transaction = await PaymentTransaction.findById(transactionId);

    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    transaction.attemptCount += 1;
    transaction.lastAttemptAt = new Date();
    transaction.status = "processing";
    await transaction.save();

    try {
      const result = await disburseSinglePayment(transaction);

      transaction.gatewayTransferId = result.transferId;
      transaction.gatewayMessage = result.message;
      transaction.gateway = result.gateway;
      await transaction.save();
    } catch (gatewayError) {
      transaction.gatewayMessage = gatewayError.message;

      if (transaction.attemptCount >= transaction.maxRetries) {
        transaction.status = "failed";
        transaction.failureReason = `Failed after ${transaction.maxRetries} attempts across all gateways. Last error: ${gatewayError.message}`;
        await transaction.save();

        await checkAndFinalizePayroll(transaction.payroll);
      } else {
        transaction.status = "pending";
        await transaction.save();
      }

      throw gatewayError;
    }
  },
  {
    connection,
    concurrency: 5,
  }
);

worker.on("completed", (job) => {
  console.log(`Payment job ${job.id} completed — awaiting confirmation`);
});

worker.on("failed", (job, error) => {
  console.error(`Payment job ${job.id} failed: ${error.message}`);
});

worker.on("error", (error) => {
  console.error("Worker error:", error);
});

export default worker;