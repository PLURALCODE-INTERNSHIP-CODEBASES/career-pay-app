import Employee from "../models/employeeModel.js"
import payrollService from "../services/payrollService.js";
import taxCalculationService from "../services/taxCalculationService.js";

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
}

export default new PayrollController();
