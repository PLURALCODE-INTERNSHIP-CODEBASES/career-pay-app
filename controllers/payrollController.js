import Employee from "../models/employeeModel.js";
import payrollService from "../services/payrollService.js";
import taxCalculationService from "../services/taxCalculationService.js";
import PaymentTransaction from "../models/paymentTransactionModel.js";
import emailService from "../services/emailService.js";
import { checkAndFinalizePayroll } from "../services/paymentWorker.js";
import crypto from "crypto";

class PayrollController {
  /**
   * Create new payroll run
   * POST /api/payroll
   */
  async createPayroll(req, res) {
    try {
      const companyId = req.user.company;
      const userId = req.user.id;
      const month = parseInt(req.body.month);
      const year = parseInt(req.body.year);

      if (!month || !year) {
        return res.status(400).json({
          success: false,
          message: "Month and year are required",
        });
      }

      if (month < 1 || month > 12) {
        return res.status(400).json({
          success: false,
          message: "Invalid month. Must be between 1 and 12",
        });
      }

      // validate year is realistic — BRD PAY-004
      const currentYear = new Date().getFullYear();
      if (year < 2000 || year > currentYear) {
        return res.status(400).json({
          success: false,
          message: `Invalid year. Must be between 2000 and ${currentYear}`,
        });
      }

      // cannot create payroll for a future month — BRD PAY-005
      const currentMonth = new Date().getMonth() + 1; // getMonth() is 0-indexed
      if (year > currentYear || (year === currentYear && month > currentMonth)) {
        return res.status(400).json({
          success: false,
          message: "Cannot create payroll for future months",
        });
      }
 

      const { payroll, bankWarning } = await payrollService.createPayroll(
        companyId,
        month,
        year,
        userId
      );

      res.status(201).json({
        success: true,
        message: "Payroll created successfully",
        // include bank warning if company has no bank details — BRD Check 6
        ...(bankWarning && { warning: bankWarning }),
        data: payroll,
      });
    } catch (error) {
      console.error("Create payroll error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to create payroll",
      });
    }
  }

  /**
   * Calculate payroll for all employees
   * POST /api/payroll/:id/calculate
   */
  async calculatePayroll(req, res) {
    try {
      const companyId = req.user.company;
      const userId = req.user.id;
      const { id } = req.params;

      const payroll = await payrollService.calculatePayroll(
        id,
        companyId,
        userId
      );

      res.status(200).json({
        success: true,
        message: "Payroll calculated successfully",
        data: payroll,
      });
    } catch (error) {
      console.error("Calculate payroll error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to calculate payroll",
      });
    }
  }

  /**
   * Approve payroll
   * POST /api/payroll/:id/approve
   */
  async approvePayroll(req, res) {
    try {
      const companyId = req.user.company;
      const userId = req.user.id;
      const { id } = req.params;

      // Check if user has permission to approve
      if (req.user.role !== "founder" && req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          message: "Only founders and admins can approve payroll",
        });
      }

      const payroll = await payrollService.approvePayroll(
        id,
        companyId,
        userId
      );

      res.status(200).json({
        success: true,
        message: "Payroll approved successfully",
        data: payroll,
      });
    } catch (error) {
      console.error("Approve payroll error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to approve payroll",
      });
    }
  }

  /**
   * Process payroll payment
   * POST /api/payroll/:id/process
   */
  async processPayroll(req, res) {
    try {
      const companyId = req.user.company;
      const userId = req.user.id;
      const { id } = req.params;
      const { useFinancing } = req.body;

      // Check if user has permission to process
      if (req.user.role !== "founder" && req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          message: "Only founders and admins can process payroll",
        });
      }

      const payroll = await payrollService.processPayroll(
        id,
        companyId,
        userId,
        useFinancing
      );

      res.status(200).json({
        success: true,
        message: "Payroll processing initiated",
        data: payroll,
      });
    } catch (error) {
      console.error("Process payroll error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to process payroll",
      });
    }
  }

  /**
   * Get payroll by ID
   * GET /api/payroll/:id
   */
  async getPayrollById(req, res) {
    try {
      const companyId = req.user.company;
      const { id } = req.params;

      const payroll = await payrollService.getPayrollById(id, companyId);

      res.status(200).json({
        success: true,
        data: payroll,
      });
    } catch (error) {
      console.error("Get payroll error:", error);
      res.status(404).json({
        success: false,
        message: error.message || "Payroll not found",
      });
    }
  }

  /**
   * Get all payrolls for company
   * GET /api/payroll
   */
  async getAllPayrolls(req, res) {
    try {
      const companyId = req.user.company;
      const filters = {
        year: req.query.year,
        month: req.query.month,
        status: req.query.status,
        page: req.query.page,
        limit: req.query.limit
      };

      const result = await payrollService.getCompanyPayrolls(
        companyId,
        filters
      );

      res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      console.error("Get payrolls error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch payrolls",
      });
    }
  }

  /**
   * Get employee payslip
   * GET /api/payroll/:id/payslip/:employeeId
   */
  async getPayslip(req, res) {
    try {
      const companyId = req.user.company;
      const { id, employeeId } = req.params;

      // If employee, can only view their own payslip
      if (req.user.role === "employee") {
        const employeeRecord = await Employee.findOne({
          user: req.user.id,
          company: companyId,
        });

        if (!employeeRecord || employeeRecord._id.toString() !== employeeId) {
          return res.status(403).json({
            success: false,
            message: "You can only view your own payslip",
          });
        }
      }

      const payslip = await payrollService.getEmployeePayslip(
        id,
        employeeId,
        companyId
      );

      res.status(200).json({
        success: true,
        data: payslip,
      });
    } catch (error) {
      console.error("Get payslip error:", error);
      res.status(404).json({
        success: false,
        message: error.message || "Payslip not found",
      });
    }
  }

  /**
   * Export payroll data
   * GET /api/payroll/:id/export
   */
  async exportPayroll(req, res) {
    try {
      const companyId = req.user.company;
      const userId = req.user.id;
      const { id } = req.params;

      const exportData = await payrollService.exportPayroll(
        id,
        companyId,
        userId
      );

      res.status(200).json({
        success: true,
        data: exportData,
        message: "Payroll data exported successfully",
      });
    } catch (error) {
      console.error("Export payroll error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to export payroll",
      });
    }
  }

  /**
   * Get payroll statistics
   * GET /api/payroll/stats
   */
  async getPayrollStats(req, res) {
    try {
      const companyId = req.user.company;
      const year = parseInt(req.query.year) || new Date().getFullYear();
      const stats = await payrollService.getPayrollStats(companyId, year);

      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error("Get payroll stats error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch payroll statistics",
      });
    }
  }

  /**
   * Calculate tax estimate for an amount
   * CALCULATION ONLY — reads input, returns estimate, saves nothing to database
   * POST /api/payroll/tax-estimate
   */
  async getTaxEstimate(req, res) {
    try {
      const { annualIncome } = req.body;

      if (!annualIncome || annualIncome <= 0) {
        return res.status(400).json({
          success: false,
          message: "Valid annual income is required",
        });
      }

      const estimate = taxCalculationService.estimateTax(annualIncome);

      res.status(200).json({
        success: true,
        data: estimate,
      });
    } catch (error) {
      console.error("Tax estimate error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to calculate tax estimate",
      });
    }
  }

  /**
   * Get tax breakdown by band
   * CALCULATION ONLY — reads input, returns breakdown, saves nothing to database
   * POST /api/payroll/tax-breakdown
   */
  async getTaxBreakdown(req, res) {
    try {
      const { annualGross } = req.body;

      if (!annualGross || annualGross <= 0) {
        return res.status(400).json({
          success: false,
          message: "Valid annual gross income is required",
        });
      }

      const breakdown = taxCalculationService.getTaxBandBreakdown(annualGross);

      res.status(200).json({
        success: true,
        data: breakdown,
      });
    } catch (error) {
      console.error("Tax breakdown error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to calculate tax breakdown",
      });
    }
  }

  /**
   * Get current month payroll or create draft
   * GET /api/payroll/current
   */
  async getCurrentPayroll(req, res) {
    try {
      const companyId = req.user.company;
      const userId = req.user.id;
      const currentDate = new Date();
      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();

      const result = await payrollService.getCompanyPayrolls(companyId, {
        month,
        year,
      });

      // If no payroll exists, create a draft
      let payroll;
      if (!result.data || result.data.length === 0) {
        const created = await payrollService.createPayroll(
          companyId,
          month,
          year,
          userId
        );
        payroll = created.payroll;
      } else {
        payroll = result.data[0];
      }

      res.status(200).json({
        success: true,
        data: payroll,
      });
    } catch (error) {
      console.error("Get current payroll error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch current payroll",
      });
    }
  }

  /**
 * Correct a specific employee's payroll item
 * PATCH /api/payroll/:id/items/:employeeId
 */
  async correctPayrollItem(req, res) {
    try {
      const companyId = req.user.company;
      const userId = req.user.id;
      const { id, employeeId } = req.params;

      const { bonus, overtime, allowances, otherDeductions } = req.body;

      // At least one correction field must be provided
      if (
        bonus === undefined &&
        overtime === undefined &&
        allowances === undefined &&
        otherDeductions === undefined
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Provide at least one field to correct: bonus, overtime, allowances, or otherDeductions",
        });
      }

      // Validate numeric fields
      if (bonus !== undefined && (typeof bonus !== "number" || bonus < 0)) {
        return res.status(400).json({
          success: false,
          message: "bonus must be a non-negative number",
        });
      }

      if (overtime !== undefined && (typeof overtime !== "number" || overtime < 0)) {
        return res.status(400).json({
          success: false,
          message: "overtime must be a non-negative number",
        });
      }

      const payroll = await payrollService.correctPayrollItem(
        id,
        companyId,
        employeeId,
        { bonus, overtime, allowances, otherDeductions },
        userId
      );

      res.status(200).json({
        success: true,
        message: "Payroll item corrected successfully. Payroll reset to draft for review.",
        data: payroll,
      });
    } catch (error) {
      console.error("Correct payroll item error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to correct payroll item",
      });
    }
  }

  /**
   * Add compensation(bonus,allowance,overtime) to payroll items before calculation
   * PATCH /api/payroll/:id/compensation
   */
  async addPayrollCompensation(req, res) {
    try {
      const companyId = req.user.company;
      const userId = req.user.id;
      const { id } = req.params;
      const compensationItems = req.body;

      // Must be an array
      if (!Array.isArray(compensationItems) || compensationItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Request body must be a non-empty array of compensation items",
        });
      }

      // Validate each item
      for (const item of compensationItems) {
        if (!item.employeeId) {
          return res.status(400).json({
            success: false,
            message: "Each item must have an employeeId",
          });
        }

        if (
          item.bonus === undefined &&
          item.overtime === undefined &&
          item.allowances === undefined
        ) {
          return res.status(400).json({
            success: false,
            message: `Employee ${item.employeeId}: provide at least one of bonus, overtime, or allowances`,
          });
        }

        if (item.bonus !== undefined && (typeof item.bonus !== "number" || item.bonus < 0)) {
          return res.status(400).json({
            success: false,
            message: `Employee ${item.employeeId}: bonus must be a non-negative number`,
          });
        }

        if (item.overtime !== undefined && (typeof item.overtime !== "number" || item.overtime < 0)) {
          return res.status(400).json({
            success: false,
            message: `Employee ${item.employeeId}: overtime must be a non-negative number`,
          });
        }

        if (item.allowances !== undefined && !Array.isArray(item.allowances)) {
          return res.status(400).json({
            success: false,
            message: `Employee ${item.employeeId}: allowances must be an array`,
          });
        }
      }

      const result = await payrollService.addPayrollCompensation(
        id,
        companyId,
        compensationItems,
        userId
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Some employees could not be updated",
          errors: result.errors,
        });
      }

      res.status(200).json({
        success: true,
        message: "Compensation added successfully. You can now calculate payroll.",
        data: result.payroll,
      });
    } catch (error) {
      console.error("Add payroll compensation error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to add compensation",
      });
    }
  }

  /**
   * Get all payment transactions for a payroll
   * GET /api/payroll/:id/transactions
   */
  async getPayrollTransactions(req, res) {
    try {
      const companyId = req.user.company;
      const { id } = req.params;
      const { status } = req.query;

      const query = { company: companyId, payroll: id };
      if (status) query.status = status;

      const PaymentTransaction = (
        await import("../models/paymentTransactionModel.js")
      ).default;

      const transactions = await PaymentTransaction.find(query)
        .populate("employee", "employeeId bankDetails")
        .populate({
          path: "employee",
          populate: { path: "user", select: "firstName lastName" },
        })
        .sort({ createdAt: -1 })
        .lean();

      // Summary counts
      const summary = {
        total: transactions.length,
        success: transactions.filter((t) => t.status === "success").length,
        failed: transactions.filter((t) => t.status === "failed").length,
        pending: transactions.filter((t) => t.status === "pending").length,
        processing: transactions.filter((t) => t.status === "processing")
          .length,
      };

      res.status(200).json({
        success: true,
        data: { summary, transactions },
      });
    } catch (error) {
      console.error("Get transactions error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch transactions",
      });
    }
  }

  /**
   * Get all payment transactions for a company (tracking page)
   * GET /api/payroll/transactions
   */
  async getAllTransactions(req, res) {
    try {
      const companyId = req.user.company;
      const { status, payrollId, employeeId, page, limit } = req.query;

      const query = { company: companyId };
      if (status) query.status = status;
      if (payrollId) query.payroll = payrollId;
      if (employeeId) query.employee = employeeId;

      const pageNum = parseInt(page) || 1;
      const limitNum = Math.min(parseInt(limit) || 20, 100);
      const skip = (pageNum - 1) * limitNum;

      const PaymentTransaction = (
        await import("../models/paymentTransactionModel.js")
      ).default;

      const [transactions, total] = await Promise.all([
        PaymentTransaction.find(query)
          .populate({
            path: "employee",
            select: "employeeId bankDetails",
            populate: { path: "user", select: "firstName lastName" },
          })
          .populate("payroll", "payrollPeriod status")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        PaymentTransaction.countDocuments(query),
      ]);

      const summary = {
        total: transactions.length,
        success: transactions.filter((t) => t.status === "success").length,
        failed: transactions.filter((t) => t.status === "failed").length,
        pending: transactions.filter((t) => t.status === "pending").length,
        processing: transactions.filter((t) => t.status === "processing")
          .length,
      };

      res.status(200).json({
        success: true,
        data: {
          summary,
          transactions,
        },
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      console.error("Get all transactions error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch transactions",
      });
    }
  }

  /**
   * Handle Flutterwave webhook
   * POST /api/payroll/payment-webhook
   * Handles both payroll transfer events and subscription charge events
   */
  async handlePaymentWebhook(req, res) {
    try {
      // Step 1 — Verify webhook is from Flutterwave
      const flutterwaveHash = req.headers["verif-hash"];

      if (
        !flutterwaveHash ||
        flutterwaveHash !== process.env.FLUTTERWAVE_WEBHOOK_HASH
      ) {
        return res.status(401).json({
          success: false,
          message: "Invalid webhook signature",
        });
      }

      const event = req.body;
      const eventType = event.event;

      // Step 2 — Route to correct handler based on event type
      // charge.completed = subscription payment (company pays for module)
      // transfer.completed = payroll payment (employee receives salary)
      if (eventType === "charge.completed") {
        await handleSubscriptionWebhook(event.data);
      } else if (eventType === "transfer.completed") {
        await handlePayrollTransferWebhook(event.data);
      }
      // All other event types — acknowledge and ignore

      // Always return 200 — tells Flutterwave we received it
      return res.status(200).json({ received: true });
    } catch (error) {
      console.error("Payment webhook error:", {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data, // 
      });
      // Still return 200 — prevent Flutterwave from retrying on our internal errors
      return res.status(200).json({ received: true });
    }
  }

  // Handle Monnify webhook
  async handleMonnifyWebhook(req, res) {
  try {
     const signature = req.headers["monnify-signature"];

    if (!signature || !verifyMonnifySignature(req.body, signature)) {
      return res.status(401).json({
        success: false,
        message: "Invalid webhook signature",
      });
    }
    
    const event = req.body;
    const eventType = event.eventType;

    if (eventType === "SUCCESSFUL_DISBURSEMENT") {
      const { reference } = event.eventData;
      
      const transaction = await PaymentTransaction.findOne({
        paymentReference: reference,
      });

      if (!transaction) {
        console.log(`No transaction found for Monnify reference: ${reference}`);
        return res.status(200).json({ received: true });
      }

      if (["success", "failed"].includes(transaction.status)) {
        return res.status(200).json({ received: true });
      }

      transaction.status = "success";
      transaction.paidAt = new Date();
      transaction.gatewayMessage = "Transfer successful via Monnify";
      await transaction.save();

      await payrollService.markPayrollItemPaid(
        transaction.payroll,
        transaction.employee,
        reference
      );

      await checkAndFinalizePayroll(transaction.payroll);

        setImmediate(async () => {
        try {
          const Payroll = (await import("../models/payrollModel.js")).default;

          const payroll = await Payroll.findById(transaction.payroll);

          const payrollItem = payroll?.payrollItems.find(
            (item) =>
              item.employee.toString() === transaction.employee.toString()
          );

          const employee = await Employee.findById(
            transaction.employee
          ).populate("user", "firstName lastName email");

          if (employee?.user?.email && payrollItem) {
            await emailService.sendPayslipEmail(
              {
                firstName: employee.user.firstName,
                email: employee.user.email,
              },
              payrollItem,
              payroll.currency
            );
          }
        } catch (emailError) {
          console.error(
            `Payslip email failed for employee ${transaction.employee}:`,
            emailError.message
          );
        }
      });

    } else if (eventType === "FAILED_DISBURSEMENT") {
      const { reference } = event.eventData;

      const transaction = await PaymentTransaction.findOne({
        paymentReference: reference,
      });

      if (!transaction || ["success", "failed"].includes(transaction.status)) {
        return res.status(200).json({ received: true });
      }

      transaction.status = "failed";
      transaction.failureReason = event.eventData.responseMessage || "Transfer failed via Monnify";
      transaction.gatewayMessage = event.eventData.responseMessage;
      await transaction.save();

      await checkAndFinalizePayroll(transaction.payroll);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Monnify webhook error:", error.message);
    return res.status(200).json({ received: true });
  }
}

   /**
 * Retry failed payments for a partially completed or failed payroll
 * POST /api/payroll/:id/retry-failed
 */
  async retryFailedPayments(req, res) {
    try {
      const companyId = req.user.company;
      const userId = req.user.id;
      const { id } = req.params;

      // Only founders and admins can retry payments
      if (req.user.role !== "founder" && req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          message: "Only founders and admins can retry failed payments",
        });
      }

      const result = await payrollService.retryFailedPayments(
        id,
        companyId,
        userId
      );

      return res.status(200).json({
        success: true,
        message: `Retrying ${result.retriedCount} failed payment(s). Check the tracking page for updates.`,
        data: result.payroll,
      });
    } catch (error) {
      console.error("Retry failed payments error:", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to retry payments",
      });
    }
  }
}

