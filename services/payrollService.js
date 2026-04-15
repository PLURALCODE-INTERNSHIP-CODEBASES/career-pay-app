import mongoose from "mongoose";
import Payroll from "../models/payrollModel.js";
import Employee from "../models/employeeModel.js";
import Company from "../models/companyModel.js";
import Financing from "../models/financingModel.js";
import Audit from "../models/auditModel.js";
import taxCalculationService from "./taxCalculationService.js";
import emailService from "./emailService.js";

// Helper: converts month number to readable name
// e.g. 2 → "February", 12 → "December"
// Used for the duplicate payroll error message — BRD Check 4
function getMonthName(month) {
  return new Date(2000, month - 1, 1).toLocaleString("default", {
    month: "long",
  });
}

class PayrollService {
  /**
   * Create a new payroll run
   */
  async createPayroll(companyId, month, year, userId) {
    try {
      // Company settings complete — BRD 3.5
      // baseCurrency and payFrequency must be set before payroll can be created
      const company = await Company.findById(companyId).select(
        "baseCurrency payrollSettings bankDetails name"
      );
 
      if (!company) {
        throw new Error("Company not found");
      }
 
      if (!company.baseCurrency || !company.payrollSettings?.payFrequency) {
        const error = new Error(
          "Complete company settings before creating payroll"
        );
        error.statusCode = 400;
        throw error;
      }
 
      // Active employees exist — BRD 3.5 
      // Cannot create payroll if there are no active employees to pay
      const activeEmployeeCount = await Employee.countDocuments({
        company: companyId,
        isActive: true,
      });
 
      if (activeEmployeeCount === 0) {
        const error = new Error(
          "Cannot create payroll with no active employees"
        );
        error.statusCode = 400;
        throw error;
      }

      const maxPeriodsPerMonth = {
        monthly: 1,
        "bi-weekly": 2,
        weekly: 4,
      };

      const payFrequency = company.payrollSettings?.payFrequency || "monthly";
      const maxPeriods = maxPeriodsPerMonth[payFrequency];

      // Count existing payrolls for this month
      const existingCount = await Payroll.countDocuments({
        company: companyId,
        "payrollPeriod.month": month,
        "payrollPeriod.year": year,
      });

      if (existingCount >= maxPeriods) {
        const error = new Error(
          payFrequency === "monthly"
            ? `Payroll already exists for ${getMonthName(month)} ${year}`
            : `Maximum payroll runs for ${getMonthName(month)} ${year} reached. Your pay frequency allows ${maxPeriods} payroll runs per month.`
        );
        error.statusCode = 400;
        throw error;
      }

      // Set period number for this payroll
      const periodNumber = existingCount + 1;

      // Check : Company bank details — BRD 3.5
      // Not a hard error — just a warning returned alongside the created payroll
      // Only relevant if company wants to use financing for payroll
      const bankWarning = !company.bankDetails?.accountNumber
          ? "Add bank details to your company profile to use the financing option"
          : null;

      const payroll = await Payroll.create({
        company: companyId,
        createdBy: userId,
        currency: company.baseCurrency,
        payrollPeriod: { month, year, periodNumber },
        status: "draft",
      });

      // Log audit
      await Audit.log({
        company: companyId,
        user: userId,
        action: "payroll_created",
        module: "payroll",
        resourceType: "payroll",
        resourceId: payroll._id,
        details: {
          month,
          year,
          periodNumber,
          period: `${getMonthName(month)} ${year} - Period ${periodNumber}`,
          activeEmployees: activeEmployeeCount,
        },
        status: "success",
        severity: "medium",
      });

      // Return payroll and bank warning together
      return {payroll, bankWarning};
    } catch (error) {
      throw error;
    }
  }

  /**
   * Calculate payroll for all active employees
   */
  async calculatePayroll(payrollId, companyId, userId) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

       const payroll = await Payroll.findOne({
        _id: payrollId,
        company: companyId,
      }).session(session);

      if (!payroll) {
        throw new Error("Payroll not found");
      }

