import { Printer } from "lucide-react";

export default function PrintSlipView({ record, onClose }) {
  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-8 print:bg-white print:p-0 text-slate-900">
      <div className="max-w-xl mx-auto">
        <div className="flex justify-between items-center mb-4 print:hidden">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold hover:bg-slate-50"
          >
            Back to Portal
          </button>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm"
          >
            <Printer size={16} /> Print Salary Slip
          </button>
        </div>

        <div className="bg-white border-2 border-slate-900 p-6 sm:p-8 shadow-sm print:shadow-none">
          <div className="flex justify-between items-end border-b-2 border-red-700 pb-3 mb-5">
            <div>
              <h1 className="text-xl font-black tracking-wider">RECOGE CLOTHING</h1>
              <p className="text-xs font-bold text-red-700 uppercase tracking-widest">
                Employee Salary Slip
              </p>
            </div>
            <div className="text-xs text-right text-slate-600">
              <div>
                <strong>Date:</strong> {new Date().toLocaleDateString()}
              </div>
            </div>
          </div>

          <div className="text-sm mb-5 space-y-1.5 bg-slate-50 p-3 rounded border border-slate-200">
            <div>
              <span className="text-slate-500 font-medium">Employee Name:</span>{" "}
              <strong className="text-slate-900">{record.worker_name}</strong>
            </div>
            <div>
              <span className="text-slate-500 font-medium">Dates Worked:</span>{" "}
              <span className="font-medium">{record.dates_worked || "—"}</span>
            </div>
          </div>

          <table className="w-full text-sm border-collapse border border-slate-400 mb-5">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="p-2.5 text-left font-semibold">Description / Calculation</th>
                <th className="p-2.5 text-right font-semibold">Amount (LKR)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-300">
                <td className="p-2.5">
                  Basic Daily Wage (Rs. {record.daily_rate.toLocaleString()} x {record.full_days}{" "}
                  days)
                </td>
                <td className="p-2.5 text-right font-medium">
                  {record.basic_pay.toLocaleString()}
                </td>
              </tr>
              <tr className="border-b border-slate-300">
                <td className="p-2.5">
                  Overtime / OT (Rs. {record.ot_rate.toLocaleString()} x {record.ot_hours} hrs)
                </td>
                <td className="p-2.5 text-right font-medium">{record.ot_pay.toLocaleString()}</td>
              </tr>
              {record.extra_partial_pay > 0 && (
                <tr className="border-b border-slate-300">
                  <td className="p-2.5">
                    Partial / Short Day Pay{" "}
                    {record.partial_days?.length ? `(${record.partial_days.join(", ")})` : ""}
                  </td>
                  <td className="p-2.5 text-right font-medium">
                    {record.extra_partial_pay.toLocaleString()}
                  </td>
                </tr>
              )}
              <tr className="border-b border-slate-300 text-slate-700">
                <td className="p-2.5">Less: Salary Advance Deduction</td>
                <td className="p-2.5 text-right">
                  - {record.advance_deducted.toLocaleString()}
                </td>
              </tr>
              <tr className="border-b border-slate-300 text-slate-700">
                <td className="p-2.5">Less: Loan Deduction</td>
                <td className="p-2.5 text-right">- {record.loan_deducted.toLocaleString()}</td>
              </tr>
              <tr className="bg-red-50 font-bold border-t-2 border-red-700">
                <td className="p-3 text-slate-900">Total Payable</td>
                <td className="p-3 text-right text-base text-red-800">
                  Rs. {record.total_payable.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="grid grid-cols-3 border border-slate-400 text-center text-xs mb-8">
            <div className="p-2.5 border-r border-slate-400">
              <div className="font-bold text-slate-500">LOAN B/F</div>
              <div className="text-sm font-semibold mt-1">
                Rs. {record.loan_bf.toLocaleString()}
              </div>
            </div>
            <div className="p-2.5 border-r border-slate-400">
              <div className="font-bold text-slate-500">LOAN DEDUCTION</div>
              <div className="text-sm font-semibold mt-1">
                Rs. {record.loan_deducted.toLocaleString()}
              </div>
            </div>
            <div className="p-2.5 bg-slate-50">
              <div className="font-bold text-slate-500">LOAN C/F</div>
              <div className="text-sm font-bold text-red-700 mt-1">
                Rs. {record.loan_cf.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 text-xs pt-4 text-slate-700">
            <div>Employee Sign: ____________________</div>
            <div className="text-right">Approved By: ____________________</div>
          </div>
        </div>
      </div>
    </div>
  );
}