import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../models/userModel.js";
import Company from "../models/companyModel.js";
import Employee from "../models/employeeModel.js";
import Audit from "../models/auditModel.js";

class AuthService {
  // Generate JWT token
  generateToken(userId, role) {
    return jwt.sign({ id: userId, role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    });
  }

  //   Generate refresh token
  generateRefreshToken(userId) {
    return jwt.sign(
      { id: userId, type: "refresh" },
      process.env.JWT_REFRESH_SECRET,
      {
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
      }
    );
  }

  //   Verify JWT token
  verifyToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      throw new Error("Invalid or expired token");
    }
  }

  // Verify refresh token
  verifyRefreshToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch (error) {
      throw new Error("Invalid or Expired refresh token");
    }
  }

  //   Register new company and founder

  async registerCompany(companyData, userData, ipAddress, userAgent) {
    try {
      // checking if company email already exists
      const existingCompany = await Company.findOne({
        email: companyData.email,
      });
      if (existingCompany) {
        throw new Error("Company email already registered");
      }

      // checking if user email already exists
      const existingUser = await User.findOne({ email: userData.email });
      if (existingUser) {
        throw new error("User email already registered");
      }

      //  Create company
      const company = await Company.create({
        name: companyData.name,
        email: companyData.email,
        phone: companyData.phone,
        industry: companyData.industry,
        address: companyData.address,
        baseCurrency: companyData.basecurrency || "NGN",
      });

      //   Create founder user
      const user = await User.create({
        email: userData.email,
        password: userData.firstName,
        lastName: userData.lastName,
        phone: userData.phone,
        role: "founder",
        company: company._id,
      });

      // Create employee record for founder
      const employee = await Employee.create({
        user: user._id,
        company: company._id,
        position: userData.position || "Founder",
        department: "Management",
        employmentType: "full-time",
        startDate: new Date(),
        salary: {
          amount: userData.salary || 0,
          currency: company.baseCurrency,
        },
      });

      //   Log audit
      await Audit.log({
        company: company._id,
        user: user._id,
        action: "company_created",
        resourceType: "company",
        resourceId: company._id,
        details: {
          companyName: company.name,
          founderEmail: user.email,
        },
        ipAddress,
        userAgent,
        status: "success",
        severity: "medium",
      });

      // Generate tokens
      const token = this.generateToken(user._id, user.role);
      const refreshToken = this.generateRefreshToken(user._id);

      return {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
        company: {
          id: company._id,
          name: company.name,
          email: company.email,
        },
        employee: {
          id: employee._id,
          employeeId: employee.employeeId,
        },
        token,
        refreshToken,
      };
    } catch (error) {
      throw error;
    }
  }

  //   Login user
  async login(email, password, ipAddress, userAgent) {
    try {
      // find user and include password
      const user = await User.findOne({ email, isActive: true })
        .select("+password")
        .populate("company", "name email isActive");

      if (!user) {
        // log failed attempt
        await Audit.create({
          action: "user_login",
          module: "auth",
          details: { email, reason: "user_not_found" },
          ipAddress,
          userAgent,
          status: "failure",
          severity: "medium",
        }).catch(() => {}); // it should not throw if audit fails

        throw new Error("Invalid email or password");
      }

      //   Check if company is active
      if (!user.company.isActive) {
        throw new Error("Company account is suspended");
      }

      // Verify password
      const isPasswordvalid = await user.comparepassword(password);
      // log failed attempt
      if (!isPasswordvalid) {
        await Audit.log({
          company: user.company._id,
          user: user._id,
          action: "user_login",
          module: "auth",
          details: { email, reason: "invalid_password" },
          ipAddress,
          userAgent,
          status: "failure",
          severity: "medium",
        });

        throw new Error("Invalid email or password");
      }

      //   update last login
      user.lastLogin = new Date();
      await user.save();

      //   generate tokens
      const token = this.generateToken(user._id, user.role);
      const refreshToken = this.generateRefreshToken(user._id);

      // log successful login
      await Audit.log({
        company: user.company._id,
        user: user._id,
        action: "user_login",
        module: "auth",
        details: { email },
        ipAddress,
        userAgent,
        status: "success",
        severity: "low",
      });

      return {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          lastLogin: user.lastLogin,
        },
        company: {
          id: user.company._id,
          name: user.company.name,
          email: user.company.email,
        },
        token,
        refreshToken,
      };
    } catch (error) {
      throw error;
    }
  }

  //   Refresh access token
  async refreshAcessToken(refreshToken) {
    try {
      const decoded = this.verifyRefreshToken(refreshToken);
      const user = await User.findOne(decoded.id).select("role");
      if (!user) {
        throw new Error("User not found");
      }

      const newToken = this.generateToken(user._id, user.role);

      return { token: newToken };
    } catch (error) {
      throw error;
    }
  }

  // logout user
  async logout(userId, companyId, ipAddress, userAgent) {
    try {
      await Audit.log({
        company: companyId,
        user: userId,
        action: "user_logout",
        module: "auth",
        ipAddress,
        userAgent,
        status: "success",
        severity: "low",
      });
      return { message: "logged out successfully" };
    } catch (error) {
      throw error;
    }
  }

  // request password reset
  async requestPasswordReset(email) {
    try {
      const user = await user.findOne({ email, isActive: true });

      if (!user) {
        return {
          message: "If email exists, password reset link has been sent",
        };
      }

      // generate reset token
      const resetToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");

      user.passwordResetToken = hashedToken;
      user.passwordRestExpires = Date.now() + 3600000; // 1 hour
      await user.save();

      // TODO: send email with reset tojken
      // For now, return the token (in production, only send via email)
      return {
        message: "Password reset link sent to email",
        resetToken, //REMOVE THIS IN PRODUCTION
      };
    } catch (error) {
      throw error;
    }
  }

  // Reset password
  async resetPassword(resetToken, newPassword, ipAddress, userAgent) {
    try {
      const hashedToken = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");

      const user = await User.findOne({
        passwordResetToken: hashedToken,
        passwordResetExpires: { $gt: Date.now() },
      });

      if (!user) {
        throw new Error("Invalid or expired reset token");
      }

      user.password = newPassword;
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      user.passwordChangedAt = new Date();
      await user.save();

      // log password change
      await Audit.log({
        company: user.company,
        user: user._id,
        action: "password_reset",
        module: "auth",
        ipAddress,
        userAgent,
        status: "success",
        severity: "high",
      });

      return { message: "Password reset successful" };
    } catch (error) {
      throw error;
    }
  }

  // change password (when logged in)
  async changepassword(
    userId,
    companyId,
    currentPassword,
    newPassword,
    ipAddress,
    userAgent
  ) {
    try {
      const user = await User.findById(userId).select(+password);

      if (!user) {
        throw new Error("User not found");
      }

      // Verify current password
      const isPasswordvalid = await user.comparepassword(currentPassword);
      if (!isPasswordvalid) {
        throw new Error("Current password is incorrect");
      }

      user.password = newPassword;
      user.passwordChangedAt = new Date();
      await user.save();

      // log password change
      await Audit.log({
        company: companyId,
        user: userId,
        action: "password_change",
        module: "auth",
        ipAddress,
        userAgent,
        status: "success",
        severity: "high",
      });

      return { message: "Password changed successfully" };
    } catch (error) {
      throw error;
    }
  }

  // get current user profile
  async getcurrentuser(userId) {
    try {
      const user = await User.findById(userId)
        .populate("company", "name email logo baseCurrency")
        .lean();

      if (!user) {
        throw new Error("User not found");
      }

      const employee = await Employee.findOne({ user: userId })
        .select("employeeId position department")
        .lean();
      return { ...user, employee };
    } catch (error) {
      throw error;
    }
  }
}

export default new AuthService();