      if (payroll.status !== "draft") {
        throw new Error("Payroll can only be calculated when in draft status");
      }

      // Get all active employees — include start date for PAY-012
      // PAY-012: only include employees whose start date is on or before this period
      const periodEndDate = new Date(
        payroll.payrollPeriod.year,
        payroll.payrollPeriod.month - 1, // month is 0-indexed in Date
        1
      );

      // Get all active employees
      const employees = await Employee.find({
        company: companyId,
        isActive: true,
        startDate: { $lte: periodEndDate }, // PAY-012: exclude employees who started after this period
      }).session(session)
        .populate("user", "firstName lastName email");

      if (employees.length === 0) {
        throw new Error("No active employees found");
      }

      // Calculate payroll for each employee
      const payrollItems = [];
        for (const employee of employees) {
          // Check if HR already entered compensation for this employee
          // during the optional PATCH /api/payroll/:id/compensation step
        const existingItem = payroll.payrollItems.find(
          (i) => i.employee.toString() === employee._id.toString()
        );

          // Check if employee needs pro-rating — mid-month joiner or leaver
        const proration = taxCalculationService.getProrationDetails(
          employee,
          payroll.payrollPeriod.month,
          payroll.payrollPeriod.year
        );

        // Pro-rate base salary if needed
        const effectiveBaseSalary = proration.isProrated
          ? taxCalculationService.calculateProration(
              employee.salary.amount,
              proration.daysInMonth,
              proration.daysWorked
            )
          : employee.salary.amount;

           // Read allowances entered by HR — pro-rate each one if employee is mid-month joiner/leaver
        const effectiveAllowances = (existingItem?.additions?.allowances || []).map((a) => ({
          ...a,
          amount: proration.isProrated
            ? taxCalculationService.calculateProration(
                a.amount,
                proration.daysInMonth,
                proration.daysWorked
              )
            : a.amount,
        }));


        // Bonus and overtime are NOT pro-rated — full amount or 0
        const effectiveBonus = existingItem?.additions?.bonus || 0;
        const effectiveOvertime = existingItem?.additions?.overtime || 0;

        const calculation = taxCalculationService.calculateEmployeePayroll({
          grossSalary: effectiveBaseSalary,
          currency: employee.salary.currency,
          allowances: effectiveAllowances,
          bonuses: effectiveBonus,
          otherDeductions: existingItem?.deductions?.otherDeductions || [],
          taxRelief: employee.taxInformation?.taxRelief || null,
        });

        payrollItems.push({
          employee: employee._id,
          baseSalary: effectiveBaseSalary,
          grossSalary: calculation.grossSalary,
          deductions: {
            tax: calculation.deductions.tax,
            pension: calculation.deductions.pension,
            nhf: calculation.deductions.nhf,
            otherDeductions: calculation.deductions.otherDeductions,
          },
          additions: {
            bonus: calculation.additions.bonuses,
            allowances: calculation.additions.allowances,
            overtime: 0,
          },
          employerContributions: {
            pension: calculation.employerContributions.pension,
            nhis: calculation.employerContributions.nhis,
            itf: calculation.employerContributions.itf,
            nsitf: calculation.employerContributions.nsitf,
          },
          netSalary: calculation.netSalary,
          paymentStatus: "pending",
          prorationDetails: {
            isProrated: proration.isProrated,
            daysWorked: proration.isProrated ? proration.daysWorked : null,
            daysInMonth: proration.isProrated ? proration.daysInMonth : null,
            note: proration.isProrated ? proration.prorationNote : null,
        },
      });
      }

