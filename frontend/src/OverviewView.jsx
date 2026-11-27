import { useState, useMemo } from "react";
import {
  Clock,
  Wallet,
  CreditCard,
  ChevronRight,
  CalendarCheck2,
  TrendingUp,
  PieChart,
  BarChart3,
  Users,
  Filter,
  RotateCcw,
} from "lucide-react";

const ACTIVITY_BADGES = {
  LOAN_GIVEN: { label: "Loan Added", badge: "bg-red-100 text-red-800", sign: "+" },
  LOAN_REPAID: { label: "Loan Repaid", badge: "bg-emerald-100 text-emerald-800", sign: "-" },
  ADVANCE_GIVEN: { label: "Advance Added", badge: "bg-amber-100 text-amber-800", sign: "+" },
  ADVANCE_REPAID: { label: "Advance Deducted", badge: "bg-emerald-100 text-emerald-800", sign: "-" },
  RATE_UPDATED: { label: "Rate Updated", badge: "bg-blue-100 text-blue-800", sign: "" },
  PAYROLL_DRAFT: { label: "Payroll Draft", badge: "bg-purple-100 text-purple-800", sign: "" },
  PAYROLL_APPROVED: { label: "Payroll Approved", badge: "bg-slate-800 text-white", sign: "" },
  WORKER_UPDATED: { label: "Worker Profile", badge: "bg-slate-100 text-slate-700", sign: "" },
  ATTENDANCE_LOGGED: { label: "Attendance", badge: "bg-teal-100 text-teal-800", sign: "" },
};

