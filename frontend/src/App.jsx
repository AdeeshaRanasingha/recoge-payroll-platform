import { useState, useEffect, useMemo } from "react";
import { RefreshCw, Menu, UserPlus } from "lucide-react";
import { createApiClient } from "./api";
import LoginView from "./LoginView";
import Sidebar from "./Sidebar";
import OverviewView from "./OverviewView";
import AttendanceView from "./AttendanceView";
import PayrollsView from "./PayrollsView";
import WorkersView from "./WorkersView";
import ActivityView from "./ActivityView";
import PrintSlipView from "./PrintSlipView";

const PAGE_META = {
  overview: {
    title: "Business Overview",
    subtitle: "Real-time summary of attendance, payroll drafts, staff advances, and active loans",
  },
  attendance: {
    title: "Daily Attendance Logbook",
    subtitle: "Track full days, partial shifts, overtime hours, and pending Out Times",
  },
  payrolls: {
    title: "Payrolls & Salary Slips",
    subtitle: "Review WhatsApp attendance extractions, adjust deductions, and approve payouts",
  },
  workers: {
    title: "Workers, Advances & Loans",
    subtitle: "Manage staff daily/OT rates, mid-week cash advances, and loan balances",
  },
  activity: {
    title: "Activity & Transaction Ledger",
    subtitle: "Complete audit log of WhatsApp commands and Admin Portal actions",
  },
};

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("recoge_token") || "");
  const [adminUser, setAdminUser] = useState(localStorage.getItem("recoge_user") || "admin");

  const [workers, setWorkers] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [payrolls, setPayrolls] = useState([]);
  const [transactions, setTransactions] = useState([]);

  const [activeNav, setActiveNav] = useState("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [showAddWorker, setShowAddWorker] = useState(false);
  const [printRecord, setPrintRecord] = useState(null);

  function handleLogout() {
    localStorage.removeItem("recoge_token");
    localStorage.removeItem("recoge_user");
    setToken("");
  }

  function handleLoginSuccess(newToken, newUsername) {
    localStorage.setItem("recoge_token", newToken);
    localStorage.setItem("recoge_user", newUsername);
    setAdminUser(newUsername);
    setToken(newToken);
  }

  const apiFetch = useMemo(() => createApiClient(token, handleLogout), [token]);

  async function loadDashboard(showSpinner = false) {
    if (!token) return;
    if (showSpinner) setSyncing(true);
    try {
      const [wData, aData, pData, tData] = await Promise.all([
        apiFetch("/api/workers"),
        apiFetch("/api/attendance"),
        apiFetch("/api/payrolls"),
        apiFetch("/api/transactions"),
      ]);
      setWorkers(wData);
      setAttendance(aData);
      setPayrolls(pData);
      setTransactions(tData);
    } finally {
      if (showSpinner) setSyncing(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    loadDashboard();
    const timer = setInterval(() => loadDashboard(false), 5000);
    return () => clearInterval(timer);
  }, [token]);

  function selectNav(key) {
    setActiveNav(key);
    setMobileMenuOpen(false);
  }

  if (printRecord) {
    return <PrintSlipView record={printRecord} onClose={() => setPrintRecord(null)} />;
  }

  if (!token) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  const pendingDraftsCount = payrolls.filter((p) => p.status === "DRAFT").length;
  const incompleteAttendanceCount = attendance.filter((a) => a.day_type === "INCOMPLETE").length;
  const meta = PAGE_META[activeNav] || PAGE_META.overview;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex">
      <Sidebar
        activeNav={activeNav}
        onSelectNav={selectNav}
        mobileMenuOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        adminUser={adminUser}
        onLogout={handleLogout}
        pendingDraftsCount={pendingDraftsCount}
        incompleteAttendanceCount={incompleteAttendanceCount}
        workersCount={workers.length}
      />

      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 sm:px-8 py-3.5">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100"
                aria-label="Open menu"
              >
                <Menu size={22} />
              </button>
              <div className="min-w-0">
                <h1 className="text-base sm:text-xl font-black tracking-tight text-slate-900 truncate">
                  {meta.title}
                </h1>
                <p className="text-xs text-slate-500 truncate hidden sm:block">{meta.subtitle}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => loadDashboard(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg transition"
              >
                <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
                <span>Sync</span>
              </button>

              {activeNav === "workers" && (
                <button
                  onClick={() => setShowAddWorker(true)}
                  className="flex items-center gap-1.5 bg-red-700 hover:bg-red-800 text-white px-3.5 py-2 rounded-lg text-xs font-semibold shadow-2xs transition"
                >
                  <UserPlus size={15} />
                  <span className="hidden sm:inline">Add Worker</span>
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-6 space-y-6">
          {activeNav === "overview" && (
            <OverviewView
              workers={workers}
              payrolls={payrolls}
              attendance={attendance}
              transactions={transactions}
              onNavigate={selectNav}
            />
          )}

          {activeNav === "attendance" && (
            <AttendanceView
              attendance={attendance}
              workers={workers}
              apiFetch={apiFetch}
              onRefresh={loadDashboard}
            />
          )}

          {activeNav === "payrolls" && (
            <PayrollsView
              payrolls={payrolls}
              workers={workers}
              apiFetch={apiFetch}
              onRefresh={loadDashboard}
              onPrintSlip={setPrintRecord}
            />
          )}

          {activeNav === "workers" && (
            <WorkersView
              workers={workers}
              apiFetch={apiFetch}
              onRefresh={loadDashboard}
              showAddWorker={showAddWorker}
              setShowAddWorker={setShowAddWorker}
            />
          )}

          {activeNav === "activity" && <ActivityView transactions={transactions} />}
        </main>
      </div>
    </div>
  );
}