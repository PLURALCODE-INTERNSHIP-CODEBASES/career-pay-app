import mongoose from "mongoose";

const companySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },

  industry: {
    type: String,
    required: true,
    trim: true,
  },

  address: {
    street: String,
    city: String,
    state: String,
    country: {
      type: String,
      default: "Nigeria",
    },
    postalCode: String,
    required: true,
  },

  companySize: {
    type: String,
    enum: ["1-10", "11-50", "51-200", "201-500", "500+"],

    default: "1-10",
  },

  registerationNumber: {
    type: String,
    trim: true,
  },

  taxId: {
    type: String,
    trim: true,
  },

  logo: {
    type: String,
  },

  baseCurrency: {
    type: String,
    enum: ["NGN", "USD"],
    default: 25,
  },

  payrollSettings: {
    paymentDay: {
      type: Number,
      min: 1,
      max: 31,
      default: 25,
    },

    payFrequency: {
      type: String,
      enum: ["monthly", "biweekly", "weekly"],
      default: "monthly",
    },

    enableAutomaicTax: {
      type: Boolean,
      default: true,
    },

    enablePension: {
      type: Boolean,
      default: true,
    },
  },

  bankDetails: {
    bankName: String,
    accountName: String,
    sortCode: String,
  },

  isActive: {
    type: Boolean,
    default: true,
  },

  onboardingCompleted: {
    type: Boolean,
    default: false,
  },

  financingStatus: {
    type: String,
    enum: ["none", "under_review", "approved", "rejected"],
    default: "none",
  },

  subscription: {
    plan: {
      type: String,
      enum: ["active", "basic", "premium", "enterprise"],
      default: "free",
    },

    status: {
      type: String,
      enum: ["active", "suspended", "cancelled"],
      default: "active",
    },

    startDate: Date,
    endDate: Date,
  },
  timestamps: true,
});

// Virtual for employee count
companySchema.virtual("employmentCount", {
  ref: "Employee",
  localField: "_id",
  foreignField: "company",
  count: true,
});

export const Company = mongoose.model("Company", companySchema);
