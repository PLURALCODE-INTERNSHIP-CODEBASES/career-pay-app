import authService from "../services/authService.js";

class AuthController {
  /**
   * Register new company and founder
   * POST /api/auth/register
   */
  async register(req, res) {
    try {
      const { company, user } = req.body;

      // Validate required fields
      if (
        !company?.name ||
        !company?.email ||
        !user?.email ||
        !user?.password
      ) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields",
        });
      }

      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.get("user-agent");

      const result = await authService.registerCompany(
        company,
        user,
        ipAddress,
        userAgent
      );

      res.status(201).json({
        success: true,
        message: "Company registered successfully",
        data: result,
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Registration failed",
      });
    }
  }

  /**
   * Login user
   * POST /api/auth/login
   */
  async login(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: "Email and password are required",
        });
      }

      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.get("user-agent");

      const result = await authService.login(
        email,
        password,
        ipAddress,
        userAgent
      );

      res.status(200).json({
        success: true,
        message: "Login successful",
        data: result,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(401).json({
        success: false,
        message: error.message || "Login failed",
      });
    }
  }

  /**
   * Refresh access token
   * POST /api/auth/refresh-token
   */
  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: "Refresh token is required",
        });
      }

      const result = await authService.refreshAccessToken(refreshToken);

      res.status(200).json({
        success: true,
        message: "Token refreshed successfully",
        data: result,
      });
    } catch (error) {
      console.error("Token refresh error:", error);
      res.status(401).json({
        success: false,
        message: error.message || "Token refresh failed",
      });
    }
  }

  /**
   * Logout user
   * POST /api/auth/logout
   */
  async logout(req, res) {
    try {
      const userId = req.user.id;
      const companyId = req.user.company;
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.get("user-agent");

      await authService.logout(userId, companyId, ipAddress, userAgent);

      res.status(200).json({
        success: true,
        message: "Logout successful",
      });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Logout failed",
      });
    }
  }

  /**
   * Request password reset
   * POST /api/auth/forgot-password
   */
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Email is required",
        });
      }

      const result = await authService.requestPasswordReset(email);

      res.status(200).json({
        success: true,
        message: result.message,
        // Remove resetToken in production
        ...(process.env.NODE_ENV !== "production" && {
          resetToken: result.resetToken,
        }),
      });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to process password reset request",
      });
    }
  }

  /**
   * Reset password with token
   * POST /api/auth/reset-password
   */
  async resetPassword(req, res) {
    try {
      const { resetToken, newPassword } = req.body;

      if (!resetToken || !newPassword) {
        return res.status(400).json({
          success: false,
          message: "Reset token and new password are required",
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 8 characters long",
        });
      }

      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.get("user-agent");

      const result = await authService.resetPassword(
        resetToken,
        newPassword,
        ipAddress,
        userAgent
      );

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Password reset failed",
      });
    }
  }

  /**
   * Change password (when logged in)
   * POST /api/auth/change-password
   */
  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;
      const companyId = req.user.company;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: "Current password and new password are required",
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          message: "New password must be at least 8 characters long",
        });
      }

      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.get("user-agent");

      const result = await authService.changePassword(
        userId,
        companyId,
        currentPassword,
        newPassword,
        ipAddress,
        userAgent
      );

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Password change failed",
      });
    }
  }

  /**
   * Get current user profile
   * GET /api/auth/me
   */
  async getCurrentUser(req, res) {
    try {
      const userId = req.user.id;

      const user = await authService.getCurrentUser(userId);

      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error) {
      console.error("Get current user error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch user profile",
      });
    }
  }

  /**
   * Verify token validity
   * GET /api/auth/verify-token
   */
  async verifyToken(req, res) {
    try {
      // If request reaches here, token is valid (middleware already verified)
      res.status(200).json({
        success: true,
        message: "Token is valid",
        data: {
          userId: req.user.id,
          role: req.user.role,
        },
      });
    } catch (error) {
      console.error("Verify token error:", error);
      res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }
  }
}

export default new AuthController();
