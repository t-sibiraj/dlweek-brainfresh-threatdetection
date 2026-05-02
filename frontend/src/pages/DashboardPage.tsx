import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Shield,
  Activity,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { ThreatGauge } from "../components/ThreatGauge";
import { fetchDashboard, fetchThreats } from "../services/api";
import type { DashboardData, ThreatEvent } from "../types";

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    try {
      const [dashboard, threats] = await Promise.all([
        fetchDashboard(),
        fetchThreats(undefined, 50),
      ]);
      setData(dashboard);

      const trend = threats
        .slice()
        .reverse()
        .map((t: ThreatEvent, i: number) => ({
          index: i + 1,
          score: t.threat_score,
          time: new Date(t.created_at).toLocaleTimeString(),
        }));
      setTrendData(trend);
    } catch (err) {
      console.error("Failed to load dashboard:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-[11px] text-[#999] uppercase tracking-wider">Loading...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-[#999] text-xs">
        Failed to load dashboard data.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Overall Gauge */}
        <div className="col-span-2 lg:col-span-1 flex flex-col items-center justify-center rounded-lg border border-[#333] bg-[#0a0a0a] p-5">
          <ThreatGauge score={data.overall_threat_score} size={120} />
          <span className="text-[10px] text-[#bbb] mt-1 uppercase tracking-wider">
            Overall
          </span>
        </div>

        <StatCard
          icon={<Activity className="w-4 h-4 text-[#ccc]" />}
          label="Active Sources"
          value={data.active_sources}
        />
        <StatCard
          icon={<AlertTriangle className="w-4 h-4 text-[#ccc]" />}
          label="High Risk"
          value={data.high_risk_alerts}
          highlight={data.high_risk_alerts > 0}
        />
        <StatCard
          icon={<Shield className="w-4 h-4 text-[#ccc]" />}
          label="Events (5m)"
          value={data.events_last_5_minutes}
        />
        <StatCard
          icon={<Clock className="w-4 h-4 text-[#ccc]" />}
          label="Avg Latency"
          value={`${data.avg_latency_ms}ms`}
        />
      </div>

      {/* Trend Chart */}
      <div className="rounded-lg border border-[#333] bg-[#0a0a0a] p-5">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#ccc] mb-4">
          Threat Trend
        </h3>
        {trendData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
              <XAxis
                dataKey="time"
                tick={{ fill: "#777", fontSize: 9 }}
                tickLine={false}
                axisLine={{ stroke: "#333" }}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: "#777", fontSize: 9 }}
                tickLine={false}
                axisLine={{ stroke: "#333" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0a0a0a",
                  border: "1px solid #333",
                  borderRadius: 4,
                  fontSize: 11,
                  color: "#aaa",
                }}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#ffffff"
                strokeWidth={1.5}
                dot={{ r: 2, fill: "#ffffff" }}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-32 text-[#999] text-[11px]">
            No events yet.
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 flex flex-col gap-2 ${
        highlight
          ? "border-[#440000] bg-[#0a0000]"
          : "border-[#333] bg-[#0a0a0a]"
      }`}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-[10px] text-[#ccc] uppercase tracking-wider font-bold">
          {label}
        </span>
      </div>
      <span className={`text-xl font-bold ${highlight ? "text-[#ff4444]" : "text-white"}`}>
        {value}
      </span>
    </div>
  );
}