// Normalizes YYYY/MM/DD or ISO timestamps to YYYY-MM-DD for range comparisons
function toIsoDay(value) {
  if (!value) return "";
  const str = String(value).trim();
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(str)) return str.replace(/\//g, "-");
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

// Checks if a payroll matches a date range (via its worked dates or createdAt date)
function payrollMatchesDateRange(payroll, fromDate, toDate) {
  if (!fromDate && !toDate) return true;

  const createdDay = toIsoDay(payroll.createdAt);
  const refYear = createdDay ? createdDay.slice(0, 4) : String(new Date().getFullYear());

  // Extract MM/DD tokens from dates_worked (e.g. "11/23, 11/24")
  const tokens = String(payroll.dates_worked || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{1,2}\/\d{1,2}$/.test(s));

  if (tokens.length > 0) {
    return tokens.some((mmdd) => {
      const [m, d] = mmdd.split("/");
      const iso = `${refYear}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      if (fromDate && iso < fromDate) return false;
      if (toDate && iso > toDate) return false;
      return true;
    });
  }

  if (!createdDay) return true;
  if (fromDate && createdDay < fromDate) return false;
  if (toDate && createdDay > toDate) return false;
  return true;
}

export default function OverviewView({
  workers,
  payrolls,
  attendance,
  transactions,
  onNavigate,
}) {
  const [selectedWorker, setSelectedWorker] = useState("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [payrollScope, setPayrollScope] = useState("ALL"); // "ALL" | "DRAFT" | "APPROVED"

  const hasFilters = selectedWorker !== "ALL" || Boolean(fromDate) || Boolean(toDate);

  function resetFilters() {
    setSelectedWorker("ALL");
    setFromDate("");
    setToDate("");
  }

  function applyQuickRange(daysBack) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - daysBack);
    setFromDate(start.toISOString().slice(0, 10));
    setToDate(end.toISOString().slice(0, 10));
  }

  // ─── FILTERED DATASETS ────────────────────────────────────────────────────
  const filteredWorkers = useMemo(
    () =>
      selectedWorker === "ALL"
        ? workers
        : workers.filter((w) => w.worker_id === selectedWorker),
    [workers, selectedWorker]
  );

  const filteredAttendance = useMemo(
    () =>
      attendance.filter((a) => {
        if (selectedWorker !== "ALL" && a.worker_id !== selectedWorker) return false;
        const iso = toIsoDay(a.date);
        if (fromDate && iso && iso < fromDate) return false;
        if (toDate && iso && iso > toDate) return false;
        return true;
      }),
    [attendance, selectedWorker, fromDate, toDate]
  );

  const filteredPayrolls = useMemo(
    () =>
      payrolls.filter((p) => {
        if (selectedWorker !== "ALL" && p.worker_id !== selectedWorker) return false;
        return payrollMatchesDateRange(p, fromDate, toDate);
      }),
    [payrolls, selectedWorker, fromDate, toDate]
  );

  const filteredTransactions = useMemo(
    () =>
      transactions.filter((t) => {
        if (selectedWorker !== "ALL" && t.worker_id !== selectedWorker) return false;
        const iso = toIsoDay(t.createdAt);
        if (fromDate && iso && iso < fromDate) return false;
        if (toDate && iso && iso > toDate) return false;
        return true;
      }),
    [transactions, selectedWorker, fromDate, toDate]
  );

  const pendingDrafts = filteredPayrolls.filter((p) => p.status === "DRAFT");
  const incompleteShifts = filteredAttendance.filter((a) => a.day_type === "INCOMPLETE");
  const totalAdvances = filteredWorkers.reduce((sum, w) => sum + (w.advance_balance || 0), 0);
  const totalLoans = filteredWorkers.reduce((sum, w) => sum + (w.loan_balance || 0), 0);

  // ─── 1. ATTENDANCE DONUT METRICS ──────────────────────────────────────────
  const fullCount = filteredAttendance.filter((a) => a.day_type === "FULL").length;
  const partialCount = filteredAttendance.filter((a) => a.day_type === "PARTIAL").length;
  const incompleteCount = incompleteShifts.length;
  const totalShifts = fullCount + partialCount + incompleteCount;

  const totalWorkedHrs = (
    filteredAttendance.reduce((sum, a) => sum + (a.worked_minutes || 0), 0) / 60
  ).toFixed(1);
  const totalOtHrs = (
    filteredAttendance.reduce((sum, a) => sum + (a.ot_minutes || 0), 0) / 60
  ).toFixed(1);

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const fullPct = totalShifts ? fullCount / totalShifts : 0;
  const partialPct = totalShifts ? partialCount / totalShifts : 0;
  const incompletePct = totalShifts ? incompleteCount / totalShifts : 0;

  const fullStroke = fullPct * circumference;
  const partialStroke = partialPct * circumference;
  const incompleteStroke = incompletePct * circumference;

  // ─── 2. PAYROLL COMPOSITION METRICS ───────────────────────────────────────
  const scopedPayrolls = filteredPayrolls.filter((p) =>
    payrollScope === "ALL" ? true : p.status === payrollScope
  );

  const sumBasic = scopedPayrolls.reduce((s, p) => s + (p.basic_pay || 0), 0);
  const sumOt = scopedPayrolls.reduce((s, p) => s + (p.ot_pay || 0), 0);
  const sumPartial = scopedPayrolls.reduce((s, p) => s + (p.extra_partial_pay || 0), 0);
  const sumGross = sumBasic + sumOt + sumPartial;

  const sumAdvDed = scopedPayrolls.reduce((s, p) => s + (p.advance_deducted || 0), 0);
  const sumLoanDed = scopedPayrolls.reduce((s, p) => s + (p.loan_deducted || 0), 0);
  const sumNetPayable = scopedPayrolls.reduce((s, p) => s + (p.total_payable || 0), 0);

  const basicBarPct = sumGross > 0 ? (sumBasic / sumGross) * 100 : 0;
  const otBarPct = sumGross > 0 ? (sumOt / sumGross) * 100 : 0;
  const partialBarPct = sumGross > 0 ? (sumPartial / sumGross) * 100 : 0;

  // ─── 3. DAILY ATTENDANCE HOURS BAR CHART ──────────────────────────────────
  const byDateMap = new Map();
  for (const row of filteredAttendance) {
    if (!row.date) continue;
    const prev = byDateMap.get(row.date) || { date: row.date, regularHrs: 0, otHrs: 0 };
    const totalH = (row.worked_minutes || 0) / 60;
    const otH = (row.ot_minutes || 0) / 60;
    const regH = Math.max(0, totalH - otH);
    prev.regularHrs += regH;
    prev.otHrs += otH;
    byDateMap.set(row.date, prev);
  }
  const dailyTrend = Array.from(byDateMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-10);

  const maxDailyHrs = Math.max(
    10,
    ...dailyTrend.map((d) => Math.ceil(d.regularHrs + d.otHrs))
  );

  // ─── 4. WORKER BALANCES EXPOSURE CHART ────────────────────────────────────
  const maxWorkerBalance = Math.max(
    1000,
    ...filteredWorkers.map((w) => Math.max(w.loan_balance || 0, w.advance_balance || 0))
  );

  return (
    <div className="space-y-6">
      {/* ─── GLOBAL WORKER & DATE RANGE FILTER BAR ────────────────────────── */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Worker
            </label>
            <select
              value={selectedWorker}
              onChange={(e) => setSelectedWorker(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium bg-white outline-none focus:ring-2 focus:ring-red-700"
            >
              <option value="ALL">All Workers ({workers.length})</option>
              {workers.map((w) => (
                <option key={w.worker_id} value={w.worker_id}>
                  {w.full_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              From Date
            </label>
            <input
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium bg-white outline-none focus:ring-2 focus:ring-red-700"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              To Date
            </label>
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium bg-white outline-none focus:ring-2 focus:ring-red-700"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => applyQuickRange(6)}
            className="px-2.5 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
          >
            Last 7 Days
          </button>
          <button
            type="button"
            onClick={() => applyQuickRange(29)}
            className="px-2.5 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
          >
            Last 30 Days
          </button>
          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold bg-red-50 hover:bg-red-100 text-red-700 transition"
            >
              <RotateCcw size={13} /> Reset
            </button>
          )}
        </div>
      </div>

      {/* ─── TOP KPI CARDS ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Pending Drafts</span>
            <Clock size={16} className="text-amber-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1.5">{pendingDrafts.length}</div>
          <button
            onClick={() => onNavigate("payrolls")}
            className="mt-2 text-[11px] font-semibold text-red-700 hover:underline inline-flex items-center gap-0.5"
          >
            Review payrolls <ChevronRight size={12} />
          </button>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Open Attendance</span>
            <CalendarCheck2 size={16} className="text-teal-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1.5">
            {incompleteShifts.length}
          </div>
          <button
            onClick={() => onNavigate("attendance")}
            className="mt-2 text-[11px] font-semibold text-red-700 hover:underline inline-flex items-center gap-0.5"
          >
            View logbook <ChevronRight size={12} />
          </button>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Outstanding Advances</span>
            <Wallet size={16} className="text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-700 mt-1.5">
            Rs. {totalAdvances.toLocaleString()}
          </div>
          <button
            onClick={() => onNavigate("workers")}
            className="mt-2 text-[11px] font-semibold text-slate-500 hover:underline inline-flex items-center gap-0.5"
          >
            {filteredWorkers.length} worker(s) <ChevronRight size={12} />
          </button>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Loans B/F</span>
            <CreditCard size={16} className="text-red-600" />
          </div>
          <div className="text-2xl font-black text-red-700 mt-1.5">
            Rs. {totalLoans.toLocaleString()}
          </div>
          <span className="mt-2 block text-[11px] text-slate-400">
            {selectedWorker === "ALL" ? "Across all active staff" : "Selected worker balance"}
          </span>
        </div>
      </div>

      {/* ─── ANALYTICS ROW 1: ATTENDANCE DONUT & PAYROLL COMPOSITION ──────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* DIAGRAM 1: ATTENDANCE BREAKDOWN DONUT CHART */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <PieChart size={16} className="text-red-700" />
                Attendance Shift Distribution
              </h2>
              <p className="text-xs text-slate-500">
                Breakdown of logged shifts by completion status
              </p>
            </div>
            <button
              onClick={() => onNavigate("attendance")}
              className="text-xs font-semibold text-red-700 hover:underline"
            >
              Details
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6 my-auto py-2">
            <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
              <svg viewBox="0 0 110 110" className="w-full h-full -rotate-90">
                <circle
                  cx="55"
                  cy="55"
                  r={radius}
                  fill="transparent"
                  stroke="#f1f5f9"
                  strokeWidth="14"
                />
                {totalShifts > 0 && (
                  <>
                    <circle
                      cx="55"
                      cy="55"
                      r={radius}
                      fill="transparent"
                      stroke="#10b981"
                      strokeWidth="14"
                      strokeDasharray={`${fullStroke} ${circumference}`}
                      strokeDashoffset={0}
                    />
                    <circle
                      cx="55"
                      cy="55"
                      r={radius}
                      fill="transparent"
                      stroke="#f59e0b"
                      strokeWidth="14"
                      strokeDasharray={`${partialStroke} ${circumference}`}
                      strokeDashoffset={-fullStroke}
                    />
                    <circle
                      cx="55"
                      cy="55"
                      r={radius}
                      fill="transparent"
                      stroke="#ef4444"
                      strokeWidth="14"
                      strokeDasharray={`${incompleteStroke} ${circumference}`}
                      strokeDashoffset={-(fullStroke + partialStroke)}
                    />
                  </>
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-black text-slate-900">{totalShifts}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Shifts
                </span>
              </div>
            </div>

            <div className="flex-1 w-full space-y-2.5">
              <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-emerald-50/70">
                <span className="flex items-center gap-2 font-semibold text-slate-800">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  Full Days (≥ 7h)
                </span>
                <span className="font-bold text-emerald-800">
                  {fullCount} ({totalShifts ? Math.round(fullPct * 100) : 0}%)
                </span>
              </div>

              <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-amber-50/70">
                <span className="flex items-center gap-2 font-semibold text-slate-800">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  Partial / Short Days
                </span>
                <span className="font-bold text-amber-800">
                  {partialCount} ({totalShifts ? Math.round(partialPct * 100) : 0}%)
                </span>
              </div>

              <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-red-50/70">
                <span className="flex items-center gap-2 font-semibold text-slate-800">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                  Pending Out Time
                </span>
                <span className="font-bold text-red-800">
                  {incompleteCount} ({totalShifts ? Math.round(incompletePct * 100) : 0}%)
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 mt-3 border-t border-slate-100 text-xs">
            <div className="bg-slate-50 px-3 py-2 rounded-lg flex justify-between">
              <span className="text-slate-500">Total Logged Time:</span>
              <span className="font-bold text-slate-900">{totalWorkedHrs} hrs</span>
            </div>
            <div className="bg-slate-50 px-3 py-2 rounded-lg flex justify-between">
              <span className="text-slate-500">Overtime Accrued:</span>
              <span className="font-bold text-red-700">{totalOtHrs} hrs</span>
            </div>
          </div>
        </div>

        {/* DIAGRAM 2: PAYROLL COST & DEDUCTION BREAKDOWN */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp size={16} className="text-red-700" />
                Payroll Cost & Payout Breakdown
              </h2>
              <p className="text-xs text-slate-500">
                Gross wage components vs. deductions ({scopedPayrolls.length} records)
              </p>
            </div>

            <div className="flex bg-slate-100 p-0.5 rounded-lg text-[11px] font-semibold">
              {["ALL", "DRAFT", "APPROVED"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setPayrollScope(tab)}
                  className={`px-2.5 py-1 rounded-md transition ${
                    payrollScope === tab
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {tab === "ALL" ? "All" : tab === "DRAFT" ? "Drafts" : "Approved"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4 my-auto">
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="font-semibold text-slate-600">Gross Earnings Mix</span>
                <span className="font-extrabold text-slate-900">
                  Rs. {sumGross.toLocaleString()}
                </span>
              </div>
              <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden flex">
                {sumGross > 0 ? (
                  <>
                    <div
                      style={{ width: `${basicBarPct}%` }}
                      className="bg-slate-800 h-full transition-all duration-300"
                      title={`Basic Wage: Rs. ${sumBasic.toLocaleString()}`}
                    />
                    <div
                      style={{ width: `${otBarPct}%` }}
                      className="bg-red-600 h-full transition-all duration-300"
                      title={`Overtime Pay: Rs. ${sumOt.toLocaleString()}`}
                    />
                    <div
                      style={{ width: `${partialBarPct}%` }}
                      className="bg-amber-500 h-full transition-all duration-300"
                      title={`Partial Day Pay: Rs. ${sumPartial.toLocaleString()}`}
                    />
                  </>
                ) : (
                  <div className="w-full h-full bg-slate-200" />
                )}
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-800"></span>
                  Basic: <strong>Rs. {sumBasic.toLocaleString()}</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-600"></span>
                  OT: <strong>Rs. {sumOt.toLocaleString()}</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  Partial: <strong>Rs. {sumPartial.toLocaleString()}</strong>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5 pt-2">
              <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-100">
                <div className="text-[11px] font-medium text-amber-900">Advance Ded.</div>
                <div className="text-sm font-extrabold text-amber-800 mt-0.5">
                  - Rs. {sumAdvDed.toLocaleString()}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-red-50/70 border border-red-100">
                <div className="text-[11px] font-medium text-red-900">Loan Ded.</div>
                <div className="text-sm font-extrabold text-red-800 mt-0.5">
                  - Rs. {sumLoanDed.toLocaleString()}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="text-[11px] font-semibold text-emerald-900">Net Payable</div>
                <div className="text-sm font-black text-emerald-800 mt-0.5">
                  Rs. {sumNetPayable.toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 mt-3 border-t border-slate-100 flex justify-between items-center text-xs">
            <span className="text-slate-500">
              {pendingDrafts.length} draft(s) awaiting approval
            </span>
            <button
              onClick={() => onNavigate("payrolls")}
              className="font-semibold text-red-700 hover:underline"
            >
              Manage Payrolls →
            </button>
          </div>
        </div>
      </div>

      {/* ─── ANALYTICS ROW 2: DAILY HOURS BAR CHART & WORKER BALANCES ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* DIAGRAM 3: DAILY WORKED & OVERTIME HOURS BAR CHART */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 size={16} className="text-red-700" />
                Daily Shift & Overtime Hours
              </h2>
              <p className="text-xs text-slate-500">
                Regular hours vs. OT hours across logged dates
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-600">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-slate-800"></span> Reg
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-red-600"></span> OT
              </span>
            </div>
          </div>

          {dailyTrend.length > 0 ? (
            <div className="pt-4">
              <div className="h-44 flex items-end justify-around gap-2 sm:gap-4 border-b border-slate-200 pb-2 px-2">
                {dailyTrend.map((day) => {
                  const regPct = (day.regularHrs / maxDailyHrs) * 100;
                  const otPct = (day.otHrs / maxDailyHrs) * 100;
                  const totalDayHrs = (day.regularHrs + day.otHrs).toFixed(1);

                  return (
                    <div
                      key={day.date}
                      className="flex-1 max-w-14 h-full flex flex-col justify-end items-center group"
                    >
                      <span className="text-[10px] font-bold text-slate-600 mb-1 opacity-80 group-hover:opacity-100">
                        {totalDayHrs}h
                      </span>
                      <div className="w-full max-w-9 flex flex-col-reverse rounded-t-md overflow-hidden bg-slate-100">
                        <div
                          style={{ height: `${Math.max(4, (regPct / 100) * 135)}px` }}
                          className="w-full bg-slate-800 transition-all duration-300"
                          title={`${day.date} Regular: ${day.regularHrs.toFixed(1)} hrs`}
                        />
                        {day.otHrs > 0 && (
                          <div
                            style={{ height: `${Math.max(4, (otPct / 100) * 135)}px` }}
                            className="w-full bg-red-600 transition-all duration-300"
                            title={`${day.date} OT: ${day.otHrs.toFixed(1)} hrs`}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-around gap-2 sm:gap-4 pt-2 px-2">
                {dailyTrend.map((day) => (
                  <div
                    key={day.date}
                    className="flex-1 max-w-14 text-center text-[10px] font-semibold text-slate-500 truncate"
                  >
                    {day.date.slice(5)}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-44 flex items-center justify-center text-xs text-slate-400 bg-slate-50 rounded-xl">
              No attendance entries found for the selected filter.
            </div>
          )}
        </div>

        {/* DIAGRAM 4: WORKER LOAN & ADVANCE EXPOSURE */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Users size={16} className="text-red-700" />
                Staff Loan & Advance Balances
              </h2>
              <p className="text-xs text-slate-500">
                Active recoverable balances per worker
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-600">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-red-600"></span> Loan
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-amber-500"></span> Advance
              </span>
            </div>
          </div>

          <div className="space-y-4 my-auto">
            {filteredWorkers.slice(0, 5).map((w) => {
              const loanWidth = Math.min(100, ((w.loan_balance || 0) / maxWorkerBalance) * 100);
              const advWidth = Math.min(
                100,
                ((w.advance_balance || 0) / maxWorkerBalance) * 100
              );
              return (
                <div key={w.worker_id} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-bold text-slate-900">{w.full_name}</span>
                    <span className="text-slate-500">
                      Loan:{" "}
                      <strong className="text-red-700">
                        Rs. {(w.loan_balance || 0).toLocaleString()}
                      </strong>{" "}
                      | Adv:{" "}
                      <strong className="text-amber-700">
                        Rs. {(w.advance_balance || 0).toLocaleString()}
                      </strong>
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${loanWidth}%` }}
                        className="h-full bg-red-600 rounded-full transition-all duration-300"
                      />
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${advWidth}%` }}
                        className="h-full bg-amber-500 rounded-full transition-all duration-300"
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredWorkers.length === 0 && (
              <div className="h-40 flex items-center justify-center text-xs text-slate-400 bg-slate-50 rounded-xl">
                No workers match the selected filter.
              </div>
            )}
          </div>

          <div className="pt-3 mt-3 border-t border-slate-100 flex justify-between items-center text-xs">
            <span className="text-slate-500">
              Combined Exposure: Rs. {(totalLoans + totalAdvances).toLocaleString()}
            </span>
            <button
              onClick={() => onNavigate("workers")}
              className="font-semibold text-red-700 hover:underline"
            >
              Manage Staff →
            </button>
          </div>
        </div>
      </div>

      {/* ─── QUEUES ROW 3: PENDING DRAFTS & RECENT ACTIVITY ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <span className="text-xs font-bold uppercase text-slate-700">
              Pending Payroll Approvals ({pendingDrafts.length})
            </span>
            <button
              onClick={() => onNavigate("payrolls")}
              className="text-xs font-semibold text-red-700 hover:underline"
            >
              Open Payrolls
            </button>
          </div>
          <div className="divide-y divide-slate-200">
            {pendingDrafts.slice(0, 5).map((p) => (
              <div key={p.payroll_id} className="p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-sm text-slate-900">{p.worker_name}</div>
                  <div className="text-xs text-slate-500">
                    {p.dates_worked || "No full dates"} ({p.full_days}d / {p.ot_hours}h OT)
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-extrabold text-slate-900">
                    Rs. {p.total_payable.toLocaleString()}
                  </div>
                  <button
                    onClick={() => onNavigate("payrolls")}
                    className="mt-1 text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    Review
                  </button>
                </div>
              </div>
            ))}
            {pendingDrafts.length === 0 && (
              <div className="p-8 text-center text-xs text-slate-400">
                No pending payroll drafts match the selected filter.
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <span className="text-xs font-bold uppercase text-slate-700">
              Recent Activity ({filteredTransactions.length})
            </span>
            <button
              onClick={() => onNavigate("activity")}
              className="text-xs font-semibold text-red-700 hover:underline"
            >
              Full Ledger
            </button>
          </div>
          <div className="divide-y divide-slate-200">
            {filteredTransactions.slice(0, 5).map((t) => {
              const meta = ACTIVITY_BADGES[t.type] || {
                label: t.type,
                badge: "bg-slate-100 text-slate-700",
                sign: "",
              };
              return (
                <div key={t.tx_id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 truncate">
                        {t.worker_name}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${meta.badge}`}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{t.note}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {t.amount > 0 && (
                      <div className="text-xs font-extrabold text-slate-900">
                        {meta.sign} Rs. {t.amount.toLocaleString()}
                      </div>
                    )}
                    <div className="text-[10px] text-slate-400">{t.source || "ADMIN"}</div>
                  </div>
                </div>
              );
            })}
            {filteredTransactions.length === 0 && (
              <div className="p-8 text-center text-xs text-slate-400">
                No activity recorded for the selected filter.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}