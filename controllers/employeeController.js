import Employee from "../models/employeeModel.js";
import User from "../models/userModel.js";
import Audit from "../models/auditModel.js";

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

      // Check if user email already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Email already registered",
        });
      }

      // Create user account for employee
      const user = await User.create({
        email,
        password: Math.random().toString(36).slice(-8) + "Aa1!", // Temporary password
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

      // TODO: Send welcome email with temporary password

      res.status(201).json({
        success: true,
        message: "Employee created successfully",
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
        limit = 50,
        department,
        position,
        isActive,
        search,
      } = req.query;

      const query = { company: companyId };

      // Apply filters
      if (department) query.department = department;
      if (position) query.position = position;
      if (isActive !== undefined) query.isActive = isActive === "true";

      const skip = (parseInt(page) - 1) * parseInt(limit);

      let employees = await Employee.find(query)
        .populate("user", "firstName lastName email phone role isActive")
        .populate("manager", "user employeeId position")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      // Apply search filter if provided
      if (search) {
        const searchLower = search.toLowerCase();
        employees = employees.filter(
          (emp) =>
            emp.user.firstName.toLowerCase().includes(searchLower) ||
            emp.user.lastName.toLowerCase().includes(searchLower) ||
            emp.user.email.toLowerCase().includes(searchLower) ||
            emp.employeeId.toLowerCase().includes(searchLower) ||
            emp.position.toLowerCase().includes(searchLower)
        );
      }

      const total = await Employee.countDocuments(query);

      res.status(200).json({
        success: true,
        data: employees,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
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

      const before = { ...employee.toObject() };

      // Update allowed fields
      const allowedUpdates = [
        "position",
        "department",
        "employmentType",
        "salary",
        "bankDetails",
        "taxInformation",
        "manager",
      ];

      allowedUpdates.forEach((field) => {
        if (updates[field] !== undefined) {
          employee[field] = updates[field];
        }
      });

      await employee.save();

      // Update user details if provided
      if (updates.firstName || updates.lastName || updates.phone) {
        await User.findByIdAndUpdate(employee.user, {
          ...(updates.firstName && { firstName: updates.firstName }),
          ...(updates.lastName && { lastName: updates.lastName }),
          ...(updates.phone && { phone: updates.phone }),
        });
      }

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
            type: t._id,
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
