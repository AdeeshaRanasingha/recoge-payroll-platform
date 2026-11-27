import express from "express";
import cors from "cors";
import "dotenv/config";
import { Worker, Attendance, Payroll, Transaction, initDatabase } from "./db.js";
import { requireAdmin, handleLogin } from "./auth.js";
import { calculateAttendanceMetrics, syncOpenDraftsForWorker } from "./payroll.js";
import { startWhatsAppBot } from "./whatsapp.js";

const app = express();
app.use(
  cors({
    origin: process.env.FRONTEND_URL ? [process.env.FRONTEND_URL, "http://localhost:5173"] : "*",
  })
);
app.use(express.json());

// Health Check (for Render & UptimeRobot)
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// Auth
app.post("/api/login", handleLogin);

// Workers
app.get("/api/workers", requireAdmin, async (req, res) => {
  try {
    const workers = await Worker.find({
      company_id: req.admin.company_id,
      active: true,
    }).sort({ full_name: 1 });

    res.json(workers.map((w) => ({ ...w.toObject(), worker_id: w._id.toString() })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/workers", requireAdmin, async (req, res) => {
  try {
    const { full_name, aliases, daily_rate, ot_rate, advance_balance, loan_balance } = req.body;
    const parsedAliases = Array.isArray(aliases)
      ? aliases
      : String(aliases || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

    const worker = await Worker.create({
      company_id: req.admin.company_id,
      full_name: full_name.trim(),
      aliases: parsedAliases,
      daily_rate: Number(daily_rate || 2500),
      ot_rate: Number(ot_rate || 200),
      advance_balance: Number(advance_balance || 0),
      loan_balance: Number(loan_balance || 0),
    });

    await Transaction.create({
      company_id: req.admin.company_id,
      worker_id: worker._id,
      worker_name: worker.full_name,
      source: "ADMIN",
      type: "WORKER_UPDATED",
      amount: 0,
      note: `Worker added (Daily: Rs. ${worker.daily_rate}, OT: Rs. ${worker.ot_rate})`,
    });

    res.json({ ...worker.toObject(), worker_id: worker._id.toString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/workers/:workerId", requireAdmin, async (req, res) => {
  try {
    const { full_name, aliases, daily_rate, ot_rate, advance_balance, loan_balance } = req.body;
    const parsedAliases = Array.isArray(aliases)
      ? aliases
      : String(aliases || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

    const updated = await Worker.findOneAndUpdate(
      { _id: req.params.workerId, company_id: req.admin.company_id },
      {
        full_name: full_name.trim(),
        aliases: parsedAliases,
        daily_rate: Number(daily_rate),
        ot_rate: Number(ot_rate),
        advance_balance: Number(advance_balance ?? 0),
        loan_balance: Number(loan_balance ?? 0),
      },
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: "Worker not found" });
    await syncOpenDraftsForWorker(updated);

    await Transaction.create({
      company_id: req.admin.company_id,
      worker_id: updated._id,
      worker_name: updated.full_name,
      source: "ADMIN",
      type: "WORKER_UPDATED",
      amount: 0,
      note: `Updated profile (Daily: Rs. ${updated.daily_rate}, OT: Rs. ${updated.ot_rate}, Adv: Rs. ${updated.advance_balance}, Loan: Rs. ${updated.loan_balance})`,
    });

    res.json({ ...updated.toObject(), worker_id: updated._id.toString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/workers/:workerId", requireAdmin, async (req, res) => {
  try {
    await Worker.findOneAndUpdate(
      { _id: req.params.workerId, company_id: req.admin.company_id },
      { active: false }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/workers/:workerId/transaction", requireAdmin, async (req, res) => {
  try {
    const { type, amount, note } = req.body;
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ error: "Amount must be greater than 0" });
    }

    const incField = type === "ADVANCE_GIVEN" ? "advance_balance" : "loan_balance";
    const worker = await Worker.findOneAndUpdate(
      { _id: req.params.workerId, company_id: req.admin.company_id },
      { $inc: { [incField]: numAmount } },
      { new: true }
    );
    if (!worker) return res.status(404).json({ error: "Worker not found" });

    await Transaction.create({
      company_id: req.admin.company_id,
      worker_id: worker._id,
      worker_name: worker.full_name,
      source: "ADMIN",
      type,
      amount: numAmount,
      note: note || "Added via Admin Portal",
    });

    await syncOpenDraftsForWorker(worker);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Attendance
app.get("/api/attendance", requireAdmin, async (req, res) => {
  try {
    const rows = await Attendance.find({ company_id: req.admin.company_id })
      .sort({ date: -1, createdAt: -1 })
      .limit(300);

    res.json(
      rows.map((a) => ({
        ...a.toObject(),
        attendance_id: a._id.toString(),
        worker_id: a.worker_id.toString(),
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/attendance", requireAdmin, async (req, res) => {
  try {
    const { worker_id, date, in_time, out_time, note } = req.body;
    const worker = await Worker.findOne({ _id: worker_id, company_id: req.admin.company_id });
    if (!worker) return res.status(404).json({ error: "Worker not found" });

    const normalizedDate = String(date).replace(/-/g, "/");
    const metrics = calculateAttendanceMetrics(in_time, out_time || null);

    const record = await Attendance.findOneAndUpdate(
      { company_id: req.admin.company_id, worker_id: worker._id, date: normalizedDate },
      {
        worker_name: worker.full_name,
        in_time,
        out_time: out_time || null,
        ...metrics,
        source: "ADMIN",
        note: note || "",
      },
      { upsert: true, new: true }
    );

    await Transaction.create({
      company_id: req.admin.company_id,
      worker_id: worker._id,
      worker_name: worker.full_name,
      source: "ADMIN",
      type: "ATTENDANCE_LOGGED",
      amount: 0,
      note: `Logged attendance for ${normalizedDate} (${in_time} - ${out_time || "In Progress"})`,
    });

    res.json({
      ...record.toObject(),
      attendance_id: record._id.toString(),
      worker_id: record.worker_id.toString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/attendance/:attendanceId", requireAdmin, async (req, res) => {
  try {
    const { date, in_time, out_time, note } = req.body;
    const record = await Attendance.findOne({
      _id: req.params.attendanceId,
      company_id: req.admin.company_id,
    });
    if (!record) return res.status(404).json({ error: "Attendance entry not found" });

    const updatedIn = in_time ?? record.in_time;
    const updatedOut = out_time === "" ? null : out_time ?? record.out_time;
    const metrics = calculateAttendanceMetrics(updatedIn, updatedOut);

    if (date) record.date = String(date).replace(/-/g, "/");
    record.in_time = updatedIn;
    record.out_time = updatedOut;
    record.worked_minutes = metrics.worked_minutes;
    record.ot_minutes = metrics.ot_minutes;
    record.day_type = metrics.day_type;
    if (note !== undefined) record.note = note;

    await record.save();
    res.json({
      ...record.toObject(),
      attendance_id: record._id.toString(),
      worker_id: record.worker_id.toString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/attendance/:attendanceId", requireAdmin, async (req, res) => {
  try {
    await Attendance.findOneAndDelete({
      _id: req.params.attendanceId,
      company_id: req.admin.company_id,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Payrolls
app.get("/api/payrolls", requireAdmin, async (req, res) => {
  try {
    const records = await Payroll.find({ company_id: req.admin.company_id }).sort({
      createdAt: -1,
    });
    res.json(
      records.map((p) => ({
        ...p.toObject(),
        payroll_id: p._id.toString(),
        worker_id: p.worker_id.toString(),
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/payrolls/:payrollId", requireAdmin, async (req, res) => {
  try {
    const record = await Payroll.findOne({
      _id: req.params.payrollId,
      company_id: req.admin.company_id,
    });
    if (!record || record.status === "APPROVED") {
      return res.status(400).json({ error: "Only DRAFT payrolls can be edited" });
    }

    const {
      dates_worked,
      full_days,
      ot_hours,
      extra_partial_pay,
      advance_deducted,
      loan_deducted,
    } = req.body;

    const days = Number(full_days ?? record.full_days);
    const ot = Number(ot_hours ?? record.ot_hours);
    const partialPay = Number(extra_partial_pay ?? record.extra_partial_pay);
    const advDed = Number(advance_deducted ?? record.advance_deducted);
    const loanDed = Number(loan_deducted ?? record.loan_deducted);

    const basicPay = Math.round(days * record.daily_rate);
    const otPay = Math.round(ot * record.ot_rate);
    const loanCf = Math.max(0, record.loan_bf - loanDed);
    const totalPayable = basicPay + otPay + partialPay - advDed - loanDed;

    record.dates_worked = dates_worked ?? record.dates_worked;
    record.full_days = days;
    record.ot_hours = ot;
    record.basic_pay = basicPay;
    record.ot_pay = otPay;
    record.extra_partial_pay = partialPay;
    record.advance_deducted = advDed;
    record.loan_deducted = loanDed;
    record.loan_cf = loanCf;
    record.total_payable = totalPayable;

    await record.save();
    res.json({
      ...record.toObject(),
      payroll_id: record._id.toString(),
      worker_id: record.worker_id.toString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/payrolls/:payrollId", requireAdmin, async (req, res) => {
  try {
    const record = await Payroll.findOne({
      _id: req.params.payrollId,
      company_id: req.admin.company_id,
    });
    if (!record || record.status === "APPROVED") {
      return res.status(400).json({ error: "Cannot delete an approved payroll record" });
    }
    await record.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/payrolls/:payrollId/approve", requireAdmin, async (req, res) => {
  try {
    const {
      dates_worked,
      full_days,
      ot_hours,
      advance_deducted,
      loan_deducted,
      extra_partial_pay,
    } = req.body;

    const record = await Payroll.findOne({
      _id: req.params.payrollId,
      company_id: req.admin.company_id,
    });
    if (!record || record.status === "APPROVED") {
      return res.status(400).json({ error: "Record not found or already approved" });
    }

    const worker = await Worker.findOne({
      _id: record.worker_id,
      company_id: req.admin.company_id,
    });

    const days = Number(full_days ?? record.full_days);
    const ot = Number(ot_hours ?? record.ot_hours);
    const basicPay = Math.round(days * record.daily_rate);
    const otPay = Math.round(ot * record.ot_rate);
    const advDed = Number(advance_deducted ?? record.advance_deducted);
    const loanDed = Number(loan_deducted ?? record.loan_deducted);
    const partialPay = Number(extra_partial_pay ?? record.extra_partial_pay);

    const newAdvBal = Math.max(0, (worker?.advance_balance || 0) - advDed);
    const loanCf = Math.max(0, record.loan_bf - loanDed);
    const totalPayable = basicPay + otPay + partialPay - advDed - loanDed;

    record.dates_worked = dates_worked ?? record.dates_worked;
    record.full_days = days;
    record.ot_hours = ot;
    record.basic_pay = basicPay;
    record.ot_pay = otPay;
    record.advance_deducted = advDed;
    record.loan_deducted = loanDed;
    record.loan_cf = loanCf;
    record.extra_partial_pay = partialPay;
    record.total_payable = totalPayable;
    record.status = "APPROVED";
    record.approved_at = new Date();
    await record.save();

    if (worker) {
      worker.advance_balance = newAdvBal;
      worker.loan_balance = loanCf;
      await worker.save();
    }

    await Transaction.create({
      company_id: req.admin.company_id,
      worker_id: record.worker_id,
      worker_name: record.worker_name,
      source: "ADMIN",
      type: "PAYROLL_APPROVED",
      amount: totalPayable,
      note: `Approved payroll (${days}d, ${ot}h OT) | Loan C/F: Rs. ${loanCf.toLocaleString()}`,
    });

    res.json({ success: true, total_payable: totalPayable, loan_cf: loanCf });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Activity Ledger
app.get("/api/transactions", requireAdmin, async (req, res) => {
  try {
    const logs = await Transaction.find({ company_id: req.admin.company_id })
      .populate("worker_id", "full_name")
      .sort({ createdAt: -1 })
      .limit(100);

    res.json(
      logs.map((t) => {
        const obj = t.toObject();
        const resolvedName =
          obj.worker_name || obj.worker_id?.full_name || "Unknown Worker";
        const resolvedWorkerId =
          obj.worker_id?._id?.toString() || obj.worker_id?.toString() || "";

        return {
          ...obj,
          worker_name: resolvedName,
          tx_id: t._id.toString(),
          worker_id: resolvedWorkerId,
        };
      })
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
initDatabase().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`MongoDB API Server running on port ${PORT}`);
    startWhatsAppBot();
  });
});