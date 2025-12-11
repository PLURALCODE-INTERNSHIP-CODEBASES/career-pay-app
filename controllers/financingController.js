import Financing from "../models/financingModel.js";
import Company from "../models/companyModel.js";
import Employee from "../models/employeeModel.js";
import Audit from "../models/auditModel.js";

class FinancingController {
  /**
   * Apply for payroll financing
   * POST /api/financing/apply
   */
  async applyForFinancing(req, res) {
    try {
      const companyId = req.user.company;
      const userId = req.user.id;
      const {
        requestedAmount,
        currency,
        purpose,
        repaymentTermMonths,
        repaymentFrequency,
        companyDetails,
      } = req.body;

      // Validate required fields
      if (!requestedAmount || !repaymentTermMonths) {
        return res.status(400).json({
          success: false,
          message: "Requested amount and repayment term are required",
        });
      }

      if (requestedAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Requested amount must be greater than 0",
        });
      }

      // Get company and employee data for application
      const [company, employeeCount] = await Promise.all([
        Company.findById(companyId),
        Employee.countDocuments({ company: companyId, isActive: true }),
      ]);

      // Create financing application
      const financing = await Financing.create({
        company: companyId,
        requestedAmount,
        currency: currency || company.baseCurrency || "NGN",
        purpose: purpose || "payroll",
        repaymentTermMonths,
        repaymentFrequency: repaymentFrequency || "monthly",
        companyDetails: {
          ...companyDetails,
          employeeCount,
        },
        status: "pending",
      });

