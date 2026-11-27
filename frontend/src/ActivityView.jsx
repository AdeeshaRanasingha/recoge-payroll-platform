const ACTIVITY_LABELS = {
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

export default function ActivityView({ transactions }) {
  return (
    <div className="bg-white rounded-xl shadow-2xs border border-slate-200 overflow-hidden">
      <div className="px-4 py-3.5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
        <span className="text-xs font-bold uppercase text-slate-600">
          Recent WhatsApp Commands & System Transactions
        </span>
        <span className="text-[11px] text-slate-400">Latest 100 entries</span>
      </div>

      <div className="divide-y divide-slate-200">
        {transactions.map((t) => {
          const meta = ACTIVITY_LABELS[t.type] || {
            label: t.type,
            badge: "bg-slate-100 text-slate-700",
            sign: "",
          };
          return (
            <div
              key={t.tx_id}
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/70"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-sm text-slate-900">{t.worker_name}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${meta.badge}`}
                  >
                    {meta.label}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      t.source === "WHATSAPP"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {t.source || "ADMIN"}
                  </span>
                </div>
                <p className="text-xs text-slate-600">{t.note}</p>
              </div>

              <div className="flex sm:flex-col items-center sm:items-end justify-between text-right">
                {t.amount > 0 && (
                  <span className="text-sm font-extrabold text-slate-900">
                    {meta.sign} Rs. {t.amount.toLocaleString()}
                  </span>
                )}
                <span className="text-[11px] text-slate-400">
                  {new Date(t.createdAt).toLocaleString()}
                </span>
              </div>
            </div>
          );
        })}

        {transactions.length === 0 && (
          <div className="p-10 text-center text-sm text-slate-400">
            No activity logged yet. Send a WhatsApp command like "wasana loan +5000" to see it here.
          </div>
        )}
      </div>
    </div>
  );
}