import type { Severity } from "../types";

interface ThreatGaugeProps {
  score: number;
  size?: number;
  severity?: Severity;
}

const SEVERITY_COLORS: Record<Severity, string> = {
  safe: "#888888",
  low: "#aaaaaa",
  medium: "#cccccc",
  high: "#ffffff",
};

const SEVERITY_LABELS: Record<Severity, string> = {
  safe: "SAFE",
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
};

export function ThreatGauge({ score, size = 120, severity }: ThreatGaugeProps) {
  const resolvedSeverity =
    severity ?? (score >= 70 ? "high" : score > 40 ? "medium" : score > 20 ? "low" : "safe");

  const color = SEVERITY_COLORS[resolvedSeverity];
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(score, 100) / 100;
  const offset = circumference * (1 - progress);

  return (
    <div className="relative flex flex-col items-center justify-center" style={{ width: size, height: size + 20 }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        className="-rotate-90"
      >
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="#333333"
          strokeWidth="6"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="gauge-animate transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ top: 0, width: size, height: size }}>
        <span className="text-2xl font-bold tracking-tighter" style={{ color }}>
          {score}
        </span>
      </div>
      <span className="text-[10px] font-bold tracking-[0.2em] mt-1" style={{ color }}>
        {SEVERITY_LABELS[resolvedSeverity]}
      </span>
    </div>
  );
}