/**
 * Handle subscription charge webhook
 * Fires when a company successfully pays for a module
 */
async function handleSubscriptionWebhook(data) {
  try {
    const { tx_ref, status, id, meta } = data;

    // Only process successful charges
    if (status !== "successful") return;

    // Must be a subscription payment — check meta type
    if (!meta || meta.type !== "subscription") return;

    // Check if already activated — Flutterwave can send same webhook twice
    const existing = await (
      await import("../models/subscriptionModel.js")
    ).default.findOne({ paymentReference: tx_ref });

    if (existing) return;

    const subscriptionService = (
      await import("../services/subscriptionService.js")
    ).default;

    // Activate subscription
    await subscriptionService.activateSubscription({
      companyId: meta.companyId,
      module: meta.module,
      usdAmount: meta.usdAmount,
      ngnAmount: meta.ngnAmount,
      exchangeRate: meta.exchangeRate,
      currency: meta.currency,
      reference: tx_ref,
      transactionId: id.toString(),
      userId: meta.userId,
    });

    console.log(`Subscription activated via webhook: ${meta.module} for company ${meta.companyId}`);
  } catch (error) {
    console.error("Subscription webhook handler error:", error.message);
    throw error;
  }
}

/**
 * Handle payroll flutterwave transfer webhook
 * Fires when Flutterwave completes a salary transfer to an employee
 */