      // Log audit
      await Audit.log({
        company: companyId,
        user: userId,
        action: "financing_applied",
        module: "financing",
        resourceType: "financing",
        resourceId: financing._id,
        details: {
          requestedAmount,
          currency: financing.currency,
          repaymentTermMonths,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        status: "success",
        severity: "high",
      });

      res.status(201).json({
        success: true,
        message: "Financing application submitted successfully",
        data: financing,
      });
    } catch (error) {
      console.error("Apply for financing error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to submit financing application",
      });
    }
  }

  /**
   * Get all financing applications for company
   * GET /api/financing
   */
  async getCompanyFinancing(req, res) {
    try {
      const companyId = req.user.company;
      const { status } = req.query;

      const query = { company: companyId };
      if (status) query.status = status;

      const financings = await Financing.find(query)
        .sort({ applicationDate: -1 })
        .lean();

      res.status(200).json({
        success: true,
        data: financings,
      });
    } catch (error) {
      console.error("Get company financing error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch financing applications",
      });
    }
  }

  /**
   * Get financing by ID
   * GET /api/financing/:id
   */
  async getFinancingById(req, res) {
    try {
      const companyId = req.user.company;
      const { id } = req.params;

      const financing = await Financing.findOne({
        _id: id,
        company: companyId,
      })
        .populate("reviewedBy", "firstName lastName email")
        .lean();

      if (!financing) {
        return res.status(404).json({
          success: false,
          message: "Financing application not found",
        });
      }

      res.status(200).json({
        success: true,
        data: financing,
      });
    } catch (error) {
      console.error("Get financing error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch financing application",
      });
    }
  }

  /**
   * Review financing application (Admin/Financial Partner)
   * PUT /api/financing/:id/review
   */
  async reviewFinancing(req, res) {
    try {
      const companyId = req.user.company;
      const userId = req.user.id;
      const { id } = req.params;
      const {
        status,
        approvedAmount,
        interestRate,
        reviewNotes,
        rejectionReason,
      } = req.body;

      // Only admin/founder can review
      if (req.user.role !== "founder" && req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          message: "Only founders and admins can review financing applications",
        });
      }

      const financing = await Financing.findOne({
        _id: id,
        company: companyId,
      });

      if (!financing) {
        return res.status(404).json({
          success: false,
          message: "Financing application not found",
        });
      }

      if (
        financing.status !== "pending" &&
        financing.status !== "under_review"
      ) {
        return res.status(400).json({
          success: false,
          message: "Financing application has already been reviewed",
        });
      }

      // Update financing
      financing.status = status;
      financing.reviewedBy = userId;
      financing.reviewedAt = new Date();
      financing.reviewNotes = reviewNotes;

      if (status === "approved") {
        financing.approvedAmount = approvedAmount || financing.requestedAmount;
        financing.interestRate = interestRate || 0;

        // Calculate total repayment
        const principal = financing.approvedAmount;
        const interest = (principal * interestRate) / 100;
        financing.totalRepaymentAmount = principal + interest;
        financing.outstandingBalance = financing.totalRepaymentAmount;

        // Generate repayment schedule
        financing.repaymentSchedule = this.generateRepaymentSchedule(
          financing.approvedAmount,
          financing.totalRepaymentAmount,
          financing.repaymentTermMonths,
          financing.repaymentFrequency
        );
      } else if (status === "rejected") {
        financing.rejectionReason = rejectionReason;
      }

      await financing.save();

      // Log audit
      await Audit.log({
        company: companyId,
        user: userId,
        action:
          status === "approved" ? "financing_approved" : "financing_rejected",
        module: "financing",
        resourceType: "financing",
        resourceId: financing._id,
        details: {
          requestedAmount: financing.requestedAmount,
          approvedAmount: financing.approvedAmount,
          status,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        status: "success",
        severity: "high",
      });

      res.status(200).json({
        success: true,
        message: `Financing application ${status}`,
        data: financing,
      });
    } catch (error) {
      console.error("Review financing error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to review financing application",
      });
    }
  }

  /**
   * Disburse financing (Mark as disbursed)
   * POST /api/financing/:id/disburse
   */
  async disburseFinancing(req, res) {
    try {
      const companyId = req.user.company;
      const userId = req.user.id;
      const { id } = req.params;
      const { disbursementReference } = req.body;

      const financing = await Financing.findOne({
        _id: id,
        company: companyId,
      });

      if (!financing) {
        return res.status(404).json({
          success: false,
          message: "Financing application not found",
        });
      }

      if (financing.status !== "approved") {
        return res.status(400).json({
          success: false,
          message: "Only approved financing can be disbursed",
        });
      }

      financing.status = "disbursed";
      financing.disbursementDate = new Date();
      financing.disbursementReference =
        disbursementReference || `DISB-${Date.now()}`;
      await financing.save();

      // Change to active after disbursement
      setTimeout(async () => {
        financing.status = "active";
        await financing.save();
      }, 1000);

      // Log audit
      await Audit.log({
        company: companyId,
        user: userId,
        action: "financing_disbursed",
        module: "financing",
        resourceType: "financing",
        resourceId: financing._id,
        details: {
          amount: financing.approvedAmount,
          reference: financing.disbursementReference,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        status: "success",
        severity: "high",
      });

      res.status(200).json({
        success: true,
        message: "Financing disbursed successfully",
        data: financing,
      });
    } catch (error) {
      console.error("Disburse financing error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to disburse financing",
      });
    }
  }

  /**
   * Make repayment
   * POST /api/financing/:id/repayment
   */
  async makeRepayment(req, res) {
    try {
      const companyId = req.user.company;
      const userId = req.user.id;
      const { id } = req.params;
      const { amount, paymentReference } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Valid payment amount is required",
        });
      }

      const financing = await Financing.findOne({
        _id: id,
        company: companyId,
      });

      if (!financing) {
        return res.status(404).json({
          success: false,
          message: "Financing not found",
        });
      }

      if (financing.status !== "active") {
        return res.status(400).json({
          success: false,
          message: "Financing is not active",
        });
      }

      if (amount > financing.outstandingBalance) {
        return res.status(400).json({
          success: false,
          message: "Payment amount exceeds outstanding balance",
        });
      }

      // Update repayment
      financing.amountRepaid += amount;
      financing.outstandingBalance -= amount;

      // Mark schedule items as paid
      let remainingAmount = amount;
      for (const schedule of financing.repaymentSchedule) {
        if (!schedule.isPaid && remainingAmount > 0) {
          if (remainingAmount >= schedule.amount) {
            schedule.isPaid = true;
            schedule.paidDate = new Date();
            schedule.paidAmount = schedule.amount;
            schedule.paymentReference = paymentReference || `PAY-${Date.now()}`;
            remainingAmount -= schedule.amount;
          } else {
            // Partial payment
            schedule.paidAmount = (schedule.paidAmount || 0) + remainingAmount;
            remainingAmount = 0;
          }
        }
      }

      // Check if fully paid
      if (financing.outstandingBalance <= 0) {
        financing.status = "completed";
      }

      await financing.save();

      // Log audit
      await Audit.log({
        company: companyId,
        user: userId,
        action: "repayment_made",
        module: "financing",
        resourceType: "financing",
        resourceId: financing._id,
        details: {
          amount,
          outstandingBalance: financing.outstandingBalance,
          reference: paymentReference,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        status: "success",
        severity: "medium",
      });

      res.status(200).json({
        success: true,
        message: "Repayment processed successfully",
        data: financing,
      });
    } catch (error) {
      console.error("Make repayment error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to process repayment",
      });
    }
  }

  /**
   * Get financing statistics
   * GET /api/financing/stats
   */
  async getFinancingStats(req, res) {
    try {
      const companyId = req.user.company;

      const [
        totalApplications,
        activeFinancing,
        completedFinancing,
        totalBorrowed,
        totalRepaid,
        outstandingBalance,
      ] = await Promise.all([
        Financing.countDocuments({ company: companyId }),
        Financing.countDocuments({ company: companyId, status: "active" }),
        Financing.countDocuments({ company: companyId, status: "completed" }),

        Financing.aggregate([
          {
            $match: {
              company: companyId,
              status: { $in: ["active", "completed"] },
            },
          },
          { $group: { _id: null, total: { $sum: "$approvedAmount" } } },
        ]).then((result) => result[0]?.total || 0),

        Financing.aggregate([
          { $match: { company: companyId } },
          { $group: { _id: null, total: { $sum: "$amountRepaid" } } },
        ]).then((result) => result[0]?.total || 0),

        Financing.aggregate([
          { $match: { company: companyId, status: "active" } },
          { $group: { _id: null, total: { $sum: "$outstandingBalance" } } },
        ]).then((result) => result[0]?.total || 0),
      ]);

      res.status(200).json({
        success: true,
        data: {
          totalApplications,
          activeLoans: activeFinancing,
          completedLoans: completedFinancing,
          totalBorrowed,
          totalRepaid,
          outstandingBalance,
        },
      });
    } catch (error) {
      console.error("Get financing stats error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch financing statistics",
      });
    }
  }

  /**
   * Helper: Generate repayment schedule
   */
  generateRepaymentSchedule(principal, totalAmount, termMonths, frequency) {
    const schedule = [];
    const today = new Date();

    let intervalsPerMonth;
    switch (frequency) {
      case "weekly":
        intervalsPerMonth = 4;
        break;
      case "bi-weekly":
        intervalsPerMonth = 2;
        break;
      case "monthly":
      default:
        intervalsPerMonth = 1;
    }

    const totalIntervals = termMonths * intervalsPerMonth;
    const amountPerInterval = totalAmount / totalIntervals;
    const principalPerInterval = principal / totalIntervals;
    const interestPerInterval = (totalAmount - principal) / totalIntervals;

    for (let i = 1; i <= totalIntervals; i++) {
      const dueDate = new Date(today);

      if (frequency === "weekly") {
        dueDate.setDate(dueDate.getDate() + i * 7);
      } else if (frequency === "bi-weekly") {
        dueDate.setDate(dueDate.getDate() + i * 14);
      } else {
        dueDate.setMonth(dueDate.getMonth() + i);
      }

      schedule.push({
        dueDate,
        amount: Math.round(amountPerInterval),
        principal: Math.round(principalPerInterval),
        interest: Math.round(interestPerInterval),
        isPaid: false,
      });
    }

    return schedule;
  }
}

export default new FinancingController();
