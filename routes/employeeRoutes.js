import express from "express";
import employeeController from "../controllers/employeeController.js";
import {
  protect,
  isHROrAbove,
  verifyEmployeeOwnership,
} from "../middlewares/authMiddleware.js";
import { validatePagination } from "../middlewares/validator.js";

const router = express.Router();

// All routes require authentication
router.use(protect);

/**
 * @route   POST /api/employees
 * @desc    Create new employee (BR-002)
 * @access  Private (HR, Admin, Founder)
 */
router.post("/", isHROrAbove, employeeController.createEmployee);

/**
 * @route   GET /api/employees/stats
 * @desc    Get employee statistics
 * @access  Private (HR, Admin, Founder)
 */
router.get("/stats", isHROrAbove, employeeController.getEmployeeStats);

/**
 * @route   GET /api/employees
 * @desc    Get all employees for company
 * @access  Private (HR, Admin, Founder)
 */
router.get(
  "/",
  isHROrAbove,
  validatePagination,
  employeeController.getAllEmployees
);

/**
 * @route   GET /api/employees/:id
 * @desc    Get employee by ID
 * @access  Private (Owner or HR+)
 */
router.get("/:id", verifyEmployeeOwnership, employeeController.getEmployeeById);

/**
 * @route   PUT /api/employees/:id
 * @desc    Update employee
 * @access  Private (HR, Admin, Founder)
 */
router.put("/:id", isHROrAbove, employeeController.updateEmployee);

/**
 * @route   PATCH /api/employees/:id/deactivate
 * @desc    Deactivate employee
 * @access  Private (HR, Admin, Founder)
 */
router.patch(
  "/:id/deactivate",
  isHROrAbove,
  employeeController.deactivateEmployee
);

/**
 * @route   PATCH /api/employees/:id/activate
 * @desc    Activate employee
 * @access  Private (HR, Admin, Founder)
 */
router.patch("/:id/activate", isHROrAbove, employeeController.activateEmployee);

/**
 * @route   DELETE /api/employees/:id
 * @desc    Delete employee (soft delete)
 * @access  Private (Admin, Founder)
 */
router.delete("/:id", isHROrAbove, employeeController.deleteEmployee);

export default router;
