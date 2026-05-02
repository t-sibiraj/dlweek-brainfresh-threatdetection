import { useState, useEffect, useCallback } from "react";
import { Shield, Settings, LayoutDashboard, Wifi, WifiOff, BarChart3, Bell } from "lucide-react";
import { PipelineCard } from "./components/PipelineCard";
import { UploadPanel } from "./components/UploadPanel";
import { DashboardPage } from "./pages/DashboardPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { AlertsPage } from "./pages/AlertsPage";
import { LoginPage } from "./pages/LoginPage";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { useSocket } from "./hooks/useSocket";
import { fetchSources } from "./services/api";
import type { SourceState, Source, JobEvent, ThreatAlertEvent, Severity } from "./types";

type Page = "monitor" | "dashboard" | "settings" | "analytics" | "alerts";

function AppContent() {
  const { isAuthenticated, user, logout, loading: authLoading } = useAuth();
  const [page, setPage] = useState<Page>("monitor");
  const [sources, setSources] = useState<SourceState[]>([]);
  const [alerts, setAlerts] = useState<ThreatAlertEvent[]>([]);

  // ─── Socket handlers ────────────────────────────────────
  const handleJobQueued = useCallback((data: JobEvent) => {
    setSources((prev) =>
      prev.map((s) =>
        s.id === data.source_id
          ? { ...s, queueCount: s.queueCount + 1, lastUpdated: data.timestamp }
          : s
      )
    );
  }, []);

  const handleJobProcessing = useCallback((data: JobEvent) => {
    setSources((prev) =>
      prev.map((s) =>
        s.id === data.source_id
          ? {
              ...s,
              queueCount: Math.max(0, s.queueCount - 1),
              processingCount: s.processingCount + 1,
              lastUpdated: data.timestamp,
            }
          : s
      )
    );
  }, []);

  const handleJobCompleted = useCallback((data: JobEvent) => {
    setSources((prev) =>
      prev.map((s) =>
        s.id === data.source_id
          ? {
              ...s,
              processingCount: Math.max(0, s.processingCount - 1),
              lastThreatScore: data.threat_score,
              lastSeverity: data.severity as Severity | undefined,
              lastCategories: data.categories,
              lastSummary: data.summary,
              lastUpdated: data.timestamp,
            }
          : s
      )
    );
  }, []);

  const handleJobError = useCallback((data: JobEvent) => {
    setSources((prev) =>
      prev.map((s) =>
        s.id === data.source_id
          ? {
              ...s,
              processingCount: Math.max(0, s.processingCount - 1),
              lastUpdated: data.timestamp,
            }
          : s
      )
    );
  }, []);

  const handleThreatAlert = useCallback((data: ThreatAlertEvent) => {
    setAlerts((prev) => [data, ...prev].slice(0, 20));
    setSources((prev) =>
      prev.map((s) =>
        s.id === data.source_id ? { ...s, isEscalated: true } : s
      )
    );
  }, []);

  const { connected, getSocket } = useSocket({
    onJobQueued: handleJobQueued,
    onJobProcessing: handleJobProcessing,
    onJobCompleted: handleJobCompleted,
    onJobError: handleJobError,
    onThreatAlert: handleThreatAlert,
  });

  // ─── Load sources ───────────────────────────────────────
  async function loadSources() {
    try {
      const data = await fetchSources();
      setSources(
        data.map(
          (s: Source): SourceState => ({
            ...s,
            jobs: [],
            queueCount: 0,
            processingCount: 0,
            isEscalated: false,
          })
        )
      );
    } catch (err) {
      console.error("Failed to load sources:", err);
    }
  }

  useEffect(() => {
    loadSources();
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <span className="text-[11px] text-[#666] uppercase tracking-wider">Loading…</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* ─── Header ────────────────────────────────── */}
      <header className="border-b border-[#2a2a2a] sticky top-0 z-40 bg-black/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield className="w-4 h-4 text-[#ccc]" />
            <span className="text-xs font-bold tracking-[0.15em] uppercase">
              VoidDeckSafety
            </span>
          </div>

          {/* Nav */}
          <nav className="flex items-center gap-0.5">
            {(
              [
                { key: "monitor", label: "Monitor", icon: <Shield className="w-3 h-3" /> },
                { key: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="w-3 h-3" /> },
                { key: "analytics", label: "Analytics", icon: <BarChart3 className="w-3 h-3" /> },
                { key: "alerts", label: "Alerts", icon: <Bell className="w-3 h-3" /> },
                { key: "settings", label: "Settings", icon: <Settings className="w-3 h-3" /> },
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                onClick={() => setPage(item.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-bold uppercase tracking-wider transition-colors ${
                  page === item.key
                    ? "text-white bg-[#1a1a1a]"
                    : "text-[#bbb] hover:text-[#eee]"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>

          {/* Connection + User */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-[#ccc]">{user?.email}</span>
            <button
              onClick={logout}
              className="text-[10px] text-[#999] hover:text-white uppercase tracking-wider transition-colors"
            >
              Logout
            </button>
            <div className="flex items-center gap-1.5">
              {connected ? (
                <Wifi className="w-3 h-3 text-[#ccc]" />
              ) : (
                <WifiOff className="w-3 h-3 text-[#ff4444]" />
              )}
              <span className={`text-[10px] ${connected ? "text-[#ccc]" : "text-[#ff4444]"}`}>
                {connected ? "Live" : "Offline"}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Alerts ────────────────────────────────── */}
      {alerts.length > 0 && page === "monitor" && (
        <div className="border-b border-[#2a0000] bg-[#0a0000] px-6 py-2">
          <div className="max-w-6xl mx-auto flex items-center gap-3 overflow-x-auto">
            <span className="text-[10px] font-bold text-[#ff4444] uppercase tracking-wider shrink-0">
              Alert
            </span>
            {alerts.slice(0, 3).map((a, i) => (
              <span
                key={i}
                className="text-[10px] text-[#ff4444]/80 bg-[#1a0000] px-2 py-1 rounded border border-[#440000] whitespace-nowrap"
              >
                {a.source_id.slice(0, 8)}... — {a.threat_score}
                {a.reason && ` (${a.reason})`}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ─── Content ───────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {page === "monitor" && (
          <div className="space-y-6">
            <UploadPanel onSourceCreated={loadSources} />

            {sources.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-[11px] text-[#888] uppercase tracking-wider">
                  No sources. Create one to begin.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {sources.map((source) => (
                  <PipelineCard key={source.id} source={source} getSocket={getSocket} onDeleted={loadSources} />
                ))}
              </div>
            )}
          </div>
        )}

        {page === "dashboard" && <DashboardPage />}
        {page === "analytics" && <AnalyticsPage />}
        {page === "alerts" && <AlertsPage />}
        {page === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
