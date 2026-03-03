import { useEffect, useState } from "react";
import {
  BarChart3,
  TrendingUp,
  Cpu,
  RefreshCw,
  Loader2,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  fetchTrend,
  fetchSourceAnalytics,
  fetchCategoryBreakdown,
  fetchLatencyStats,
  fetchAIProviders,
  setAIProvider,
} from "../services/api";
import { useAuth } from "../hooks/useAuth";
import type {
  TrendPoint,
  SourceAnalytics,
  CategoryBreakdown,
  LatencyStats,
  AIProviderInfo,
} from "../types";

export function AnalyticsPage() {
  const { hasRole } = useAuth();
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [sources, setSources] = useState<SourceAnalytics[]>([]);
  const [categories, setCategories] = useState<CategoryBreakdown[]>([]);
  const [latency, setLatency] = useState<LatencyStats | null>(null);
  const [providers, setProviders] = useState<AIProviderInfo[]>([]);
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    setLoading(true);
    try {
      const [t, s, c, l, p] = await Promise.all([
        fetchTrend(hours),
        fetchSourceAnalytics(),
        fetchCategoryBreakdown(hours),
        fetchLatencyStats(),
        fetchAIProviders(),
      ]);
      setTrend(t);
      setSources(s);
      setCategories(c);
      setLatency(l);
      setProviders(p);
    } catch (err) {
      console.error("Analytics load error:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [hours]);

  async function handleProviderChange(provider: string) {
    try {
      await setAIProvider(provider);
      const p = await fetchAIProviders();
      setProviders(p);
    } catch (err: any) {
      console.error("Provider change error:", err);
    }
  }

  const trendFormatted = trend.map((t) => ({
    ...t,
    time: new Date(t.bucket).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[#ccc]" />
          <span className="text-xs font-bold tracking-[0.15em] uppercase text-white">
            Analytics
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Time range selector */}
          <div className="flex gap-1">
            {[6, 12, 24, 48, 168].map((h) => (
              <button
                key={h}
                onClick={() => setHours(h)}
                className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  hours === h
                    ? "bg-[#1a1a1a] text-white border border-[#444]"
                    : "text-[#999] hover:text-[#ccc]"
                }`}
              >
                {h < 48 ? `${h}h` : `${h / 24}d`}
              </button>
            ))}
          </div>
          <button
            onClick={loadAll}
            disabled={loading}
            className="p-1.5 rounded border border-[#333] hover:border-[#555] transition-colors"
          >
            {loading ? (
              <Loader2 className="w-3 h-3 text-[#ccc] animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3 text-[#ccc]" />
            )}
          </button>
        </div>
      </div>

      {/* Latency stats row */}
      {latency && (
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: "Total Jobs", value: latency.total_jobs },
            { label: "Avg Latency", value: `${latency.avg_ms}ms` },
            { label: "Min", value: `${latency.min_ms}ms` },
            { label: "Max", value: `${latency.max_ms}ms` },
            { label: "P95", value: `${latency.p95_ms}ms` },
          ].map((s) => (
            <div
              key={s.label}
              className="border border-[#333] rounded bg-[#0a0a0a] p-3 text-center"
            >
              <p className="text-[9px] font-bold tracking-[0.15em] uppercase text-[#ccc]">
                {s.label}
              </p>
              <p className="text-lg font-bold text-white mt-1">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Threat trend chart */}
      <div className="border border-[#333] rounded-lg bg-[#0a0a0a] p-4">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-3.5 h-3.5 text-[#ccc]" />
          <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-[#ccc]">
            Threat Trend
          </span>
        </div>
        {trendFormatted.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendFormatted}>
              <CartesianGrid strokeDasharray="3 3" stroke="#222" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: "#666" }}
                stroke="#333"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#666" }}
                stroke="#333"
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#111",
                  border: "1px solid #333",
                  fontSize: 11,
                  color: "#ccc",
                }}
              />
              <Line
                type="monotone"
                dataKey="avg_score"
                stroke="#fff"
                strokeWidth={1.5}
                dot={false}
                name="Avg Score"
              />
              <Line
                type="monotone"
                dataKey="max_score"
                stroke="#666"
                strokeWidth={1}
                strokeDasharray="4 4"
                dot={false}
                name="Max Score"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-[11px] text-[#666] text-center py-10">
            No threat events in the selected period
          </p>
        )}
      </div>

      {/* Two-column: Categories + Source breakdown */}
      <div className="grid grid-cols-2 gap-4">
        {/* Category breakdown */}
        <div className="border border-[#333] rounded-lg bg-[#0a0a0a] p-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-3.5 h-3.5 text-[#ccc]" />
            <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-[#ccc]">
              Category Breakdown
            </span>
          </div>
          {categories.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={categories} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: "#666" }}
                  stroke="#333"
                />
                <YAxis
                  dataKey="category"
                  type="category"
                  tick={{ fontSize: 9, fill: "#999" }}
                  stroke="#333"
                  width={100}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#111",
                    border: "1px solid #333",
                    fontSize: 11,
                    color: "#ccc",
                  }}
                />
                <Bar dataKey="count" name="Detections">
                  {categories.map((_, i) => (
                    <Cell
                      key={i}
                      fill={i === 0 ? "#fff" : i < 3 ? "#888" : "#444"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-[11px] text-[#999] text-center py-10">
              No category data
            </p>
          )}
        </div>

        {/* Source breakdown */}
        <div className="border border-[#333] rounded-lg bg-[#0a0a0a] p-4">
          <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-[#ccc] block mb-3">
            Source Breakdown
          </span>
          {sources.length > 0 ? (
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {sources.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between px-2.5 py-2 rounded border border-[#2a2a2a] bg-[#111]"
                >
                  <div>
                    <p className="text-[11px] text-white font-medium">
                      {s.name}
                    </p>
                    <p className="text-[9px] text-[#999] uppercase">
                      {s.mode} · {s.total_events} events
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-white">
                      {s.avg_score ?? 0}
                    </p>
                    <p className="text-[9px] text-[#999]">
                      avg · {s.high_events} high
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-[#999] text-center py-10">
              No source data
            </p>
          )}
        </div>
      </div>

      {/* AI Provider selector */}
      <div className="border border-[#333] rounded-lg bg-[#0a0a0a] p-4">
        <div className="flex items-center gap-2 mb-4">
          <Cpu className="w-3.5 h-3.5 text-[#ccc]" />
          <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-[#ccc]">
            AI Provider
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {providers.map((p) => (
            <button
              key={p.provider}
              onClick={() => hasRole("admin") && handleProviderChange(p.provider)}
              disabled={!p.configured || !hasRole("admin")}
              className={`p-3 rounded border transition-colors text-center ${
                p.active
                  ? "border-white bg-[#1a1a1a] text-white"
                  : p.configured
                  ? "border-[#333] bg-[#111] text-[#ccc] hover:border-[#555]"
                  : "border-[#222] bg-[#0a0a0a] text-[#444] cursor-not-allowed"
              }`}
            >
              <p className="text-[11px] font-bold uppercase tracking-wider">
                {p.provider}
              </p>
              <p className="text-[9px] text-[#999] mt-1">
                {p.configured ? (p.active ? "Active" : "Available") : "Not configured"}
              </p>
            </button>
          ))}
        </div>
        {!hasRole("admin") && (
          <p className="text-[9px] text-[#555] mt-2">
            Admin role required to change provider
          </p>
        )}
      </div>
    </div>
  );
}
