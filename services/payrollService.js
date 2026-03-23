import mongoose from "mongoose";
import Payroll from "../models/payrollModel.js";
import Employee from "../models/employeeModel.js";
import Company from "../models/companyModel.js";
import Financing from "../models/financingModel.js";
import Audit from "../models/auditModel.js";
import taxCalculationService from "./taxCalculationService.js";

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
      // Check if payroll already exists for this period
      const existingPayroll = await Payroll.findOne({
        company: companyId,
        "payrollPeriod.month": month,
        "payrollPeriod.year": year,
      });

      if (existingPayroll) {
        const error = new Error(
          // readable month name instead of 2/2026 — BRD Check 4
          `Payroll already exists for ${getMonthName(month)} ${year}`
        );
        error.statusCode = 400;
        throw error;
      }

      // Check 6: Company bank details — BRD 3.5
      // Not a hard error — just a warning returned alongside the created payroll
      // Only relevant if company wants to use financing for payroll
      const bankWarning = !company.bankDetails?.accountNumber
          ? "Add bank details to your company profile to use the financing option"
          : null;


      // Create draft payroll
      const payroll = await Payroll.create({
        company: companyId,
        createdBy: userId,
        currency: company.baseCurrency,
        payrollPeriod: { month, year },
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
          period: `${getMonthName(month)} ${year}`,
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
        const calculation = taxCalculationService.calculateEmployeePayroll({
          grossSalary: employee.salary.amount,
          currency: employee.salary.currency,
          allowances: [],
          bonuses: 0,
          otherDeductions: [],
        });

        payrollItems.push({
          employee: employee._id,
          baseSalary: employee.salary.amount,
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
      }).populate("company")
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

      // Update status
      payroll.status = "processing";
      payroll.processedBy = userId;
      payroll.processedAt = new Date();

      // Update payment status for each item
      payroll.payrollItems.forEach((item) => {
        item.paymentStatus = "processing";
        item.paymentDate = new Date();
        // In production, generate actual payment reference from payment gateway
        item.paymentReference = `PAY-${Date.now()}-${Math.random()
          .toString(36)
          .substr(2, 9)}`;
      });

      await payroll.save({session});

        // 4️⃣ Log audit inside session
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
        },
        status: "success",
        severity: "high",
      },
      session
    );

      // TODO: Integrate with payment gateway to disburse funds
      // For MVP, we'll simulate successful payment
    await this.completePayrollProcessing(payrollId, companyId, userId, session);

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

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
}

export default new PayrollService();
