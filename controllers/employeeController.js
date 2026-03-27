import Employee from "../models/employeeModel.js";
import User from "../models/userModel.js";
import Company from "../models/companyModel.js";
import Audit from "../models/auditModel.js";
import emailService from "../services/emailService.js";

// Nigerian Banks & Validation Helpers
// Full CBN-licensed commercial and microfinance banks list.
// Used to validate bankDetails.bankName on create and update.

const NIGERIAN_BANKS = [ "Access Bank","Citibank Nigeria","Ecobank Nigeria","Fidelity Bank",
  "First Bank of Nigeria","First City Monument Bank","Globus Bank","Guaranty Trust Bank","Heritage Bank",
  "Keystone Bank","Lotus Bank","Parallex Bank","Polaris Bank","Premium Trust Bank","Providus Bank",
  "Stanbic IBTC Bank","Standard Chartered Bank","Sterling Bank","SunTrust Bank","Titan Trust Bank",
  "Union Bank of Nigeria","United Bank for Africa","Unity Bank","Wema Bank","Zenith Bank",
  // Microfinance & Digital Banks
  "Kuda Bank","Opay","Palmpay","Moniepoint","VFD Microfinance Bank",
  "Carbon","Rubies Bank","Sparkle Microfinance Bank",
];

/**
 * Validates bank details against BRD rules and your custom validations.
 * Warnings (non-blocking):
 *   - Account name doesn't contain employee's first or last name
 */
function validateBankDetails(bankDetails, firstName, lastName) {
  const errors = [];
  const warnings = [];

  if (bankDetails) {
    // Account number: must be exactly 10 digits
    if (bankDetails.accountNumber) {
      if (!/^\d{10}$/.test(bankDetails.accountNumber)) {
        errors.push("Account number must be exactly 10 digits (NUBAN format)");
      }
    }

    // Bank name: must be from approved Nigerian banks list
    if (bankDetails.bankName) {
      const isValidBank = NIGERIAN_BANKS.some(
        (bank) => bank.toLowerCase() === bankDetails.bankName.toLowerCase()
      );
      if (!isValidBank) {
        errors.push(
          `"${bankDetails.bankName}" is not a recognised CBN-licensed bank. Please use the approved banks list.`
        );
      }
    }

    // Account name: warn if neither first nor last name appears
    // Simple check — account name may be in different order or abbreviated
    if (bankDetails.accountName && firstName && lastName) {
      const accountNameLower = bankDetails.accountName.toLowerCase();
      const firstNameLower = firstName.toLowerCase();
      const lastNameLower = lastName.toLowerCase();

      const nameMatch =
        accountNameLower.includes(firstNameLower) ||
        accountNameLower.includes(lastNameLower);

      if (!nameMatch) {
        warnings.push(
          `Account name "${bankDetails.accountName}" does not appear to match the employee's name (${firstName} ${lastName}). Please verify this is the correct account.`
        );
      }
    }
  }

  return { errors, warnings };
}

/**
 * Validates Nigerian phone number format.
 * Must be +234XXXXXXXXXX — 13 characters total.
 */
function validatePhoneFormat(phone) {
  if (!phone) return true; // phone is optional at employee level
  return /^\+234\d{10}$/.test(phone);
}

