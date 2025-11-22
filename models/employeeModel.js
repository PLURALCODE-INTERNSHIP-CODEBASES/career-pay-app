import mongoose from "mongoose";

const employeeSchema = new mongoose.SchemaType(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },

    employeeId: {
      type: String,
      required: true,
      unique: true,
    },

    department: {
      type: String,
      trim: true,
    },

    position: {
      type: String,
      required: true,
      trim: true,
    },

    employmentType: {
      type: String,
      enum: ["full_time", "part_time", "contract", "intern"],
      default: "full_time",
    },

    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
    },

    salary: {
      amount: {
        type: Number,
        required: true,
        min: 0,
      },

      currency: {
        type: String,
        enum: ["monthly", "bi_weekly", "weekly", "hourly"],
        default: "monthly",
      },
    },

    bankDetails: {
      bankName: String,
      accountNumber: String,
      accountName: String,
    },

    taxInformation: {
      taxId: String,
      pensionId: String,
      nhfNumber: String,
      taxRelief: {
        type: Number,
        default: 200000,
      },
    },
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    terminationDate: Date,
    terminationReason: String,
  },
  { timestamps: true }
);

// to generate unique employee ID
employeeSchema.pre("save", async function (next) {
  if (this.isNew && !thisemployeeId) {
    const company = await mongoose.model("Company").findById(this.company);
    const count = await this.constructor.countDocuments({
      company: this.company,
    });
    this.employeeId = `${company.name.substring(0, 3).toUpperCase()}-${String(
      count + 1
    ).padStart(4, "0")}`;
  }
  next();
});

export const Employee = mongoose.model("Employee", employeeSchema);
