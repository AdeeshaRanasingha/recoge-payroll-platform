import { useState } from "react";
import { Pencil, Trash2, Plus, X, UserPlus } from "lucide-react";

export default function WorkersView({
  workers,
  apiFetch,
  onRefresh,
  showAddWorker,
  setShowAddWorker,
}) {
  const [newWorker, setNewWorker] = useState({
    full_name: "",
    aliases: "",
    daily_rate: 2500,
    ot_rate: 200,
    advance_balance: 0,
    loan_balance: 0,
  });

  const [editingWorker, setEditingWorker] = useState(null);
  const [txModal, setTxModal] = useState(null);
  const [txForm, setTxForm] = useState({ amount: "", note: "" });

  async function handleAddWorker(e) {
    e.preventDefault();
    if (!newWorker.full_name.trim()) return;
    await apiFetch("/api/workers", {
      method: "POST",
      body: JSON.stringify(newWorker),
    });
    setNewWorker({
      full_name: "",
      aliases: "",
      daily_rate: 2500,
      ot_rate: 200,
      advance_balance: 0,
      loan_balance: 0,
    });
    setShowAddWorker(false);
    onRefresh(true);
  }

  function openEditWorker(worker) {
    setEditingWorker({
      ...worker,
      aliasesText: (worker.aliases || []).join(", "),
    });
  }

  async function handleSaveWorkerEdit(e) {
    e.preventDefault();
    await apiFetch(`/api/workers/${editingWorker.worker_id}`, {
      method: "PUT",
      body: JSON.stringify({
        full_name: editingWorker.full_name,
        aliases: editingWorker.aliasesText,
        daily_rate: Number(editingWorker.daily_rate),
        ot_rate: Number(editingWorker.ot_rate),
        advance_balance: Number(editingWorker.advance_balance),
        loan_balance: Number(editingWorker.loan_balance),
      }),
    });
    setEditingWorker(null);
    onRefresh(true);
  }

  async function handleDeleteWorker(worker) {
    if (!window.confirm(`Remove ${worker.full_name} from active workers?`)) return;
    await apiFetch(`/api/workers/${worker.worker_id}`, { method: "DELETE" });
    setEditingWorker(null);
    onRefresh(true);
  }

  function openTxModal(worker, type) {
    setTxModal({ worker, type });
    setTxForm({ amount: "", note: "" });
  }

  async function handleTransactionSubmit(e) {
    e.preventDefault();
    const num = Number(txForm.amount);
    if (!num || num <= 0) return;
    await apiFetch(`/api/workers/${txModal.worker.worker_id}/transaction`, {
      method: "POST",
      body: JSON.stringify({
        type: txModal.type,
        amount: num,
        note: txForm.note,
      }),
    });
    setTxModal(null);
    onRefresh(true);
  }

  return (
    <>
      {/* DESKTOP TABLE */}
      <div className="hidden md:block bg-white rounded-xl shadow-2xs border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="p-3.5">Worker Name</th>
              <th className="p-3.5">Daily Rate</th>
              <th className="p-3.5">OT Rate</th>
              <th className="p-3.5">Advance Balance</th>
              <th className="p-3.5">Loan B/F Balance</th>
              <th className="p-3.5 text-right">Manage & Funds</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {workers.map((w) => (
              <tr key={w.worker_id} className="hover:bg-slate-50/80">
                <td className="p-3.5">
                  <div className="font-bold text-slate-900">{w.full_name}</div>
                  <div className="text-xs text-slate-400">
                    Aliases: {(w.aliases || []).join(", ") || "None"}
                  </div>
                </td>
                <td className="p-3.5 font-medium">Rs. {w.daily_rate.toLocaleString()}</td>
                <td className="p-3.5 font-medium">Rs. {w.ot_rate.toLocaleString()}</td>
                <td className="p-3.5 font-bold text-amber-700">
                  Rs. {w.advance_balance.toLocaleString()}
                </td>
                <td className="p-3.5 font-bold text-red-700">
                  Rs. {w.loan_balance.toLocaleString()}
                </td>
                <td className="p-3.5 text-right space-x-1.5">
                  <button
                    onClick={() => openTxModal(w, "ADVANCE_GIVEN")}
                    className="bg-amber-100 hover:bg-amber-200 text-amber-900 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                  >
                    + Advance
                  </button>
                  <button
                    onClick={() => openTxModal(w, "LOAN_GIVEN")}
                    className="bg-red-100 hover:bg-red-200 text-red-900 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                  >
                    + Loan
                  </button>
                  <button
                    onClick={() => openEditWorker(w)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1"
                  >
                    <Pencil size={12} /> Edit
                  </button>
                </td>
              </tr>
            ))}
            {workers.length === 0 && (
              <tr>
                <td colSpan="6" className="p-10 text-center text-slate-400">
                  No workers added yet. Click "Add Worker" in the top right to begin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* MOBILE CARDS */}
      <div className="md:hidden space-y-3">
        <button
          onClick={() => setShowAddWorker(true)}
          className="w-full bg-slate-900 text-white py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
        >
          <UserPlus size={15} /> Add New Worker
        </button>

        {workers.map((w) => (
          <div
            key={w.worker_id}
            className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3"
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="font-bold text-slate-900">{w.full_name}</div>
                <div className="text-xs text-slate-400">
                  Aliases: {(w.aliases || []).join(", ") || "None"}
                </div>
              </div>
              <button
                onClick={() => openEditWorker(w)}
                className="flex items-center gap-1 bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
              >
                <Pencil size={12} /> Edit
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-lg">
              <div>
                <span className="text-slate-500 block">Daily / OT Rate</span>
                <span className="font-semibold">
                  Rs. {w.daily_rate.toLocaleString()} / Rs. {w.ot_rate.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Advance Balance</span>
                <span className="font-bold text-amber-700">
                  Rs. {w.advance_balance.toLocaleString()}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500 block">Current Loan B/F</span>
                <span className="font-bold text-red-700">
                  Rs. {w.loan_balance.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => openTxModal(w, "ADVANCE_GIVEN")}
                className="bg-amber-100 hover:bg-amber-200 text-amber-900 py-2 rounded-lg text-xs font-semibold"
              >
                + Give Advance
              </button>
              <button
                onClick={() => openTxModal(w, "LOAN_GIVEN")}
                className="bg-red-100 hover:bg-red-200 text-red-900 py-2 rounded-lg text-xs font-semibold"
              >
                + Give Loan
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ADD WORKER MODAL */}
      {showAddWorker && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <form
            onSubmit={handleAddWorker}
            className="bg-white rounded-t-2xl sm:rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl"
          >
            <div className="flex justify-between items-center border-b pb-3">
              <h2 className="text-base font-bold text-slate-900">Add New Worker</h2>
              <button
                type="button"
                onClick={() => setShowAddWorker(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Full Name (as written in logbook)
              </label>
              <input
                required
                placeholder="e.g. M. K. T. V. Wasana"
                value={newWorker.full_name}
                onChange={(e) => setNewWorker({ ...newWorker, full_name: e.target.value })}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Short Names / Aliases (comma separated)
              </label>
              <input
                placeholder="e.g. Wasana, M.K.T.V Wasana"
                value={newWorker.aliases}
                onChange={(e) => setNewWorker({ ...newWorker, aliases: e.target.value })}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Daily Rate (LKR)
                </label>
                <input
                  type="number"
                  required
                  value={newWorker.daily_rate}
                  onChange={(e) => setNewWorker({ ...newWorker, daily_rate: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  OT Rate / Hr (LKR)
                </label>
                <input
                  type="number"
                  required
                  value={newWorker.ot_rate}
                  onChange={(e) => setNewWorker({ ...newWorker, ot_rate: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Opening Advance (LKR)
                </label>
                <input
                  type="number"
                  value={newWorker.advance_balance}
                  onChange={(e) => setNewWorker({ ...newWorker, advance_balance: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Opening Loan B/F (LKR)
                </label>
                <input
                  type="number"
                  value={newWorker.loan_balance}
                  onChange={(e) => setNewWorker({ ...newWorker, loan_balance: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddWorker(false)}
                className="px-4 py-2 border rounded-lg text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg text-sm font-semibold flex items-center gap-1"
              >
                <Plus size={16} /> Save Worker
              </button>
            </div>
          </form>
        </div>
      )}

      {/* EDIT WORKER MODAL */}
      {editingWorker && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <form
            onSubmit={handleSaveWorkerEdit}
            className="bg-white rounded-t-2xl sm:rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl"
          >
            <div className="flex justify-between items-center border-b pb-3">
              <h2 className="text-base font-bold text-slate-900">Edit Worker Details</h2>
              <button
                type="button"
                onClick={() => setEditingWorker(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name</label>
              <input
                required
                value={editingWorker.full_name}
                onChange={(e) =>
                  setEditingWorker({ ...editingWorker, full_name: e.target.value })
                }
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Aliases (comma separated)
              </label>
              <input
                value={editingWorker.aliasesText}
                onChange={(e) =>
                  setEditingWorker({ ...editingWorker, aliasesText: e.target.value })
                }
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Daily Rate (LKR)
                </label>
                <input
                  type="number"
                  required
                  value={editingWorker.daily_rate}
                  onChange={(e) =>
                    setEditingWorker({ ...editingWorker, daily_rate: e.target.value })
                  }
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  OT Rate / Hr (LKR)
                </label>
                <input
                  type="number"
                  required
                  value={editingWorker.ot_rate}
                  onChange={(e) =>
                    setEditingWorker({ ...editingWorker, ot_rate: e.target.value })
                  }
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-amber-800 mb-1">
                  Advance Balance (LKR)
                </label>
                <input
                  type="number"
                  value={editingWorker.advance_balance}
                  onChange={(e) =>
                    setEditingWorker({ ...editingWorker, advance_balance: e.target.value })
                  }
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-red-800 mb-1">
                  Loan B/F Balance (LKR)
                </label>
                <input
                  type="number"
                  value={editingWorker.loan_balance}
                  onChange={(e) =>
                    setEditingWorker({ ...editingWorker, loan_balance: e.target.value })
                  }
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => handleDeleteWorker(editingWorker)}
                className="text-xs font-semibold text-red-600 hover:underline flex items-center gap-1"
              >
                <Trash2 size={14} /> Remove Worker
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingWorker(null)}
                  className="px-4 py-2 border rounded-lg text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ISSUE ADVANCE OR LOAN MODAL */}
      {txModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <form
            onSubmit={handleTransactionSubmit}
            className="bg-white rounded-t-2xl sm:rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-xl"
          >
            <div className="flex justify-between items-center border-b pb-3">
              <h2 className="text-base font-bold text-slate-900">
                {txModal.type === "ADVANCE_GIVEN" ? "Give Salary Advance" : "Give Employee Loan"}
              </h2>
              <button
                type="button"
                onClick={() => setTxModal(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Worker: <strong className="text-slate-800">{txModal.worker.full_name}</strong>
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Amount (LKR)
              </label>
              <input
                type="number"
                required
                min="1"
                autoFocus
                placeholder="e.g. 5000"
                value={txForm.amount}
                onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Note (Optional)
              </label>
              <input
                placeholder="e.g. Mid-week cash advance"
                value={txForm.note}
                onChange={(e) => setTxForm({ ...txForm, note: e.target.value })}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTxModal(null)}
                className="px-4 py-2 border rounded-lg text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`px-4 py-2 text-white rounded-lg text-sm font-semibold ${
                  txModal.type === "ADVANCE_GIVEN"
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-red-700 hover:bg-red-800"
                }`}
              >
                Confirm Amount
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}