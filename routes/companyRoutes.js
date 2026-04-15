import express from "express";
import Company from "../models/companyModel.js";
import { protect, isFounderOrAdmin, requireVerified } from "../middlewares/authMiddleware.js";
import Audit from "../models/auditModel.js";

const router = express.Router();

// All routes require authentication
router.use(protect);
router.use(requireVerified)

// ─── Helper ──────────────────────────────────────────────────────────────────
// Re-evaluates whether a company has completed onboarding.
// A company is fully onboarded when all four conditions are met:
function checkOnboardingComplete(company) {
  return (
    !!company.baseCurrency &&
    !!company.payrollSettings?.payFrequency &&
    !!company.bankDetails &&
    !!company.isVerified &&
    !!company.address?.street && 
    !!company.address?.city &&    
    !!company.address?.state 
  );
}

/**
 * @route   GET /api/companies/profile
 * @desc    Get company profile (BR-001)
 * @access  Private
 */
router.get("/profile", protect , async (req, res) => {
  try {
    const company = await Company.findById(req.user.company).lean();

    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found",
      });
    }

    res.status(200).json({
      success: true,
      data: company,
    });
  } catch (error) {
    console.error("Get company profile error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch company profile",
    });
  }
});

/**
 * @route   PUT /api/companies/profile
 * @desc    Update company profile
 * @access  Private (Founder, Admin)
 */
router.put("/profile", isFounderOrAdmin, async (req, res) => {
  try {
    const companyId = req.user.company;
    const userId = req.user.id;
    const updates = req.body;

    const company = await Company.findById(companyId);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found",
      });
    }

    const before = { ...company.toObject() };

    // Update allowed fields
    const allowedUpdates = [
      "name",
      "email",
      "phone",
      "address",
      "industry",
      "companySize",
      "website",
      "logo",
      "bankDetails",
    ];

    allowedUpdates.forEach((field) => {
      if (updates[field] !== undefined) {
        company[field] = updates[field];
      }
    });

    company.onboardingCompleted = checkOnboardingComplete(company);
    await company.save();

    // Log audit
    await Audit.log({
      company: companyId,
      user: userId,
      action: "company_updated",
      module: "company",
      resourceType: "company",
      resourceId: companyId,
      changes: {
        before,
        after: company.toObject(),
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      status: "success",
      severity: "medium",
    });

    res.status(200).json({
      success: true,
      message: "Company profile updated successfully",
      data: company,
    });
  } catch (error) {
    console.error("Update company profile error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to update company profile",
    });
  }
});

/**
 * @route   PUT /api/companies/settings
 * @desc    Update company settings (payroll, etc.)
 * @access  Private (Founder, Admin)
 */
router.put("/settings", protect , isFounderOrAdmin, async (req, res) => {
  try {
    const companyId = req.user.company;
    const userId = req.user.id;
    const { payrollSettings, baseCurrency, bankDetails } = req.body;

    const company = await Company.findById(companyId);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found",
      });
    }

    const before = {
      payrollSettings: company.payrollSettings,
      baseCurrency: company.baseCurrency,
      bankDetails: company.bankDetails,
    };

    // Update settings
    if (bankDetails) {
      company.bankDetails = {
        ...company.bankDetails,
        ...bankDetails,
      };

      company.markModified("bankDetails");
    }
    if (payrollSettings) {
      company.payrollSettings = {
        ...company.payrollSettings.toObject(),
        ...payrollSettings,
      };
      // Tell Mongoose this nested object changed — it doesn't always detect spread updates
      company.markModified("payrollSettings");

    }

    if (baseCurrency) {
      company.baseCurrency = baseCurrency;
    }

    company.onboardingCompleted = checkOnboardingComplete(company);
    await company.save();

    // Log audit
    await Audit.log({
      company: companyId,
      user: userId,
      action: "company_settings_changed",
      module: "company",
      resourceType: "company",
      resourceId: companyId,
      changes: {
        before,
        after: {
          payrollSettings: company.payrollSettings,
          baseCurrency: company.baseCurrency,
          bankDetails: company.bankDetails,
        },
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      status: "success",
      severity: "high",
    });

    res.status(200).json({
      success: true,
      message: "Company settings updated successfully",
      data: {
        payrollSettings: company.payrollSettings,
        baseCurrency: company.baseCurrency,
        bankDetails: company.bankDetails,
        onboardingCompleted: company.onboardingCompleted,
      },
    });
  } catch (error) {
    console.error("Update company settings error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to update company settings",
    });
  }
});

export default router;