      // Calculate summary
      payroll.payrollItems = payrollItems;
      payroll.summary = {
        totalGross: payrollItems.reduce(
          (sum, item) => sum + item.grossSalary,
          0
        ),
        totalDeductions: payrollItems.reduce(
          (sum, item) =>
            sum +
            item.deductions.tax +
            item.deductions.pension +
            item.deductions.nhf,
          0
        ),
        // ADDED: totalAdditions was missing from summary — BRD 3.4
        totalAdditions: payrollItems.reduce(
          (sum, item) =>
            sum +
            item.additions.bonus +
            item.additions.overtime +
            item.additions.allowances.reduce(
              (aSum, a) => aSum + (a.amount || 0),
              0
            ),
          0
        ),
        totalNet: payrollItems.reduce((sum, item) => sum + item.netSalary, 0),
        totalEmployerContributions: payrollItems.reduce(
          (sum, item) =>
            sum +
            item.employerContributions.pension +
            item.employerContributions.nhis +
            item.employerContributions.itf +
            item.employerContributions.nsitf,
          0
        ),
        totalEmployees: payrollItems.length,
      };

      // Update payroll
      payroll.status = "calculated";
      await payroll.save({ session });

      // Log audit
      await Audit.log({
        company: companyId,
        user: userId,
        action: "payroll_calculated",
        module: "payroll",
        resourceType: "payroll",
        resourceId: payroll._id,
        details: {
          month: payroll.payrollPeriod.month,
          year: payroll.payrollPeriod.year,
          totalEmployees: payroll.summary.totalEmployees,
          totalNet: payroll.summary.totalNet,
        },
        status: "success",
        severity: "medium",
        metadata: {
          affectedRecords: payroll.summary.totalEmployees,
        },
      }, session
    );

    await session.commitTransaction();
    session.endSession();

