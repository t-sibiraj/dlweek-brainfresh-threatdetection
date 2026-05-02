// ─── Shared Types ─────────────────────────────────────────

export type Mode = "physical" | "online";
export type JobStatus = "queued" | "processing" | "completed" | "error";
export type Severity = "safe" | "low" | "medium" | "high";

// Physical mode AI result
export interface PhysicalAnalysisResult {
  violence: boolean;
  weapon: boolean;
  medical_emergency: boolean;
  nudity: boolean;
  public_disturbance: boolean;
  threat_score: number;
  confidence: number;
  summary: string;
}

// Online mode AI result
export interface OnlineAnalysisResult {
  grooming: boolean;
  sexual_content: boolean;
  abusive: boolean;
  coercion: boolean;
  manipulation: boolean;
  threat_score: number;
  confidence: number;
  summary: string;
}

export type AnalysisResult = PhysicalAnalysisResult | OnlineAnalysisResult;

// Job as it flows through the queue
export interface Job {
  id: string;
  sourceId: string;
  mode: Mode;
  mediaPath: string;
  chunkIndex?: number;
  status: JobStatus;
  createdAt: Date;
}

// WebSocket event payloads
export interface JobEvent {
  source_id: string;
  job_id: string;
  status: JobStatus;
  threat_score?: number;
  categories?: string[];
  confidence?: number;
  timestamp: string;
}

export interface ThreatAlertEvent {
  source_id: string;
  severity: Severity;
  threat_score: number;
  timestamp: string;
}

// Dashboard data
export interface DashboardData {
  overall_threat_score: number;
  active_sources: number;
  high_risk_alerts: number;
  events_last_5_minutes: number;
  avg_latency_ms: number;
}

// Config types
export interface WeightConfig {
  physical: Record<string, number>;
  online: Record<string, number>;
}

export interface ThresholdConfig {
  global_high: number;
  global_medium: number;
  global_low: number;
}

// Escalation rule types
export interface ConsecutiveRule {
  type: "consecutive";
  count: number;
  threshold: number;
}

export interface AverageRule {
  type: "average";
  window: number;
  threshold: number;
}

export interface CategoryRepeatRule {
  type: "category_repeat";
  category: string;
  count: number;
  window: number;
}

export type EscalationRule = ConsecutiveRule | AverageRule | CategoryRepeatRule;

// Phase 4: Auth types
export type UserRole = "admin" | "operator" | "viewer";

export interface UserPayload {
  id: string;
  email: string;
  role: UserRole;
  displayName: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// Phase 5: Alert types
export type AlertEventType =
  | "threat_high"
  | "threat_medium"
  | "escalation"
  | "source_offline"
  | "system_error";

export interface WebhookPayload {
  event: AlertEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

// Phase 6: AI Provider types
export type AIProvider = "openai" | "anthropic" | "google";
