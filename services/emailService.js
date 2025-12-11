import nodemailer from "nodemailer";

class EmailService {
  constructor() {
    // Create transporter for sending emails
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: process.env.SMTP_PORT || 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }

  /**
   * Send email helper
   */
  async sendEmail(to, subject, htmlContent, textContent = null) {
    try {
      const mailOptions = {
        from: `"${process.env.APP_NAME || "CareerPay"}" <${
          process.env.SMTP_FROM || process.env.SMTP_USER
        }>`,
        to,
        subject,
        html: htmlContent,
        text: textContent || this.stripHtml(htmlContent),
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log("Email sent:", info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error("Email sending failed:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send welcome email to new employee
   */
  async sendWelcomeEmail(employee, temporaryPassword) {
    const subject = `Welcome to ${process.env.APP_NAME || "CareerPay"}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .credentials { background: white; padding: 15px; border-left: 4px solid #4F46E5; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to ${process.env.APP_NAME || "CareerPay"}!</h1>
            </div>
            <div class="content">
              <p>Hi ${employee.firstName},</p>
              
              <p>Welcome to the team! Your employee account has been created.</p>
              
              <div class="credentials">
                <h3>Your Login Credentials:</h3>
                <p><strong>Email:</strong> ${employee.email}</p>
                <p><strong>Temporary Password:</strong> ${temporaryPassword}</p>
              </div>
              
              <p><strong>Important:</strong> Please change your password after your first login for security.</p>
              
              <a href="${
                process.env.APP_URL
              }/login" class="button">Login to Your Account</a>
              
              <p>If you have any questions, please contact HR.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} ${
      process.env.APP_NAME || "CareerPay"
    }. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return await this.sendEmail(employee.email, subject, html);
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(user, resetToken) {
    const resetUrl = `${process.env.APP_URL}/reset-password?token=${resetToken}`;
    const subject = "Password Reset Request";

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .warning { background: #FEF3C7; padding: 15px; border-left: 4px solid #F59E0B; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Reset Request</h1>
            </div>
            <div class="content">
              <p>Hi ${user.firstName},</p>
              
              <p>We received a request to reset your password. Click the button below to reset it:</p>
              
              <a href="${resetUrl}" class="button">Reset Password</a>
              
              <p>Or copy and paste this link in your browser:</p>
              <p style="word-break: break-all; color: #4F46E5;">${resetUrl}</p>
              
              <div class="warning">
                <p><strong>Security Notice:</strong></p>
                <ul>
                  <li>This link will expire in 1 hour</li>
                  <li>If you didn't request this, please ignore this email</li>
                  <li>Your password won't change unless you click the link above</li>
                </ul>
              </div>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} ${
      process.env.APP_NAME || "CareerPay"
    }. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return await this.sendEmail(user.email, subject, html);
  }

  /**
   * Send payslip email
   */
  async sendPayslipEmail(employee, payslip, pdfAttachment = null) {
    const subject = `Payslip for ${this.getMonthName(
      payslip.payrollPeriod.month
    )} ${payslip.payrollPeriod.year}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .summary { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
            .amount { font-size: 32px; color: #4F46E5; font-weight: bold; }
            .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Your Payslip is Ready</h1>
            </div>
            <div class="content">
              <p>Hi ${employee.firstName},</p>
              
              <p>Your salary for ${this.getMonthName(
                payslip.payrollPeriod.month
              )} ${payslip.payrollPeriod.year} has been processed.</p>
              
              <div class="summary">
                <h2>Payment Summary</h2>
                <p><strong>Gross Salary:</strong> ${this.formatCurrency(
                  payslip.grossSalary,
                  payslip.currency
                )}</p>
                <p><strong>Total Deductions:</strong> ${this.formatCurrency(
                  payslip.deductions.tax +
                    payslip.deductions.pension +
                    payslip.deductions.nhf,
                  payslip.currency
                )}</p>
                <p><strong>Net Pay:</strong></p>
                <p class="amount">${this.formatCurrency(
                  payslip.netSalary,
                  payslip.currency
                )}</p>
              </div>
              
              <a href="${
                process.env.APP_URL
              }/payslips" class="button">View Full Payslip</a>
              
              <p>Your payslip has been attached to this email as a PDF.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} ${
      process.env.APP_NAME || "CareerPay"
    }. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // TODO: Add PDF attachment when implemented
    return await this.sendEmail(employee.email, subject, html);
  }

  /**
   * Send vesting milestone email
   */
  async sendVestingMilestoneEmail(employee, vestingDetails) {
    const subject = `🎉 Shares Vested - ${vestingDetails.sharesVested} shares`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #10B981; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .highlight { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center; }
            .shares { font-size: 42px; color: #10B981; font-weight: bold; }
            .button { display: inline-block; padding: 12px 24px; background: #10B981; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .progress { background: #E5E7EB; height: 20px; border-radius: 10px; margin: 20px 0; }
            .progress-bar { background: #10B981; height: 100%; border-radius: 10px; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Congratulations!</h1>
              <p>Your Shares Have Vested</p>
            </div>
            <div class="content">
              <p>Hi ${employee.firstName},</p>
              
              <p>Great news! More of your equity has vested.</p>
              
              <div class="highlight">
                <p>Shares Vested Today:</p>
                <p class="shares">${vestingDetails.sharesVested.toFixed(2)}</p>
              </div>
              
              <h3>Your Equity Summary:</h3>
              <p><strong>Total Granted:</strong> ${vestingDetails.totalShares.toFixed(
                2
              )} shares</p>
              <p><strong>Total Vested:</strong> ${vestingDetails.totalVested.toFixed(
                2
              )} shares</p>
              <p><strong>Unvested:</strong> ${vestingDetails.totalUnvested.toFixed(
                2
              )} shares</p>
              
              <div class="progress">
                <div class="progress-bar" style="width: ${
                  vestingDetails.vestingProgress
                }%"></div>
              </div>
              <p style="text-align: center;">${vestingDetails.vestingProgress.toFixed(
                1
              )}% Vested</p>
              
              ${
                vestingDetails.nextVestingDate
                  ? `
                <p><strong>Next Vesting Date:</strong> ${new Date(
                  vestingDetails.nextVestingDate
                ).toLocaleDateString()}</p>
              `
                  : ""
              }
              
              <a href="${
                process.env.APP_URL
              }/equity" class="button">View Your Equity</a>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} ${
      process.env.APP_NAME || "CareerPay"
    }. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return await this.sendEmail(employee.email, subject, html);
  }

  /**
   * Send financing approval email
   */
  async sendFinancingApprovalEmail(company, financing) {
    const subject = `Financing Application Approved - ${this.formatCurrency(
      financing.approvedAmount,
      financing.currency
    )}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #10B981; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .details { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
            .button { display: inline-block; padding: 12px 24px; background: #10B981; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✓ Financing Approved!</h1>
            </div>
            <div class="content">
              <p>Good news! Your financing application has been approved.</p>
              
              <div class="details">
                <h3>Loan Details:</h3>
                <p><strong>Approved Amount:</strong> ${this.formatCurrency(
                  financing.approvedAmount,
                  financing.currency
                )}</p>
                <p><strong>Interest Rate:</strong> ${
                  financing.interestRate
                }%</p>
                <p><strong>Repayment Term:</strong> ${
                  financing.repaymentTermMonths
                } months</p>
                <p><strong>Total Repayment:</strong> ${this.formatCurrency(
                  financing.totalRepaymentAmount,
                  financing.currency
                )}</p>
              </div>
              
              <p>Funds will be disbursed within 24-48 hours.</p>
              
              <a href="${
                process.env.APP_URL
              }/financing" class="button">View Details</a>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} ${
      process.env.APP_NAME || "CareerPay"
    }. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return await this.sendEmail(company.email, subject, html);
  }

  /**
   * Send repayment reminder email
   */
  async sendRepaymentReminderEmail(company, repayment) {
    const subject = `Payment Reminder - ${this.formatCurrency(
      repayment.amount,
      repayment.currency
    )} Due`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #F59E0B; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .details { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
            .button { display: inline-block; padding: 12px 24px; background: #F59E0B; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Payment Reminder</h1>
            </div>
            <div class="content">
              <p>This is a reminder that you have an upcoming loan repayment due.</p>
              
              <div class="details">
                <h3>Payment Details:</h3>
                <p><strong>Amount Due:</strong> ${this.formatCurrency(
                  repayment.amount,
                  repayment.currency
                )}</p>
                <p><strong>Due Date:</strong> ${new Date(
                  repayment.dueDate
                ).toLocaleDateString()}</p>
              </div>
              
              <a href="${
                process.env.APP_URL
              }/financing" class="button">Make Payment</a>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} ${
      process.env.APP_NAME || "CareerPay"
    }. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return await this.sendEmail(company.email, subject, html);
  }

  /**
   * Helper: Format currency
   */
  formatCurrency(amount, currency = "NGN") {
    const symbols = {
      NGN: "₦",
      USD: "$",
    };

    return `${symbols[currency] || currency} ${amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  /**
   * Helper: Get month name
   */
  getMonthName(month) {
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    return months[month - 1];
  }

  /**
   * Helper: Strip HTML tags
   */
  stripHtml(html) {
    return html.replace(/<[^>]*>/g, "");
  }
}

export default new EmailService();
