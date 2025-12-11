import mongoose from "mongoose";

const companySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Company email is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    country: { type: String, default: 'Nigeria' },
    postalCode: String
  },
  industry: {
    type: String,
    trim: true
  },
  companySize: {
    type: String,
    enum: ['1-10', '11-50', '51-200', '201-500', '500+'],
    default: '1-10'
  },
  registrationNumber: {
    type: String,
    trim: true
  },
  taxId: {
    type: String,
    trim: true
  },
  website: {
    type: String,
    trim: true
  },
  logo: {
    type: String // URL to logo
  },
  baseCurrency: {
    type: String,
    enum: ['NGN', 'USD'],
    default: 'NGN'
  },
  payrollSettings: {
    paymentDay: {
      type: Number,
      min: 1,
      max: 31,
      default: 25 // Default payment day
    },
    payFrequency: {
      type: String,
      enum: ['monthly', 'bi-weekly', 'weekly'],
      default: 'monthly'
    },
    enableAutomaticTax: {
      type: Boolean,
      default: true
    },
    enablePension: {
      type: Boolean,
      default: true
    }
  },
  bankDetails: {
    bankName: String,
    accountNumber: String,
    accountName: String,
    sortCode: String
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  onboardingCompleted: {
    type: Boolean,
    default: false
  },
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'basic', 'premium', 'enterprise'],
      default: 'free'
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'cancelled'],
      default: 'active'
    },
    startDate: Date,
    endDate: Date
  }
}, {
  timestamps: true
});

// Virtual for employee count
companySchema.virtual('employeeCount', {
  ref: 'Employee',
  localField: '_id',
  foreignField: 'company',
  count: true
});

export default mongoose.model("Company", companySchema);