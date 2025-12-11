import express from "express";
import authRoutes from "./authRoutes.js";
import employeeRoutes from "./employeeRoutes.js";
import payrollRoutes from "./payrollRoutes.js";
import equityRoutes from "./esopRoutes.js";
import financingRoutes from "./financingRoutes.js";
import dashboardRoutes from "./dashboardRoutes.js";
import companyRoutes from "./companyRoutes.js";

const router = express.Router();

/**
 * API Routes
 * All routes are prefixed with /api
 */

// Health check endpoint
router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API is running",
    timestamp: new Date().toISOString(),
  });
});

// Mount route modules
router.use("/auth", authRoutes);
router.use("/employees", employeeRoutes);
router.use("/payroll", payrollRoutes);
router.use("/equity", equityRoutes);
router.use("/financing", financingRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/companies", companyRoutes);

export default router;