      return payroll;
    } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
  }

  /**
   * Approve payroll
   */
  async approvePayroll(payrollId, companyId, userId) {
    try {
      const payroll = await Payroll.findOne({
        _id: payrollId,
        company: companyId,
      });

      if (!payroll) {
        throw new Error("Payroll not found");
      }

      if (payroll.status !== "calculated") {
        throw new Error("Payroll must be calculated before approval");
      }

      payroll.status = "approved";
      payroll.approvedBy = userId;
      payroll.approvedAt = new Date();
      await payroll.save();

      // Log audit
      await Audit.log({
        company: companyId,
        user: userId,
        action: "payroll_approved",
        module: "payroll",
        resourceType: "payroll",
        resourceId: payroll._id,
        details: {
          month: payroll.payrollPeriod.month,
          year: payroll.payrollPeriod.year,
          totalAmount: payroll.summary.totalNet,
        },
        status: "success",
        severity: "high",
      });

      return payroll;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Process payroll payment
   */
  async processPayroll(payrollId, companyId, userId, useFinancing = false) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      const payroll = await Payroll.findOne({
        _id: payrollId,
        company: companyId,
      })
        .populate("company")
        .populate({
          path: "payrollItems.employee",
          select: "bankDetails salary user",
          populate: { path: "user", select: "firstName lastName email" },
        })
        .session(session);

      if (!payroll) {
        throw new Error("Payroll not found");
      }

      if (payroll.status !== "approved") {
        throw new Error("Payroll must be approved before processing");
      }

      // Check if financing is needed and available
      if (useFinancing) {
        const activeFinancing = await Financing.findOne({
          company: companyId,
          status: "active",
          outstandingBalance: { $gte: payroll.summary.totalNet },
        }).session(session);

        if (!activeFinancing) {
          throw new Error(
            "No active financing available with sufficient balance"
          );
        }

        payroll.financingUsed = activeFinancing._id;
      }

      // Update payroll status
      payroll.status = "processing";
      payroll.processedBy = userId;
      payroll.processedAt = new Date();

      // Update each item to processing
      payroll.payrollItems.forEach((item) => {
        item.paymentStatus = "processing";
      });

      await payroll.save({ session });

      // Log audit
      await Audit.log(
        {
          company: companyId,
          user: userId,
          action: "payroll_processed",
          module: "payroll",
          resourceType: "payroll",
          resourceId: payrollId,
          details: {
            month: payroll.payrollPeriod.month,
            year: payroll.payrollPeriod.year,
            totalEmployees: payroll.summary.totalEmployees,
            totalNet: payroll.summary.totalNet,
          },
          status: "success",
          severity: "high",
        },
        session
      );

      await session.commitTransaction();
      session.endSession();

      // Queue individual payment jobs for each employee
      // Done AFTER committing transaction so payroll is saved before jobs run
      const { paymentQueue } = await import("../config/paymentQueue.js");
      const PaymentTransaction = (
        await import("../models/paymentTransactionModel.js")
      ).default;

      for (const item of payroll.payrollItems) {
        const employee = item.employee;

        // Validate employee has bank details
        if (!employee?.bankDetails?.accountNumber) {
          console.warn(
            `Employee ${employee._id} has no bank details — skipping payment`
          );
          continue;
        }

        // Generate unique Flutterwave reference
        const flutterwaveReference = `PAY-${payrollId}-${employee._id}-${Date.now()}`;

        // Create transaction record
        const transaction = await PaymentTransaction.create({
          company: companyId,
          payroll: payrollId,
          employee: employee._id,
          amount: item.netSalary,
          currency: payroll.currency,
          bankDetails: {
            bankName: employee.bankDetails.bankName,
            bankCode: employee.bankDetails.bankCode,
            accountNumber: employee.bankDetails.accountNumber,
            accountName: employee.bankDetails.accountName,
          },
          status: "pending",
          flutterwaveReference,
          initiatedBy: userId,
        });

        // Add job to queue
        const job = await paymentQueue.add(
          "process-payment",
          { transactionId: transaction._id.toString() },
          {
            jobId: `payment-${transaction._id}`, // Unique job ID prevents duplicates
          }
        );

        // Save job ID to transaction for tracking
        transaction.queueJobId = job.id;
        await transaction.save();
      }

      return payroll;
    } catch (error) {
      await session.abortTransaction();
      session.endSession();

      // Mark payroll as failed
      await Payroll.findByIdAndUpdate(payrollId, { status: "failed" });

      await Audit.log({
        company: companyId,
        user: userId,
        action: "payroll_failed",
        module: "payroll",
        resourceType: "payroll",
        resourceId: payrollId,
        status: "failure",
        errorMessage: error.message,
        severity: "critical",
      });

      throw error;
    }
  }

  /**
   * Complete payroll processing (called after payment confirmation)
   */
  async completePayrollProcessing(payrollId, companyId, userId, session) {
    try {
      const payroll = await Payroll.findById(payrollId).session(session);

      if (!payroll) {
        throw new Error("Payroll not found");
      }

      // Mark all items as paid
      payroll.payrollItems.forEach((item) => {
        item.paymentStatus = "paid";
      });

      payroll.status = "completed";
      await payroll.save({session});

       // Send payslip email to each employee after committing
       // Done outside the session so email failures don't roll back the transaction
      // setImmediate(async () => {
      //   for (const item of payroll.payrollItems) {
      //     try {
      //       const employee = await Employee.findById(item.employee)
      //         .populate("user", "firstName lastName email");

      //       if (employee?.user?.email) {
      //         await emailService.sendPayslipEmail(
      //           {
      //             firstName: employee.user.firstName,
      //             email: employee.user.email,
      //           },
      //           item,
      //           payroll.currency  
      //         );
      //       }
      //     } catch (emailError) {
      //       console.error(
      //         `Payslip email failed for employee ${item.employee}:`,
      //         emailError.message
      //       );
      //     }
      //   }
      // });

      // Log audit
      await Audit.log({
        company: companyId,
        user: userId,
        action: "payroll_completed",
        module: "payroll",
        resourceType: "payroll",
        resourceId: payroll._id,
        details: {
          month: payroll.payrollPeriod.month,
          year: payroll.payrollPeriod.year,
          totalAmount: payroll.summary.totalNet,
          employeesPaid: payroll.summary.totalEmployees,
        },
        status: "success",
        severity: "high",
        metadata: {
          affectedRecords: payroll.summary.totalEmployees,
        },
      }, session
    );

      return payroll;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get payroll by ID
   */
  async getPayrollById(payrollId, companyId) {
    try {
      const payroll = await Payroll.findOne({
        _id: payrollId,
        company: companyId,
      })
        .populate(
          "payrollItems.employee",
          "user employeeId position department"
        )
        .populate("approvedBy", "firstName lastName email")
        .populate("processedBy", "firstName lastName email")
        .populate("createdBy", "firstName lastName email")
        .populate("financingUsed", "requestedAmount status");

      if (!payroll) {
        throw new Error("Payroll not found");
      }

      return payroll;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get all payrolls for a company
   */
  async getCompanyPayrolls(companyId, filters = {}) {
    try {
      const query = { company: companyId };
 
      if (filters.year) query["payrollPeriod.year"] = parseInt(filters.year);
      if (filters.month) query["payrollPeriod.month"] = parseInt(filters.month);
      if (filters.status) query.status = filters.status;
 
      // Pagination — consistent with employee module (max 100 per page)
      const page = parseInt(filters.page) || 1;
      const limit = Math.min(parseInt(filters.limit) || 20, 100);
      const skip = (page - 1) * limit;
 
      const [payrolls, total] = await Promise.all([
        Payroll.find(query)
          .sort({ "payrollPeriod.year": -1, "payrollPeriod.month": -1 })
          .select("payrollPeriod summary status currency approvedAt processedAt createdBy")
          .skip(skip)
          .limit(limit)
          .lean(),
        Payroll.countDocuments(query),
      ]);
 
      return {
        data: payrolls,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get employee payslip
   */
  async getEmployeePayslip(payrollId, employeeId, companyId) {
    try {
      const payroll = await Payroll.findOne({
        _id: payrollId,
        company: companyId,
      }).populate("company", "name email address logo");

      if (!payroll) {
        throw new Error("Payroll not found");
      }

      // Find employee's payroll item
      const payrollItem = payroll.payrollItems.find(
        (item) => item.employee.toString() === employeeId.toString()
      );

      if (!payrollItem) {
        throw new Error("Employee not found in this payroll");
      }

      // Get employee details
      const employee = await Employee.findById(employeeId).populate(
        "user",
        "firstName lastName email"
      );

      return {
        company: payroll.company,
        currency: payroll.currency,
        employee: {
          name: `${employee.user.firstName} ${employee.user.lastName}`,
          employeeId: employee.employeeId,
          position: employee.position,
          department: employee.department,
        },
        payrollPeriod: payroll.payrollPeriod,
        payslip: payrollItem,
        generatedDate: new Date(),
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Export payroll data
   */
  async exportPayroll(payrollId, companyId, userId) {
    try {
      const payroll = await Payroll.findOne({ _id: payrollId, company: companyId })
        .populate({
          path: "payrollItems.employee",   // populate employee inside payrollItems
          populate: {
            path: "user",                  // populate user inside employee
            select: "firstName lastName"
          }
        });

      if (!payroll) {
        throw new Error("Payroll not found");
      }

      // Log audit
      await Audit.log({
        company: companyId,
        user: userId,
        action: "payroll_exported",
        module: "payroll",
        resourceType: "payroll",
        resourceId: payrollId,
        status: "success",
        severity: "low",
      });

      // Format data for CSV export
      const exportData = payroll.payrollItems.map((item) => ({
        employeeId: item.employee.employeeId,
        name: `${item.employee.user.firstName} ${item.employee.user.lastName}`,
        position: item.employee.position,
        department: item.employee.department,
        baseSalary: item.baseSalary,
        grossSalary: item.grossSalary,
        tax: item.deductions.tax,
        pension: item.deductions.pension,
        nhf: item.deductions.nhf,
        netSalary: item.netSalary,
        currency: payroll.currency,
        paymentStatus: item.paymentStatus,
        paymentReference: item.paymentReference,
      }));

      return exportData;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get payroll statistics for dashboard
   */
  async getPayrollStats(companyId, year) {
    try {
      const payrolls = await Payroll.find({
        company: companyId,
        "payrollPeriod.year": year,
        status: "completed",
      }).lean();

      const stats = {
        totalPayrollRuns: payrolls.length,
        totalPaid: payrolls.reduce((sum, p) => sum + p.summary.totalNet, 0),
        totalEmployees:
          payrolls.length > 0 ? payrolls[0].summary.totalEmployees : 0,
        averageMonthlyPayroll: 0,
        monthlyBreakdown: [],
      };

      if (payrolls.length > 0) {
        stats.averageMonthlyPayroll = stats.totalPaid / payrolls.length;
      }

      // Monthly breakdown
      for (let month = 1; month <= 12; month++) {
        const monthPayroll = payrolls.find(
          (p) => p.payrollPeriod.month === month
        );
        stats.monthlyBreakdown.push({
          month,
          amount: monthPayroll ? monthPayroll.summary.totalNet : 0,
          status: monthPayroll ? monthPayroll.status : "not_run",
        });
      }

      return stats;
    } catch (error) {
      throw error;
    }
  }

  /**
 * Correct a specific employee's payroll item
 * Only allowed when payroll is in draft or calculated status
 */
  async correctPayrollItem(payrollId, companyId, employeeId, corrections, userId) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      const payroll = await Payroll.findOne({
        _id: payrollId,
        company: companyId,
      }).session(session);

      if (!payroll) {
        throw new Error("Payroll not found");
      }

      // Only allow corrections on draft or calculated payrolls
      if (!["draft", "calculated"].includes(payroll.status)) {
        throw new Error(
          "Corrections can only be made to payrolls in draft or calculated status"
        );
      }

      // Find the employee's payroll item
      const itemIndex = payroll.payrollItems.findIndex(
        (item) => item.employee.toString() === employeeId.toString()
      );

      if (itemIndex === -1) {
        throw new Error("Employee not found in this payroll");
      }

      const item = payroll.payrollItems[itemIndex];

      // Apply allowed corrections
      if (corrections.bonus !== undefined) {
        item.additions.bonus = corrections.bonus;
      }

      if (corrections.overtime !== undefined) {
        item.additions.overtime = corrections.overtime;
      }

      if (corrections.allowances !== undefined) {
        item.additions.allowances = corrections.allowances; // full replace
      }

      if (corrections.otherDeductions !== undefined) {
        item.deductions.otherDeductions = corrections.otherDeductions; // full replace
      }

      // Recalculate gross: baseSalary + bonus + overtime + allowances
      const totalAllowances = item.additions.allowances.reduce(
        (sum, a) => sum + (a.amount || 0),
        0
      );
      item.grossSalary =
        item.baseSalary +
        item.additions.bonus +
        item.additions.overtime +
        totalAllowances;

      // Recalculate tax, pension, NHF based on new gross
      const recalculated = taxCalculationService.calculateEmployeePayroll({
        grossSalary: item.grossSalary,
        currency: payroll.currency,
        allowances: item.additions.allowances,
        bonuses: item.additions.bonus,
        otherDeductions: item.deductions.otherDeductions,
      });

      item.deductions.tax = recalculated.deductions.tax;
      item.deductions.pension = recalculated.deductions.pension;
      item.deductions.nhf = recalculated.deductions.nhf;
      item.employerContributions = recalculated.employerContributions;
      item.netSalary = recalculated.netSalary;

      // Recalculate payroll summary
      payroll.summary.totalGross = payroll.payrollItems.reduce(
        (sum, i) => sum + i.grossSalary, 0
      );
      payroll.summary.totalDeductions = payroll.payrollItems.reduce(
        (sum, i) => sum + i.deductions.tax + i.deductions.pension + i.deductions.nhf, 0
      );
      payroll.summary.totalAdditions = payroll.payrollItems.reduce(
        (sum, i) =>
          sum +
          i.additions.bonus +
          i.additions.overtime +
          i.additions.allowances.reduce((aSum, a) => aSum + (a.amount || 0), 0),
        0
      );
      payroll.summary.totalNet = payroll.payrollItems.reduce(
        (sum, i) => sum + i.netSalary, 0
      );
      payroll.summary.totalEmployerContributions = payroll.payrollItems.reduce(
        (sum, i) =>
          sum +
          i.employerContributions.pension +
          i.employerContributions.nhis +
          i.employerContributions.itf +
          i.employerContributions.nsitf,
        0
      );

      // If payroll was calculated, reset to draft so it gets reviewed again
      if (payroll.status === "calculated") {
        payroll.status = "draft";
      }

      await payroll.save({ session });

      await Audit.log({
        company: companyId,
        user: userId,
        action: "payroll_item_corrected",
        module: "payroll",
        resourceType: "payroll",
        resourceId: payroll._id,
        details: {
          employeeId,
          corrections,
          month: payroll.payrollPeriod.month,
          year: payroll.payrollPeriod.year,
        },
        status: "success",
        severity: "medium",
      }, session);

      await session.commitTransaction();
      session.endSession();

      return payroll;
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  /**
   * Add compensation (bonus, overtime, allowances) to payroll items before calculation
   * PATCH /api/payroll/:id/compensation
   * Optional step — can be skipped if no compensation exists for the period
   */
  async addPayrollCompensation(payrollId, companyId, compensationItems, userId) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      const payroll = await Payroll.findOne({
        _id: payrollId,
        company: companyId,
      }).session(session);

      if (!payroll) {
        throw new Error("Payroll not found");
      }

      // Only allowed on draft payrolls — before calculation
      if (payroll.status !== "draft") {
        throw new Error(
          "Compensation can only be added to payrolls in draft status"
        );
      }

      // Get all active employees for this company to validate employeeIds
      const activeEmployeeIds = await Employee.find({
        company: companyId,
        isActive: true,
      })
        .select("_id")
        .session(session)
        .then((emps) => emps.map((e) => e._id.toString()));

      const errors = [];

      for (const item of compensationItems) {
        const { employeeId, bonus, overtime, allowances } = item;

        // Validate employee belongs to this company
        if (!activeEmployeeIds.includes(employeeId.toString())) {
          errors.push(`Employee ${employeeId} not found or not active`);
          continue;
        }

        // Find existing payroll item for this employee or create a placeholder
        let payrollItem = payroll.payrollItems.find(
          (i) => i.employee.toString() === employeeId.toString()
        );

        if (!payrollItem) {
          // Employee exists but payroll item not yet created — add placeholder
          // calculatePayroll will fill in salary and deductions
          payroll.payrollItems.push({
            employee: employeeId,
            baseSalary: 0,
            grossSalary: 0,
            netSalary: 0,
            additions: {
              bonus: bonus || 0,
              allowances: allowances || [],
              overtime: overtime || 0,
            },
            paymentStatus: "pending",
          });
        } else {
          // Update existing item additions
          if (bonus !== undefined) payrollItem.additions.bonus = bonus;
          if (overtime !== undefined) payrollItem.additions.overtime = overtime;
          if (allowances !== undefined) payrollItem.additions.allowances = allowances;
        }
      }

      // If any employee IDs were invalid, abort
      if (errors.length > 0) {
        await session.abortTransaction();
        session.endSession();
        return { success: false, errors };
      }

      await payroll.save({ session });

      await Audit.log({
        company: companyId,
        user: userId,
        action: "payroll_compensation_added",
        module: "payroll",
        resourceType: "payroll",
        resourceId: payroll._id,
        details: {
          month: payroll.payrollPeriod.month,
          year: payroll.payrollPeriod.year,
          employeesUpdated: compensationItems.length,
        },
        status: "success",
        severity: "medium",
      }, session);

      await session.commitTransaction();
      session.endSession();

      return { success: true, payroll };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  /**
   * Mark a specific payroll item as paid
   * Called from webhook handler after Flutterwave confirms transfer
   */
  async markPayrollItemPaid(payrollId, employeeId, paymentReference) {
    try {
      const payroll = await Payroll.findById(payrollId);
      if (!payroll) throw new Error("Payroll not found");

      const item = payroll.payrollItems.find(
        (i) => i.employee.toString() === employeeId.toString()
      );

      if (!item) throw new Error("Payroll item not found");

      item.paymentStatus = "paid";
      item.paymentDate = new Date();
      item.paymentReference = paymentReference;

      await payroll.save();
      return payroll;
    } catch (error) {
      throw error;
    }
  }
}

export default new PayrollService();
