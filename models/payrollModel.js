import mongoose from "mongoose";

const payrolItemSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    required: true,
  },

  grossSalary: {
    type: Number,
    required: true,
    min: 0,
  },

  deductions: {
    tax: { type: Number, default: 0 },
    pension: { type: Number, dfault: 0 },
    nhf: { typeNumber, default: 0 },
    otherDeductions: [
      {
        name: String,
        amount: Number,
        description: String,
      },
    ],
  },

  additions: {
    bonus: { type: Number, default: 0 },
    allowances: [
      {
        name: String,
        ammount: Number,
        description: String,
      },
    ],
    overtime: { type: Number, default: 0 },
  },
  employerContributions: {
    pension: { type: Number, default: 0 },
    nhis: { type: Number, default: 0 },
    itf: { type: Number, default: 0 },
    nsitf: { type: Number, default: 0 },
  },
  netSalary: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    enum: ["NGN", "USD"],
    default: "NGN",
  },

  paymentStatus: {
    type: String,
    enum: ["pending", "processing", "paid", "failed"],
    default: "pending",
  },
  paymentDate: Date,
  paymentReference: String,
});

const payrollSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },

    payrollPeriod: {
      month: {
        type: Number,
        required: true,
        min: 1,
        max: 12,
      },
      year: {
        type: Number,
        required: true,
      },
    },

    payrollItems: [payrollItemSchema],
    summary: {
      totalGross: { type: Number, default: 0 },
      totalDeductions: { type: Number, default: 0 },
      totalNet: { type: Number, default: 0 },
      totalEmployerContributions: { type: Number, default: 0 },
      totalEmployees: { type: Number, default: 0 },
    },

    status: {
      type: String,
      enum: [
        "draft",
        "calculated",
        "approved",
        "processing",
        "completed",
        "failed",
      ],
      default: "draft",
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    approvedAt: Date,

    proccesedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    proccesedAt: Date,

    financingUsed: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Financing",
    },

    notes: String,
  },

  {
    timestamps: true,
  }
);

payrollSchema.index(
  {
    compamy: 1,
    "payrollPeriod.month": 1,
    "payrollPeriod.year": 1,
  },
  { unique: true }
);

export const Payroll = mongoose.model("Payroll", payrollSchema);
