import { clsx } from "clsx";
import { Camera, Globe, Loader2 } from "lucide-react";
import { ThreatGauge } from "./ThreatGauge";
import { StatusBadge } from "./StatusBadge";
import type { SourceState } from "../types";

interface SourceCardProps {
  source: SourceState;
}

export function SourceCard({ source }: SourceCardProps) {
  const isProcessing = source.processingCount > 0;
  const hasResults = source.lastThreatScore !== undefined;

  return (
    <div
      className={clsx(
        "rounded-xl border transition-all duration-300 overflow-hidden",
        source.isEscalated
          ? "border-red-500 bg-red-950/30 shadow-lg shadow-red-500/20"
          : "border-slate-700 bg-slate-800/50 hover:border-slate-600"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
        <div className="flex items-center gap-2.5">
          {source.mode === "physical" ? (
            <Camera className="w-4 h-4 text-blue-400" />
          ) : (
            <Globe className="w-4 h-4 text-purple-400" />
          )}
          <span className="font-semibold text-sm">{source.name}</span>
          <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">
            {source.mode}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isProcessing && (
            <Loader2 className="w-4 h-4 text-amber-400 animate-processing" />
          )}
          <div
            className={clsx(
              "w-2.5 h-2.5 rounded-full",
              source.active ? "bg-green-500 animate-pulse-dot" : "bg-slate-500"
            )}
            title={source.active ? "Live" : "Inactive"}
          />
        </div>
      </div>

      {/* Middle */}
      <div className="px-4 py-4 flex items-center gap-4">
        {/* Gauge */}
        <ThreatGauge
          score={source.lastThreatScore ?? 0}
          size={100}
          severity={source.lastSeverity}
        />

        {/* Info */}
        <div className="flex-1 space-y-2">
          {/* Queue info */}
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-400">
              Queue: <span className="text-slate-200 font-medium">{source.queueCount}</span>
            </span>
            <span className="text-slate-400">
              Active: <span className="text-slate-200 font-medium">{source.processingCount}</span>
            </span>
          </div>

          {/* Categories */}
          {source.lastCategories && source.lastCategories.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {source.lastCategories.map((cat) => (
                <span
                  key={cat}
                  className="px-2 py-0.5 rounded-full bg-red-600/20 text-red-400 text-xs border border-red-500/30"
                >
                  {cat.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}

          {/* Summary */}
          {source.lastSummary && (
            <p className="text-xs text-slate-400 line-clamp-2">
              {source.lastSummary}
            </p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/30 border-t border-slate-700/30">
        <div className="flex items-center gap-2">
          {hasResults ? (
            <StatusBadge severity={source.lastSeverity ?? "safe"} />
          ) : (
            <StatusBadge status="waiting" label="Waiting" />
          )}
        </div>
        {source.lastUpdated && (
          <span className="text-xs text-slate-500">
            {new Date(source.lastUpdated).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}