async function handlePayrollTransferWebhook(data) {
  try {
    const { reference, status, complete_message } = data;

    const cleanReference = reference
      .replace(/_PMCK_ST_F$/, "")  
      .replace(/_PMCK$/, "")        
      .replace(/-\d+$/, ""); 

    // Find our transaction record
    const transaction = await PaymentTransaction.findOne({
      paymentReference: cleanReference,
    });

    if (!transaction) {
      console.log(`No transaction found for reference: ${cleanReference} (raw: ${reference})`);
      return;
    }

    // Prevent duplicate processing
    if (["success", "failed"].includes(transaction.status)) return;

    if (status === "SUCCESSFUL") {
      transaction.status = "success";
      transaction.paidAt = new Date();
      transaction.gatewayMessage = "Transfer successful";
      await transaction.save();

      // Mark payroll item as paid
      await payrollService.markPayrollItemPaid(
        transaction.payroll,
        transaction.employee,
        cleanReference
      );

      // Send payslip email — outside main flow so email failure never blocks webhook
      setImmediate(async () => {
        try {
          const Payroll = (await import("../models/payrollModel.js")).default;

          const payroll = await Payroll.findById(transaction.payroll);

          const payrollItem = payroll?.payrollItems.find(
            (item) =>
              item.employee.toString() === transaction.employee.toString()
          );

          const employee = await Employee.findById(
            transaction.employee
          ).populate("user", "firstName lastName email");

          if (employee?.user?.email && payrollItem) {
            await emailService.sendPayslipEmail(
              {
                firstName: employee.user.firstName,
                email: employee.user.email,
              },
              payrollItem,
              payroll.currency
            );
          }
        } catch (emailError) {
          console.error(
            `Payslip email failed for employee ${transaction.employee}:`,
            emailError.message
          );
        }
      });
    } else {
      // Transfer failed at bank level
      transaction.status = "failed";
      transaction.failureReason = complete_message || "Transfer failed at bank";
      transaction.gatewayMessage = complete_message;
      await transaction.save();
    }

    // Check if all payments for this payroll are now settled
    await checkAndFinalizePayroll(transaction.payroll);
  } catch (error) {
    console.error("Payroll transfer webhook handler error:", {
    message: error.message,
    status: error.response?.status,
    data: error.response?.data, // 
  });
    throw error;
  }
}

// Verify Monnify webhook signature
function verifyMonnifySignature(requestBody, signatureHeader) {
  const computedHash = crypto
    .createHmac("sha512", process.env.MONNIFY_SECRET_KEY)
    .update(JSON.stringify(requestBody))
    .digest("hex");

  return computedHash === signatureHeader;
}

export default new PayrollController();
