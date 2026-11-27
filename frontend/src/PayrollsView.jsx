import { useState } from "react";
import { CheckCircle2, Printer, Trash2, Edit3, X, AlertCircle, RotateCcw } from "lucide-react";

function toIsoDay(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function payrollMatchesDateRange(payroll, fromDate, toDate) {
  if (!fromDate && !toDate) return true;

  const createdDay = toIsoDay(payroll.createdAt);
  const refYear = createdDay ? createdDay.slice(0, 4) : String(new Date().getFullYear());

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

export default function PayrollsView({ payrolls, workers = [], apiFetch, onRefresh, onPrintSlip }) {
  const [filterWorker, setFilterWorker] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL"); // "ALL" | "DRAFT" | "APPROVED"
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [editingPayroll, setEditingPayroll] = useState(null);
  const [editForm, setEditForm] = useState({});

  const hasFilters =
    filterWorker !== "ALL" || filterStatus !== "ALL" || Boolean(fromDate) || Boolean(toDate);

  function resetFilters() {
    setFilterWorker("ALL");
    setFilterStatus("ALL");
    setFromDate("");
    setToDate("");
  }

  function openEdit(p) {
    setEditingPayroll(p);
    setEditForm({
      dates_worked: p.dates_worked || "",
      full_days: p.full_days,
      ot_hours: p.ot_hours,
      extra_partial_pay: p.extra_partial_pay || 0,
      advance_deducted: p.advance_deducted,
      loan_deducted: p.loan_deducted,
    });
  }

  async function saveDraftChanges(e) {
    e.preventDefault();
    await apiFetch(`/api/payrolls/${editingPayroll.payroll_id}`, {
      method: "PUT",
      body: JSON.stringify(editForm),
    });
    setEditingPayroll(null);
    onRefresh(true);
  }

  async function handleApprove(p) {
    if (
      !window.confirm(
        `Approve payroll for ${p.worker_name}?\nNet Payable: Rs. ${p.total_payable.toLocaleString()}\n\nThis will deduct Rs. ${p.advance_deducted.toLocaleString()} from Advance and Rs. ${p.loan_deducted.toLocaleString()} from Loan B/F.`
      )
    ) {
      return;
    }

    await apiFetch(`/api/payrolls/${p.payroll_id}/approve`, {
      method: "POST",
      body: JSON.stringify({
        dates_worked: p.dates_worked,
        full_days: p.full_days,
        ot_hours: p.ot_hours,
        advance_deducted: p.advance_deducted,
        loan_deducted: p.loan_deducted,
        extra_partial_pay: p.extra_partial_pay,
      }),
    });
    onRefresh(true);
  }

  async function handleDelete(p) {
    if (!window.confirm(`Delete draft payroll for ${p.worker_name}?`)) return;
    await apiFetch(`/api/payrolls/${p.payroll_id}`, { method: "DELETE" });
    onRefresh(true);
  }

  const filtered = payrolls.filter((p) => {
    if (filterWorker !== "ALL" && p.worker_id !== filterWorker) return false;
    if (filterStatus !== "ALL" && p.status !== filterStatus) return false;
    return payrollMatchesDateRange(p, fromDate, toDate);
  });

  const filteredTotalPayable = filtered.reduce((s, p) => s + (p.total_payable || 0), 0);

  // Deduplicate worker options from workers list or payrolls fallback
  const workerOptions =
    workers.length > 0
      ? workers
      : Array.from(
          new Map(payrolls.map((p) => [p.worker_id, { worker_id: p.worker_id, full_name: p.worker_name }])).values()
        );

  const previewBasic = editingPayroll
    ? Math.round(Number(editForm.full_days || 0) * editingPayroll.daily_rate)
    : 0;
  const previewOt = editingPayroll
    ? Math.round(Number(editForm.ot_hours || 0) * editingPayroll.ot_rate)
    : 0;
  const previewNet = editingPayroll
    ? previewBasic +
      previewOt +
      Number(editForm.extra_partial_pay || 0) -
      Number(editForm.advance_deducted || 0) -
      Number(editForm.loan_deducted || 0)
    : 0;

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Worker
            </label>
            <select
              value={filterWorker}
              onChange={(e) => setFilterWorker(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium bg-white outline-none focus:ring-2 focus:ring-red-700"
            >
              <option value="ALL">All Workers ({workerOptions.length})</option>
              {workerOptions.map((w) => (
                <option key={w.worker_id} value={w.worker_id}>
                  {w.full_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium bg-white outline-none focus:ring-2 focus:ring-red-700"
            >
              <option value="ALL">All Payrolls ({payrolls.length})</option>
              <option value="DRAFT">Pending Drafts</option>
              <option value="APPROVED">Approved Slips</option>
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

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              Showing <strong className="text-slate-900">{filtered.length}</strong> record(s)
            </span>
            <span>•</span>
            <span>
              Total Net Payable:{" "}
              <strong className="text-slate-900">Rs. {filteredTotalPayable.toLocaleString()}</strong>
            </span>
          </div>

          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 text-red-700 font-semibold hover:underline"
            >
              <RotateCcw size={12} /> Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Payroll Cards */}
      <div className="space-y-3">
        {filtered.map((p) => {
          const isDraft = p.status === "DRAFT";
          return (
            <div
              key={p.payroll_id}
              className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 sm:p-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base text-slate-900">{p.worker_name}</h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        isDraft
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Dates: <strong className="text-slate-700">{p.dates_worked || "None"}</strong> (
                    {p.full_days} full days, {p.ot_hours} hrs OT)
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <div className="text-[11px] uppercase font-bold text-slate-400">Net Payable</div>
                  <div className="text-xl font-black text-slate-900">
                    Rs. {p.total_payable.toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 py-3 text-xs">
                <div className="bg-slate-50 p-2.5 rounded-lg">
                  <span className="text-slate-400 block">Basic Pay</span>
                  <strong className="text-slate-800">Rs. {p.basic_pay.toLocaleString()}</strong>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg">
                  <span className="text-slate-400 block">OT Pay</span>
                  <strong className="text-slate-800">Rs. {p.ot_pay.toLocaleString()}</strong>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg">
                  <span className="text-slate-400 block">Partial Pay</span>
                  <strong className="text-slate-800">
                    Rs. {(p.extra_partial_pay || 0).toLocaleString()}
                  </strong>
                </div>
                <div className="bg-amber-50/70 p-2.5 rounded-lg">
                  <span className="text-amber-800/70 block">Less Advance</span>
                  <strong className="text-amber-800">
                    - Rs. {p.advance_deducted.toLocaleString()}
                  </strong>
                </div>
                <div className="bg-red-50/70 p-2.5 rounded-lg">
                  <span className="text-red-800/70 block">Less Loan</span>
                  <strong className="text-red-800">
                    - Rs. {p.loan_deducted.toLocaleString()}
                  </strong>
                </div>
                <div className="bg-slate-100 p-2.5 rounded-lg">
                  <span className="text-slate-500 block">Loan B/F → C/F</span>
                  <strong className="text-slate-900">
                    {p.loan_bf.toLocaleString()} → {p.loan_cf.toLocaleString()}
                  </strong>
                </div>
              </div>

              {p.partial_days?.length > 0 && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200/80 text-xs text-amber-900 flex items-start gap-2">
                  <AlertCircle size={14} className="shrink-0 mt-0.5 text-amber-600" />
                  <div>
                    <span className="font-semibold">Partial Shifts:</span>{" "}
                    {p.partial_days.join(" | ")}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => onPrintSlip(p)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  <Printer size={13} /> Salary Slip
                </button>

                {isDraft && (
                  <>
                    <button
                      onClick={() => openEdit(p)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800"
                    >
                      <Edit3 size={13} /> Edit & Deduct Loan
                    </button>
                    <button
                      onClick={() => handleApprove(p)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white"
                    >
                      <CheckCircle2 size={13} /> Approve & Lock
                    </button>
                    <button
                      onClick={() => handleDelete(p)}
                      className="p-1.5 text-slate-400 hover:text-red-700 rounded"
                      title="Delete Draft"
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-xs text-slate-400">
            No payroll records match the selected filter.
          </div>
        )}
      </div>

      {/* Edit Draft Modal */}
      {editingPayroll && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-2xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-base text-slate-900">
                Adjust Payroll — {editingPayroll.worker_name}
              </h3>
              <button
                onClick={() => setEditingPayroll(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={saveDraftChanges} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Dates Worked
                </label>
                <input
                  type="text"
                  value={editForm.dates_worked}
                  onChange={(e) => setEditForm({ ...editForm, dates_worked: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Days (Rs. {editingPayroll.daily_rate}/d)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={editForm.full_days}
                    onChange={(e) => setEditForm({ ...editForm, full_days: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    OT Hours (Rs. {editingPayroll.ot_rate}/hr)
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    value={editForm.ot_hours}
                    onChange={(e) => setEditForm({ ...editForm, ot_hours: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Partial / Extra Day Pay (Rs.)
                </label>
                <input
                  type="number"
                  value={editForm.extra_partial_pay}
                  onChange={(e) =>
                    setEditForm({ ...editForm, extra_partial_pay: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-amber-800 mb-1">
                    Advance Deduction (Rs.)
                  </label>
                  <input
                    type="number"
                    value={editForm.advance_deducted}
                    onChange={(e) =>
                      setEditForm({ ...editForm, advance_deducted: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-red-800 mb-1">
                    Loan Deduction (B/F: {editingPayroll.loan_bf})
                  </label>
                  <input
                    type="number"
                    value={editForm.loan_deducted}
                    onChange={(e) => setEditForm({ ...editForm, loan_deducted: e.target.value })}
                    className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-900 text-white flex justify-between items-center text-sm">
                <span>Updated Net Payable:</span>
                <strong className="text-base">Rs. {previewNet.toLocaleString()}</strong>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingPayroll(null)}
                  className="px-4 py-2 text-sm text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg text-sm font-semibold"
                >
                  Save Draft
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}