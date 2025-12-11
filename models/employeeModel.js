import mongoose from "mongoose";

const employeeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  employeeId: {
    type: String,
    required: true,
    unique: true
  },
  department: {
    type: String,
    trim: true
  },
  position: {
    type: String,
    required: [true, 'Position is required'],
    trim: true
  },
  employmentType: {
    type: String,
    enum: ['full-time', 'part-time', 'contract', 'intern'],
    default: 'full-time'
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date
  },
  salary: {
    amount: {
      type: Number,
      required: [true, 'Salary amount is required'],
      min: 0
    },
    currency: {
      type: String,
      enum: ['NGN', 'USD'],
      default: 'NGN'
    },
    payFrequency: {
      type: String,
      enum: ['monthly', 'bi-weekly', 'weekly', 'hourly'],
      default: 'monthly'
    }
  },
  bankDetails: {
    bankName: String,
    accountNumber: String,
    accountName: String
  },
  taxInformation: {
    taxId: String, // TIN (Tax Identification Number)
    pensionId: String, // RSA PIN
    nhfNumber: String, // National Housing Fund
    taxRelief: {
      type: Number,
      default: 200000 // Annual tax relief in NGN (₦200,000 + 20% of gross + 1% of gross)
    }
  },
  manager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  terminationDate: Date,
  terminationReason: String
}, {
  timestamps: true
});

// Generate unique employee ID
employeeSchema.pre('save', async function(next) {
  if (this.isNew && !this.employeeId) {
    const company = await mongoose.model('Company').findById(this.company);
    const count = await this.constructor.countDocuments({ company: this.company });
    this.employeeId = `${company.name.substring(0, 3).toUpperCase()}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

export default mongoose.model("Employee", employeeSchema);