import { useState } from "react";
import { Plus, Edit3, Trash2, X, Clock, RotateCcw } from "lucide-react";

const DAY_TYPE_STYLES = {
  FULL: { label: "Full Day", badge: "bg-emerald-100 text-emerald-800" },
  PARTIAL: { label: "Partial Day", badge: "bg-amber-100 text-amber-800" },
  INCOMPLETE: { label: "No Out Time", badge: "bg-red-100 text-red-800" },
};

function formatDuration(mins) {
  if (!mins || mins <= 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export default function AttendanceView({ attendance, workers, apiFetch, onRefresh }) {
  const [filterWorker, setFilterWorker] = useState("ALL");
  const [filterType, setFilterType] = useState("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [form, setForm] = useState({
    worker_id: "",
    date: new Date().toISOString().slice(0, 10),
    in_time: "08:00",
    out_time: "",
    note: "",
  });

  const hasFilters =
    filterWorker !== "ALL" || filterType !== "ALL" || Boolean(fromDate) || Boolean(toDate);

  function resetFilters() {
    setFilterWorker("ALL");
    setFilterType("ALL");
    setFromDate("");
    setToDate("");
  }

  function openAddModal() {
    setEditingEntry(null);
    setForm({
      worker_id: workers[0]?.worker_id || "",
      date: new Date().toISOString().slice(0, 10),
      in_time: "08:00",
      out_time: "",
      note: "",
    });
    setShowModal(true);
  }

  function openEditModal(entry) {
    setEditingEntry(entry);
    setForm({
      worker_id: entry.worker_id,
      date: entry.date.replace(/\//g, "-"),
      in_time: entry.in_time || "08:00",
      out_time: entry.out_time || "",
      note: entry.note || "",
    });
    setShowModal(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (editingEntry) {
      await apiFetch(`/api/attendance/${editingEntry.attendance_id}`, {
        method: "PUT",
        body: JSON.stringify({
          date: form.date,
          in_time: form.in_time,
          out_time: form.out_time,
          note: form.note,
        }),
      });
    } else {
      await apiFetch("/api/attendance", {
        method: "POST",
        body: JSON.stringify(form),
      });
    }
    setShowModal(false);
    setEditingEntry(null);
    onRefresh(true);
  }

  async function handleDelete(entry) {
    if (!window.confirm(`Delete attendance entry for ${entry.worker_name} on ${entry.date}?`)) {
      return;
    }
    await apiFetch(`/api/attendance/${entry.attendance_id}`, { method: "DELETE" });
    onRefresh(true);
  }

  const filtered = attendance.filter((a) => {
    if (filterWorker !== "ALL" && a.worker_id !== filterWorker) return false;
    if (filterType !== "ALL" && a.day_type !== filterType) return false;
    const iso = String(a.date || "").replace(/\//g, "-");
    if (fromDate && iso && iso < fromDate) return false;
    if (toDate && iso && iso > toDate) return false;
    return true;
  });

  const totalFilteredHrs = (
    filtered.reduce((s, a) => s + (a.worked_minutes || 0), 0) / 60
  ).toFixed(1);
  const totalFilteredOt = (
    filtered.reduce((s, a) => s + (a.ot_minutes || 0), 0) / 60
  ).toFixed(1);

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
              Shift Type
            </label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium bg-white outline-none focus:ring-2 focus:ring-red-700"
            >
              <option value="ALL">All Shift Types</option>
              <option value="FULL">Full Days</option>
              <option value="PARTIAL">Partial Days</option>
              <option value="INCOMPLETE">No Out Time</option>
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

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>
              Showing <strong className="text-slate-900">{filtered.length}</strong> entries
            </span>
            <span>•</span>
            <span>
              Total: <strong className="text-slate-900">{totalFilteredHrs} hrs</strong>
            </span>
            <span>•</span>
            <span>
              OT: <strong className="text-red-700">{totalFilteredOt} hrs</strong>
            </span>
            {hasFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 text-red-700 font-semibold hover:underline ml-1"
              >
                <RotateCcw size={12} /> Reset Filters
              </button>
            )}
          </div>

          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 bg-red-700 hover:bg-red-800 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition"
          >
            <Plus size={14} /> Log Attendance
          </button>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-4">Worker</th>
              <th className="py-3 px-4">In Time</th>
              <th className="py-3 px-4">Out Time</th>
              <th className="py-3 px-4">Duration</th>
              <th className="py-3 px-4">OT</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Source</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-xs">
            {filtered.map((a) => {
              const badge = DAY_TYPE_STYLES[a.day_type] || DAY_TYPE_STYLES.FULL;
              const otHours = a.ot_minutes ? `${(a.ot_minutes / 60).toFixed(2)}h` : "—";
              return (
                <tr key={a.attendance_id} className="hover:bg-slate-50/80">
                  <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">{a.date}</td>
                  <td className="py-3 px-4 font-semibold text-slate-800">{a.worker_name}</td>
                  <td className="py-3 px-4 font-mono text-slate-700">{a.in_time}</td>
                  <td className="py-3 px-4 font-mono">
                    {a.out_time ? (
                      <span className="text-slate-700">{a.out_time}</span>
                    ) : (
                      <span className="text-red-600 font-semibold inline-flex items-center gap-1">
                        <Clock size={12} /> Pending
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-700">
                    {formatDuration(a.worked_minutes)}
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-900">{otHours}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${badge.badge}`}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-[11px] text-slate-400 font-semibold">{a.source}</td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <button
                      onClick={() => openEditModal(a)}
                      className="p-1.5 text-slate-500 hover:text-slate-900 rounded"
                      title="Edit Time"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(a)}
                      className="p-1.5 text-slate-400 hover:text-red-700 rounded ml-1"
                      title="Delete Entry"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="py-10 text-center text-slate-400 text-xs">
                  No attendance entries match the selected filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Attendance Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-2xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-base text-slate-900">
                {editingEntry ? `Edit Attendance — ${editingEntry.worker_name}` : "Log Attendance"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              {!editingEntry && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Worker</label>
                  <select
                    required
                    value={form.worker_id}
                    onChange={(e) => setForm({ ...form, worker_id: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    {workers.map((w) => (
                      <option key={w.worker_id} value={w.worker_id}>
                        {w.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    In Time (24h)
                  </label>
                  <input
                    type="time"
                    required
                    value={form.in_time}
                    onChange={(e) => setForm({ ...form, in_time: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Out Time (Leave blank if open)
                  </label>
                  <input
                    type="time"
                    value={form.out_time}
                    onChange={(e) => setForm({ ...form, out_time: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Note</label>
                <input
                  type="text"
                  placeholder="e.g., Half day / Left early"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg text-sm font-semibold"
                >
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}