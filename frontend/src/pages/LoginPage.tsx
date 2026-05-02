import { useState } from "react";
import { Shield, LogIn, UserPlus, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

export function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password, displayName);
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <Shield className="w-5 h-5 text-[#ccc]" />
          <span className="text-sm font-bold tracking-[0.15em] uppercase text-white">
            VoidDeckSafety
          </span>
        </div>

        {/* Card */}
        <div className="border border-[#333] rounded-lg bg-[#0a0a0a] p-6">
          {/* Tabs */}
          <div className="flex gap-1 mb-6">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded text-[11px] font-bold uppercase tracking-wider transition-colors ${
                mode === "login"
                  ? "bg-[#1a1a1a] text-white"
                  : "text-[#999] hover:text-[#ccc]"
              }`}
            >
              <LogIn className="w-3 h-3" />
              Login
            </button>
            <button
              onClick={() => setMode("register")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded text-[11px] font-bold uppercase tracking-wider transition-colors ${
                mode === "register"
                  ? "bg-[#1a1a1a] text-white"
                  : "text-[#999] hover:text-[#ccc]"
              }`}
            >
              <UserPlus className="w-3 h-3" />
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="block text-[10px] font-bold tracking-[0.15em] uppercase text-[#ccc] mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded border border-[#333] bg-[#111] text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#555]"
                  placeholder="Your name"
                />
              </div>
            )}

            <div>
              <label className="block text-[10px] font-bold tracking-[0.15em] uppercase text-[#ccc] mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 rounded border border-[#333] bg-[#111] text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#555]"
                placeholder="admin@voiddecksafety.local"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold tracking-[0.15em] uppercase text-[#ccc] mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-3 py-2 rounded border border-[#333] bg-[#111] text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#555]"
                placeholder="••••••"
              />
            </div>

            {error && (
              <div className="flex items-center gap-1.5 text-[10px] text-red-400">
                <AlertCircle className="w-3 h-3" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded bg-white text-black text-xs font-bold uppercase tracking-wider hover:bg-[#ddd] transition-colors disabled:opacity-40"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : mode === "login" ? (
                <LogIn className="w-3.5 h-3.5" />
              ) : (
                <UserPlus className="w-3.5 h-3.5" />
              )}
              {loading
                ? "Please wait..."
                : mode === "login"
                ? "Sign In"
                : "Create Account"}
            </button>
          </form>

          {mode === "login" && (
            <p className="text-[10px] text-[#999] text-center mt-4">
              Default: admin@voiddecksafety.local / admin123
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
