import dns from "node:dns";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

dns.setServers(["8.8.8.8", "1.1.1.1"]);

// Route Node socket dns.lookup() through 8.8.8.8 / 1.1.1.1 for MongoDB Atlas hosts
const resolver = new dns.Resolver();
resolver.setServers(["8.8.8.8", "1.1.1.1"]);
const originalLookup = dns.lookup;

dns.lookup = function customLookup(hostname, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  } else if (typeof options === "number") {
    options = { family: options };
  } else {
    options = options || {};
  }

  if (typeof hostname === "string" && hostname.endsWith(".mongodb.net")) {
    resolver.resolve4(hostname, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        return originalLookup.call(dns, hostname, options, callback);
      }
      if (options.all) {
        return callback(
          null,
          addresses.map((address) => ({ address, family: 4 }))
        );
      }
      return callback(null, addresses[0], 4);
    });
    return;
  }

  return originalLookup.call(dns, hostname, options, callback);
};

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password_hash: { type: String, required: true },
  company_id: { type: String, default: "RECOGE" },
  role: { type: String, default: "OWNER" },
});

const workerSchema = new mongoose.Schema(
  {
    company_id: { type: String, required: true, index: true },
    full_name: { type: String, required: true },
    aliases: { type: [String], default: [] },
    daily_rate: { type: Number, default: 2500 },
    ot_rate: { type: Number, default: 200 },
    advance_balance: { type: Number, default: 0 },
    loan_balance: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const attendanceSchema = new mongoose.Schema(
  {
    company_id: { type: String, required: true, index: true },
    worker_id: { type: mongoose.Schema.Types.ObjectId, ref: "Worker", required: true },
    worker_name: { type: String, required: true },
    date: { type: String, required: true },
    in_time: { type: String, required: true },
    out_time: { type: String, default: null },
    worked_minutes: { type: Number, default: 0 },
    ot_minutes: { type: Number, default: 0 },
    day_type: {
      type: String,
      enum: ["FULL", "PARTIAL", "INCOMPLETE"],
      default: "FULL",
    },
    source: { type: String, enum: ["WHATSAPP", "ADMIN"], default: "WHATSAPP" },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);
attendanceSchema.index({ company_id: 1, worker_id: 1, date: 1 }, { unique: true });

const payrollSchema = new mongoose.Schema(
  {
    company_id: { type: String, required: true, index: true },
    worker_id: { type: mongoose.Schema.Types.ObjectId, ref: "Worker", required: true },
    worker_name: { type: String, required: true },
    daily_rate: { type: Number, required: true },
    ot_rate: { type: Number, required: true },
    dates_worked: { type: String, default: "" },
    full_days: { type: Number, default: 0 },
    ot_hours: { type: Number, default: 0 },
    partial_days: { type: [String], default: [] },
    extra_partial_pay: { type: Number, default: 0 },
    basic_pay: { type: Number, default: 0 },
    ot_pay: { type: Number, default: 0 },
    advance_deducted: { type: Number, default: 0 },
    loan_bf: { type: Number, default: 0 },
    loan_deducted: { type: Number, default: 0 },
    loan_cf: { type: Number, default: 0 },
    total_payable: { type: Number, default: 0 },
    status: { type: String, enum: ["DRAFT", "APPROVED"], default: "DRAFT" },
    approved_at: { type: Date },
  },
  { timestamps: true }
);

const transactionSchema = new mongoose.Schema(
  {
    company_id: { type: String, required: true, index: true },
    worker_id: { type: mongoose.Schema.Types.ObjectId, ref: "Worker", required: true },
    worker_name: { type: String, default: "" },
    source: { type: String, enum: ["WHATSAPP", "ADMIN"], default: "ADMIN" },
    type: {
      type: String,
      enum: [
        "ADVANCE_GIVEN",
        "ADVANCE_REPAID",
        "LOAN_GIVEN",
        "LOAN_REPAID",
        "RATE_UPDATED",
        "PAYROLL_DRAFT",
        "PAYROLL_APPROVED",
        "WORKER_UPDATED",
        "ATTENDANCE_LOGGED",
      ],
      required: true,
    },
    amount: { type: Number, default: 0 },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

const waSessionSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  data: { type: String, required: true },
});

export const Admin = mongoose.model("Admin", adminSchema);
export const Worker = mongoose.model("Worker", workerSchema);
export const Attendance = mongoose.model("Attendance", attendanceSchema);
export const Payroll = mongoose.model("Payroll", payrollSchema);
export const Transaction = mongoose.model("Transaction", transactionSchema);
export const WaSession = mongoose.model("WaSession", waSessionSchema);

export async function initDatabase() {
  await mongoose.connect(process.env.MONGODB_URI, {
    family: 4,
    serverSelectionTimeoutMS: 15000,
  });
  console.log("Connected to MongoDB.");

  const adminUser = process.env.ADMIN_USER || "admin";
  const existing = await Admin.findOne({ username: adminUser });
  if (!existing) {
    await Admin.create({
      username: adminUser,
      password_hash: bcrypt.hashSync(process.env.ADMIN_PASS || "recoge123", 10),
      company_id: process.env.COMPANY_ID || "RECOGE",
      role: "OWNER",
    });
    console.log(`Seeded admin account: ${adminUser}`);
  }
}