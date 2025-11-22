import mongoose from "mongoose";

const repaymentScheduleSchema = new mongoose.Schema({
  dueDate: {
    type: Date,
    required: true,
  },

  amount: {
    type: Number,
    required: true,
    min: 0,
  },

  principal: {
    type: Number,
    required: true,
  },

  interest: {
    type: Number,
    required: true,
  },

  isPaid: {
    type: Boolean,
    default: false,
  },

  paidDate: Date,
  paidAmount: Number,
  paymentReference: String,
});

const financingSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },

    applicationDate: {
      type: Date,
      default: Date.now,
    },

    requestedAmounted: {
      type: Number,
      required: true,
      mmin: 0,
    },

    currency: {
      type: String,
      enum: ["NGN", "USD"],
      default: "NGN",
    },

    purpose: {
      type: String,
      enum: ["payroll", "operations", "growth", "other"],
      default: "payroll",
    },

    status: {
      type: String,
      enum: [
        "pending",
        "under_review",
        "approved",
        "rejected",
        "disbursed",
        "active",
        "completed",
        "defaulted",
      ],
      default: "pending",
    },

    interestRate: {
      type: Number,
      required: true,
      min: 1,
      max: 24,
    },

    repaymentFrequency: {
      type: String,
      enum: ["weekly", "bi_weekly", "monthly"],
      default: "monthly",
    },

    disbursementDate: Date,
    disbursementReference: String,
    totalRepaymentAmount: Number,
    amountRepaid: {
      type: Number,
      default: 0,
    },

    outstandingBalance: Number,
    repaymentSchedule: [repaymentScheduleSchema],
    financialPartner: {
      name: String,
      partnerId: String,
      contactEmail: String,
    },

    companyDetails: {
      monthlyRevenue: Number,
      employeeCount: Number,
      monthlyPayrollCost: Number,
      yearsInBusiness: SVGAnimatedNumber,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    reviewedAt: Date,
    reviewNotes: String,
    rejectionReason: String,
    documents: [
      {
        name: String,
        type: String,
        url: String,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

// Calculating oustanding balance
financingSchema.pre("save", function (next) {
  if (this.approvedAmount && this.amountRepaid !== undefined) {
    this.outstandingBalance =
      (this.totalRepaymentAmount || this.approvedAmount) - this.amountRepaid;
  }
  next();
});

export const Financing = mongoose.model("Financing", financingSchema);
