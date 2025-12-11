import express from "express";
import authController from "../controllers/authController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register new company and founder
 * @access  Public
 */
router.post("/register", authController.register);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post("/login", authController.login);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post("/logout", protect, authController.logout);

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Refresh access token
 * @access  Public
 */
router.post("/refresh-token", authController.refreshToken);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Request password reset
 * @access  Public
 */
router.post("/forgot-password", authController.forgotPassword);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password with token
 * @access  Public
 */
router.post("/reset-password", authController.resetPassword);

/**
 * @route   POST /api/auth/change-password
 * @desc    Change password (when logged in)
 * @access  Private
 */
router.post("/change-password", protect, authController.changePassword);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get("/me", protect, authController.getCurrentUser);

/**
 * @route   GET /api/auth/verify-token
 * @desc    Verify token validity
 * @access  Private
 */
router.get("/verify-token", protect, authController.verifyToken);

export default router;
