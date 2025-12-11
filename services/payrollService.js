import Payroll from "../models/payrollModel.js";
import Employee from "../models/employeeModel.js";
import Company from "../models/companyModel.js";
import Financing from "../models/financingModel.js";
import Audit from "../models/auditModel.js";
import taxCalculationService from "./taxCalculationService.js";

class PayrollService {
  /**
   * Create a new payroll run
   */
  async createPayroll(companyId, month, year, userId) {
    try {
      // Check if payroll already exists for this period
      const existingPayroll = await Payroll.findOne({
        company: companyId,
        "payrollPeriod.month": month,
        "payrollPeriod.year": year,
      });

      if (existingPayroll) {
        throw new Error(`Payroll already exists for ${month}/${year}`);
      }

      // Create draft payroll
      const payroll = await Payroll.create({
        company: companyId,
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
        details: { month, year },
        status: "success",
        severity: "medium",
      });

      return payroll;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Calculate payroll for all active employees
   */
  async calculatePayroll(payrollId, companyId, userId) {
    try {
      const payroll = await Payroll.findOne({
        _id: payrollId,
        company: companyId,
      });

      if (!payroll) {
        throw new Error("Payroll not found");
      }

      if (payroll.status !== "draft") {
        throw new Error("Payroll can only be calculated when in draft status");
      }

      // Get all active employees
      const employees = await Employee.find({
        company: companyId,
        isActive: true,
      }).populate("user", "firstName lastName email");

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
          currency: calculation.currency,
          paymentStatus: "pending",
        });
      }

      // Calculate summary
      const summary = {
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
      payroll.payrollItems = payrollItems;
      payroll.summary = summary;
      payroll.status = "calculated";
      await payroll.save();

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
          totalEmployees: summary.totalEmployees,
          totalNet: summary.totalNet,
        },
        status: "success",
        severity: "medium",
        metadata: {
          affectedRecords: summary.totalEmployees,
        },
      });

      return payroll;
    } catch (error) {
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
    try {
      const payroll = await Payroll.findOne({
        _id: payrollId,
        company: companyId,
      }).populate("company");

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
        });

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

      await payroll.save();

      // TODO: Integrate with payment gateway to disburse funds
      // For MVP, we'll simulate successful payment
      await this.completePayrollProcessing(payrollId, companyId, userId);

      return payroll;
    } catch (error) {
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
  async completePayrollProcessing(payrollId, companyId, userId) {
    try {
      const payroll = await Payroll.findById(payrollId);

      if (!payroll) {
        throw new Error("Payroll not found");
      }

      // Mark all items as paid
      payroll.payrollItems.forEach((item) => {
        item.paymentStatus = "paid";
      });

      payroll.status = "completed";
      await payroll.save();

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
      });

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

      // Apply filters
      if (filters.year) {
        query["payrollPeriod.year"] = parseInt(filters.year);
      }
      if (filters.month) {
        query["payrollPeriod.month"] = parseInt(filters.month);
      }
      if (filters.status) {
        query.status = filters.status;
      }

      const payrolls = await Payroll.find(query)
        .sort({ "payrollPeriod.year": -1, "payrollPeriod.month": -1 })
        .select("payrollPeriod summary status approvedAt processedAt")
        .lean();

      return payrolls;
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
      const payroll = await this.getPayrollById(payrollId, companyId);

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
        grossSalary: item.grossSalary,
        tax: item.deductions.tax,
        pension: item.deductions.pension,
        nhf: item.deductions.nhf,
        netSalary: item.netSalary,
        currency: item.currency,
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
