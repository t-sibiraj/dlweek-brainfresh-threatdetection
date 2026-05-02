import { clsx } from "clsx";
import type { Severity, JobStatus } from "../types";

interface StatusBadgeProps {
  status?: JobStatus;
  severity?: Severity;
  label?: string;
}

const statusColors: Record<string, string> = {
  waiting: "bg-slate-600 text-slate-200",
  queued: "bg-blue-600/20 text-blue-400 border border-blue-500/30",
  processing: "bg-amber-600/20 text-amber-400 border border-amber-500/30",
  completed: "bg-green-600/20 text-green-400 border border-green-500/30",
  error: "bg-red-600/20 text-red-400 border border-red-500/30",
  alert: "bg-red-600 text-white",
};

const severityColors: Record<Severity, string> = {
  safe: "bg-green-600/20 text-green-400 border border-green-500/30",
  low: "bg-yellow-600/20 text-yellow-400 border border-yellow-500/30",
  medium: "bg-orange-600/20 text-orange-400 border border-orange-500/30",
  high: "bg-red-600/20 text-red-400 border border-red-500/30",
};

const severityDots: Record<Severity, string> = {
  safe: "🟢",
  low: "🟡",
  medium: "🟠",
  high: "🔴",
};

export function StatusBadge({ status, severity, label }: StatusBadgeProps) {
  const colorClass = severity
    ? severityColors[severity]
    : statusColors[status || "waiting"];

  const text = label || severity || status || "waiting";

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium uppercase tracking-wider",
        colorClass
      )}
    >
      {severity && <span>{severityDots[severity]}</span>}
      {status === "processing" && (
        <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse-dot" />
      )}
      {text}
    </span>
  );
}