class EmployeeController {
  /**
   * Create new employee
   * POST /api/employees
   */
  async createEmployee(req, res) {
    try {
      const companyId = req.user.company;
      const userId = req.user.id;
      const {
        email,
        firstName,
        lastName,
        phone,
        position,
        department,
        employmentType,
        startDate,
        salary,
        bankDetails,
        taxInformation,
        manager,
      } = req.body;

      // Validate required fields
      if (
        !email ||
        !firstName ||
        !lastName ||
        !position ||
        !startDate ||
        !salary?.amount
      ) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields",
        });
      }

      // Validate phone format if provided 
      if (phone && !validatePhoneFormat(phone)) {
        return res.status(400).json({
          success: false,
          message: "Phone must be in +234XXXXXXXXXX format (e.g. +2348012345678)",
        });
      }

      // Start date cannot be in the future — BRD rule EMP-005
      if (new Date(startDate) > new Date()) {
        return res.status(400).json({
          success: false,
          message: "Start date cannot be in the future",
        });
      }

      // Salary currency must match company base currency — BRD rule EMP-007
      if (salary?.currency) {
        const company = await Company.findById(companyId).select("baseCurrency");
        if (company && salary.currency !== company.baseCurrency) {
          return res.status(400).json({
            success: false,
            message: `Salary currency (${salary.currency}) must match company base currency (${company.baseCurrency})`,
          });
        }
      }

      // Bank details validation (hard errors + warnings)
      const bankValidation = validateBankDetails(bankDetails, firstName, lastName);
      if (bankValidation.errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Bank details validation failed",
          errors: bankValidation.errors,
        });
      }

      // Check if user email already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Email already registered",
        });
      }

      const temporaryPassword = Math.random().toString(36).slice(-8) + "Aa1!";

      // Create user account for employee
      const user = await User.create({
        email,
        password: temporaryPassword, 
        firstName,
        lastName,
        phone,
        role: "employee",
        company: companyId,
      });

      // Create employee record
      const employee = await Employee.create({
        user: user._id,
        company: companyId,
        position,
        department,
        employmentType: employmentType || "full-time",
        startDate,
        salary: {
          amount: salary.amount,
          currency: salary.currency || "NGN",
          payFrequency: salary.payFrequency || "monthly",
        },
        bankDetails,
        taxInformation,
        manager,
      });

      // Log audit
      await Audit.log({
        company: companyId,
        user: userId,
        action: "employee_created",
        module: "employee",
        resourceType: "employee",
        resourceId: employee._id,
        details: {
          employeeId: employee.employeeId,
          name: `${firstName} ${lastName}`,
          position,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        status: "success",
        severity: "medium",
      });

      // Send welcome email with temporary password to new employee
      try {
        await emailService.sendWelcomeEmail(
          {
            firstName: user.firstName,
            email: user.email,
          },
          temporaryPassword // the plain text password before hashing
        );
      } catch (emailError) {
        // Don't block the response if email fails
        console.error("Welcome email failed:", emailError.message);
      }

      res.status(201).json({
        success: true,
        message: "Employee created successfully",
        // include bank warnings in response if any
        ...(bankValidation.warnings.length > 0 && {
          warnings: bankValidation.warnings,
        }),
        data: {
          employee,
          user: {
            id: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
          },
        },
      });
    } catch (error) {
      console.error("Create employee error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to create employee",
      });
    }
  }

  /**
   * Get all employees for a company
   * GET /api/employees
   */
  async getAllEmployees(req, res) {
    try {
      const companyId = req.user.company;
      const {
        page = 1,
        department,
        position,
        isActive,
        search,
        sortBy = "lastName",
        sortOrder = "asc",
      } = req.query;

      // enforce pagination limit max 100 — BRD rule FLT-009
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);

      const skip = (parseInt(page) - 1) * limit;

      // Build the initial match — only this company's employees
      const matchStage = { company: companyId };
      if (department) matchStage.department = department;
      if (position) matchStage.position = { $regex: position, $options: "i" };
      if (isActive !== undefined) matchStage.isActive = isActive === "true";

      // Sort direction: 1 = ascending, -1 = descending
      const sortDirection = sortOrder === "desc" ? -1 : 1;
      // Build the aggregation pipeline
      // Think of each stage as one instruction MongoDB runs in order
      const pipeline = [
 
        // Stage 1: filter to only this company's employees
        { $match: matchStage },
 
        // Stage 2: join the User document so we have firstName, lastName, email, phone
        // This is the equivalent of .populate("user") but happens inside MongoDB
        // "from" is the actual MongoDB collection name (lowercase + plural of model name)
        {
          $lookup: {
            from: "users",
            localField: "user",     // the field on Employee that holds the User ID
            foreignField: "_id",    // the matching field on the User document
            as: "user",             // store the result back into "user"
          },
        },
 
        // Stage 3: $lookup returns an array — flatten it to a single object
        // Because one employee only has one user, we just unwrap the array
        { $unwind: "$user" },
 
        // Stage 4: join the manager document (same idea as joining user)
        {
          $lookup: {
            from: "employees",
            localField: "manager",
            foreignField: "_id",
            as: "manager",
          },
        },
 
        // Stage 5: flatten manager array — use preserveNullAndEmptyArrays so
        // employees without a manager don't get dropped from results
        { $unwind: { path: "$manager", preserveNullAndEmptyArrays: true } },
 
        // Stage 6: apply search filter if provided — BRD 2.2
        // $or means: match if ANY of these conditions are true
        // $regex means: partial match (like .includes() in JavaScript)
        ...(search
          ? [
              {
                $match: {
                  $or: [
                    { "user.firstName": { $regex: search, $options: "i" } },
                    { "user.lastName":  { $regex: search, $options: "i" } },
                    { "user.email":     { $regex: search, $options: "i" } },
                    { "user.phone":     { $regex: search, $options: "i" } },
                    { position:         { $regex: search, $options: "i" } },
                    { employeeId:       { $regex: search, $options: "i" } },
                  ],
                },
              },
            ]
          : []),
 
        // Stage 7: NOW we can sort by user.lastName because it exists at this point
        // BRD FLT-010: default is lastName ascending
        { $sort: { [`user.${sortBy}`]: sortDirection } },
 
        // Stage 8: count total before paginating (for pagination response)
        // We use $facet to run two things at the same time:
        // - "data": the actual paginated results
        // - "total": just the count
        {
          $facet: {
            data: [{ $skip: skip }, { $limit: limit }],
            total: [{ $count: "count" }],
          },
        },
      ];
 
      const [result] = await Employee.aggregate(pipeline);
 
      const employees = result.data;
      const total = result.total[0]?.count || 0;

      res.status(200).json({
        success: true,
        data: employees,
        pagination: {
          page: parseInt(page),
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("Get employees error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch employees",
      });
    }
  }

  /**
   * Get employee by ID
   * GET /api/employees/:id
   */
  async getEmployeeById(req, res) {
    try {
      const companyId = req.user.company;
      const { id } = req.params;

      const employee = await Employee.findOne({
        _id: id,
        company: companyId,
      })
        .populate(
          "user",
          "firstName lastName email phone role isActive lastLogin"
        )
        .populate("manager", "user employeeId position")
        .lean();

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }

      // field-level access control — BRD 2.4
      // Employees viewing their own profile get a filtered response
      // HR+ gets the full record
      const role = req.user.role;
      const isOwnProfile = employee.user._id.toString() === req.user.id;

      if (role === "employee" && isOwnProfile) {
        // Employee can see their own data but not other employees' salary in full detail
        return res.status(200).json({
          success: true,
          data: {
            employeeId:     employee.employeeId,
            position:       employee.position,
            department:     employee.department,
            employmentType: employee.employmentType,
            startDate:      employee.startDate,
            salary:         employee.salary,       // own salary — allowed
            bankDetails:    employee.bankDetails,  // own bank details — allowed
            taxInformation: employee.taxInformation,
            user: {
              firstName: employee.user.firstName,
              lastName:  employee.user.lastName,
              email:     employee.user.email,
              phone:     employee.user.phone,
            },
          },
        });
      }


      res.status(200).json({
        success: true,
        data: employee,
      });
    } catch (error) {
      console.error("Get employee error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch employee",
      });
    }
  }

  /**
   * Update employee
   * PUT /api/employees/:id
   */
  async updateEmployee(req, res) {
    try {
      const companyId = req.user.company;
      const userId = req.user.id;
      const { id } = req.params;
      const updates = req.body;

      const employee = await Employee.findOne({
        _id: id,
        company: companyId,
      });

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }

        const allowedUpdates = [
          "position",
          "department",
          "employmentType",
          "salary",       // Admin/Founder only
          "bankDetails",
          "taxInformation",
          "manager",
        ];

      // NEW: bank details validation on update — hard errors + warnings
      // firstName/lastName come from the User record — those fields live on User,
      // not on the Employee model, and are updated via /api/auth/me
      if (updates.bankDetails) {
        const employeeUser = await User.findById(employee.user).select("firstName lastName");
        const bankValidation = validateBankDetails(
          updates.bankDetails,
          employeeUser?.firstName,
          employeeUser?.lastName
        );
        if (bankValidation.errors.length > 0) {
          return res.status(400).json({
            success: false,
            message: "Bank details validation failed",
            errors: bankValidation.errors,
          });
        }
        // store warnings to return in response
        req._bankWarnings = bankValidation.warnings;
      }

      const before = { ...employee.toObject() };

      allowedUpdates.forEach((field) => {
        if (updates[field] !== undefined) {
          employee[field] = updates[field];
        }
      });

      await employee.save();

      // Log audit
      await Audit.log({
        company: companyId,
        user: userId,
        action: "employee_updated",
        module: "employee",
        resourceType: "employee",
        resourceId: employee._id,
        changes: {
          before,
          after: employee.toObject(),
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        status: "success",
        severity: "medium",
      });

      res.status(200).json({
        success: true,
        message: "Employee updated successfully",
        // include bank warnings if any
        ...(req._bankWarnings?.length > 0 && {
          warnings: req._bankWarnings,
        }),
        data: employee,
      });
    } catch (error) {
      console.error("Update employee error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to update employee",
      });
    }
  }

  /**
   * NEW: Employee updates their own profile (limited fields only)
   * PATCH /api/employees/:id/profile
   *
   * BRD 2.1 — employees can update own profile (limited fields)
   * BRD 2.4 — employees can only update: phone, bank details, tax information
   */
  async updateOwnProfile(req, res) {
    try {
      const companyId = req.user.company;
      const userId = req.user.id;
      const { id } = req.params;
      const updates = req.body;

      const employee = await Employee.findOne({ _id: id, company: companyId });

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }

      // Make sure the employee can only update their own profile
      if (employee.user.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: "You can only update your own profile",
        });
      }

      // Employees can only update these fields — BRD 2.4
      const allowedFields = ["bankDetails", "taxInformation"];

      // NEW: bank details validation
      if (updates.bankDetails) {
        const user = await User.findById(userId).select("firstName lastName");
        const bankValidation = validateBankDetails(
          updates.bankDetails,
          user.firstName,
          user.lastName
        );
        if (bankValidation.errors.length > 0) {
          return res.status(400).json({
            success: false,
            message: "Bank details validation failed",
            errors: bankValidation.errors,
          });
        }
        req._bankWarnings = bankValidation.warnings;
      }

      allowedFields.forEach((field) => {
        if (updates[field] !== undefined) {
          employee[field] = updates[field];
        }
      });

      await employee.save();

      await Audit.log({
        company: companyId,
        user: userId,
        action: "employee_profile_updated",
        module: "employee",
        resourceType: "employee",
        resourceId: employee._id,
        details: { updatedFields: Object.keys(updates) },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        status: "success",
        severity: "low",
      });

      res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        ...(req._bankWarnings?.length > 0 && {
          warnings: req._bankWarnings,
        }),
        data: employee,
      });
    } catch (error) {
      console.error("Update own profile error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to update profile",
      });
    }
  }

  /**
   * Deactivate employee
   * PATCH /api/employees/:id/deactivate
   */
  async deactivateEmployee(req, res) {
    try {
      const companyId = req.user.company;
      const userId = req.user.id;
      const { id } = req.params;
      const { terminationDate, terminationReason } = req.body;

      const employee = await Employee.findOne({
        _id: id,
        company: companyId,
      });

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }

      employee.isActive = false;
      employee.terminationDate = terminationDate || new Date();
      employee.terminationReason = terminationReason;
      employee.endDate = terminationDate || new Date();
      await employee.save();

      // Deactivate user account
      await User.findByIdAndUpdate(employee.user, { isActive: false });

      // Log audit
      await Audit.log({
        company: companyId,
        user: userId,
        action: "employee_deactivated",
        module: "employee",
        resourceType: "employee",
        resourceId: employee._id,
        details: {
          employeeId: employee.employeeId,
          terminationDate,
          reason: terminationReason,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        status: "success",
        severity: "high",
      });

      res.status(200).json({
        success: true,
        message: "Employee deactivated successfully",
        data: employee,
      });
    } catch (error) {
      console.error("Deactivate employee error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to deactivate employee",
      });
    }
  }

  /**
   * Activate employee
   * PATCH /api/employees/:id/activate
   */
  async activateEmployee(req, res) {
    try {
      const companyId = req.user.company;
      const userId = req.user.id;
      const { id } = req.params;

      const employee = await Employee.findOne({
        _id: id,
        company: companyId,
      });

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }

      employee.isActive = true;
      employee.terminationDate = null;
      employee.terminationReason = null;
      employee.endDate = null;
      await employee.save();

      // Activate user account
      await User.findByIdAndUpdate(employee.user, { isActive: true });

      // Log audit
      await Audit.log({
        company: companyId,
        user: userId,
        action: "employee_activated",
        module: "employee",
        resourceType: "employee",
        resourceId: employee._id,
        details: {
          employeeId: employee.employeeId,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        status: "success",
        severity: "medium",
      });

      res.status(200).json({
        success: true,
        message: "Employee activated successfully",
        data: employee,
      });
    } catch (error) {
      console.error("Activate employee error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to activate employee",
      });
    }
  }

  /**
   * Delete employee (soft delete)
   * DELETE /api/employees/:id
   */
  async deleteEmployee(req, res) {
    try {
      const companyId = req.user.company;
      const userId = req.user.id;
      const { id } = req.params;

      const employee = await Employee.findOne({
        _id: id,
        company: companyId,
      });

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }

      // Soft delete - just deactivate
      employee.isActive = false;
      employee.terminationDate = new Date();
      employee.terminationReason = "Deleted by admin";
      await employee.save();

      // Deactivate user
      await User.findByIdAndUpdate(employee.user, { isActive: false });

      // Log audit
      await Audit.log({
        company: companyId,
        user: userId,
        action: "employee_deleted",
        module: "employee",
        resourceType: "employee",
        resourceId: employee._id,
        details: {
          employeeId: employee.employeeId,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        status: "success",
        severity: "high",
      });

      res.status(200).json({
        success: true,
        message: "Employee deleted successfully",
      });
    } catch (error) {
      console.error("Delete employee error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to delete employee",
      });
    }
  }

  /**
   * Get employee statistics
   * GET /api/employees/stats
   */
  async getEmployeeStats(req, res) {
    try {
      const companyId = req.user.company;

      const [
        totalEmployees,
        activeEmployees,
        byDepartment,
        byEmploymentType,
        recentHires,
      ] = await Promise.all([
        Employee.countDocuments({ company: companyId }),
        Employee.countDocuments({ company: companyId, isActive: true }),
        Employee.aggregate([
          { $match: { company: companyId, isActive: true } },
          { $group: { _id: "$department", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]),
        Employee.aggregate([
          { $match: { company: companyId, isActive: true } },
          { $group: { _id: "$employmentType", count: { $sum: 1 } } },
        ]),
        Employee.find({ company: companyId, isActive: true })
          .sort({ startDate: -1 })
          .limit(5)
          .populate("user", "firstName lastName email")
          .select("employeeId position startDate")
          .lean(),
      ]);

      res.status(200).json({
        success: true,
        data: {
          totalEmployees,
          activeEmployees,
          inactiveEmployees: totalEmployees - activeEmployees,
          byDepartment: byDepartment.map((d) => ({
            department: d._id || "Unassigned",
            count: d.count,
          })),
          byEmploymentType: byEmploymentType.map((t) => ({
            type: t._id || "Unspecified",
            count: t.count,
          })),
          recentHires,
        },
      });
    } catch (error) {
      console.error("Get employee stats error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch employee statistics",
      });
    }
  }
}

export default new EmployeeController();
