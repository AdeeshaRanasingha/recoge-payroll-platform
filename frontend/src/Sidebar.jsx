import {
  LayoutDashboard,
  CalendarCheck2,
  FileSpreadsheet,
  Users,
  History,
  LogOut,
  X,
  ShieldCheck,
} from "lucide-react";

export default function Sidebar({
  activeNav,
  onSelectNav,
  mobileMenuOpen,
  onCloseMobile,
  adminUser,
  onLogout,
  pendingDraftsCount,
  incompleteAttendanceCount,
  workersCount,
}) {
  const navItems = [
    {
      key: "overview",
      label: "Dashboard",
      icon: LayoutDashboard,
    },
    {
      key: "attendance",
      label: "Attendance",
      icon: CalendarCheck2,
      badge: incompleteAttendanceCount > 0 ? incompleteAttendanceCount : null,
      badgeTone: "bg-amber-500/20 text-amber-300",
    },
    {
      key: "payrolls",
      label: "Payrolls",
      icon: FileSpreadsheet,
      badge: pendingDraftsCount > 0 ? pendingDraftsCount : null,
      badgeTone: "bg-emerald-500/20 text-emerald-300",
    },
    {
      key: "workers",
      label: "Workers & Loans",
      icon: Users,
      count: workersCount,
    },
    {
      key: "activity",
      label: "Activity Ledger",
      icon: History,
    },
  ];

  function renderContent(isMobile = false) {
    return (
      <div className="flex flex-col h-full bg-slate-900 text-slate-200">
        {/* Brand Header */}
        <div className="px-5 py-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-6 bg-red-600 rounded-xs inline-block"></span>
              <span className="text-lg font-black tracking-tight text-white">RECOGE</span>
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mt-1">
              Clothing ERP Portal
            </p>
          </div>
          {isMobile && (
            <button
              onClick={onCloseMobile}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Navigation Links */}
        <div className="flex-1 px-3 py-5 space-y-6 overflow-y-auto">
          <div>
            <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Operations & HR
            </div>
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeNav === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => onSelectNav(item.key)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition ${
                      isActive
                        ? "bg-red-700 text-white shadow-sm"
                        : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon size={18} className={isActive ? "text-white" : "text-slate-400"} />
                      <span>{item.label}</span>
                    </span>
                    {item.badge ? (
                      <span
                        className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${
                          isActive ? "bg-white text-red-700" : item.badgeTone
                        }`}
                      >
                        {item.badge}
                      </span>
                    ) : item.count !== undefined ? (
                      <span className="text-xs text-slate-400">{item.count}</span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Live System Status Box */}
          <div className="mx-1 p-3.5 rounded-xl bg-slate-800/70 border border-slate-700/70 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>WhatsApp Bot Synced</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Logbook photos and commands sync automatically every 5 seconds.
            </p>
          </div>
        </div>

        {/* User Profile & Logout Footer */}
        <div className="p-4 border-t border-slate-800 space-y-3">
          <div className="flex items-center gap-2.5 px-2">
            <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-white uppercase">
              {adminUser.slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-white truncate capitalize">{adminUser}</div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                <ShieldCheck size={11} className="text-emerald-400" /> Administrator
              </div>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-red-700/90 transition"
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <aside className="hidden lg:block w-64 shrink-0 fixed inset-y-0 left-0 z-30">
        {renderContent(false)}
      </aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <aside className="relative w-72 max-w-[82vw] h-full z-50 shadow-2xl">
            {renderContent(true)}
          </aside>
        </div>
      )}
    </>
  );
}