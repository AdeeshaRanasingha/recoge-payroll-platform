import { useState } from "react";
import { loginAdmin } from "./api";

export default function LoginView({ onLoginSuccess }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoginError("");
    setLoading(true);
    try {
      const data = await loginAdmin(username, password);
      onLoginSuccess(data.token, data.username || username);
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg w-full max-w-sm border-t-4 border-red-700"
      >
        <div className="mb-6">
          <h1 className="text-2xl font-black tracking-tight text-slate-900">RECOGE CLOTHING</h1>
          <p className="text-xs font-bold uppercase tracking-widest text-red-700 mt-0.5">
            Business Management System
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
              placeholder="••••••••"
            />
          </div>

          {loginError && (
            <p className="text-red-600 text-xs bg-red-50 border border-red-200 p-2 rounded">
              {loginError}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-700 hover:bg-red-800 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm transition shadow-sm"
          >
            {loading ? "Signing In..." : "Sign In to Admin Portal"}
          </button>
        </div>
      </form>
    </div>
  );
}