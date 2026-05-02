export type Mode = "physical" | "online";
export type JobStatus = "waiting" | "queued" | "processing" | "completed" | "error";
export type Severity = "safe" | "low" | "medium" | "high";

export interface Source {
  id: string;
  name: string;
  mode: Mode;
  context_limit: number;
  threat_threshold: number;
  active: boolean;
  created_at: string;
}

export interface JobInfo {
  id: string;
  source_id: string;
  status: JobStatus;
  chunk_index?: number;
  threat_score?: number;
  created_at: string;
  completed_at?: string;
}

export interface ThreatEvent {
  id: string;
  source_id: string;
  job_id: string;
  categories: string[];
  threat_score: number;
  confidence: number;
  summary: string;
  created_at: string;
}

export interface DashboardData {
  overall_threat_score: number;
  active_sources: number;
  high_risk_alerts: number;
  events_last_5_minutes: number;
  avg_latency_ms: number;
}

export interface WeightConfig {
  physical: Record<string, { weight: number; active: boolean; id: string }>;
  online: Record<string, { weight: number; active: boolean; id: string }>;
}

export interface ThresholdConfig {
  threat_low_max: number;
  threat_medium_max: number;
  threat_high_min: number;
}

// Socket event payloads
export interface JobEvent {
  source_id: string;
  job_id: string;
  status: JobStatus;
  threat_score?: number;
  categories?: string[];
  confidence?: number;
  summary?: string;
  severity?: Severity;
  latency_ms?: number;
  timestamp: string;
}

export interface ThreatAlertEvent {
  source_id: string;
  severity: Severity;
  threat_score: number;
  reason?: string;
  timestamp: string;
}

// Source card state (UI)
export interface SourceState extends Source {
  jobs: JobInfo[];
  lastThreatScore?: number;
  lastSeverity?: Severity;
  lastCategories?: string[];
  lastSummary?: string;
  queueCount: number;
  processingCount: number;
  lastUpdated?: string;
  isEscalated: boolean;
}

// Streaming types (Phase 3)
export type StreamType = "webcam" | "screen" | "hls";

export interface StreamStatus {
  sourceId: string;
  type: StreamType;
  active: boolean;
  frameCount: number;
  startedAt: string;
}

export interface StreamStartEvent {
  source_id: string;
  type: StreamType;
  timestamp: string;
}

export interface StreamStopEvent {
  source_id: string;
  timestamp: string;
}

// Phase 4: Auth types
export type UserRole = "admin" | "operator" | "viewer";

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
}

// Phase 5: Alert types
export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

export interface AlertLogEntry {
  id: string;
  type: string;
  target_id: string | null;
  event_type: string;
  payload: any;
  status: string;
  error: string | null;
  created_at: string;
}

// Phase 6: Analytics types
export interface TrendPoint {
  bucket: string;
  event_count: number;
  avg_score: number;
  max_score: number;
  high_count: number;
}

export interface SourceAnalytics {
  id: string;
  name: string;
  mode: Mode;
  active: boolean;
  total_events: number;
  avg_score: number;
  max_score: number;
  high_events: number;
  last_event_at: string | null;
}

export interface CategoryBreakdown {
  category: string;
  count: number;
  avg_score: number;
}

export interface LatencyStats {
  total_jobs: number;
  avg_ms: number;
  min_ms: number;
  max_ms: number;
  p95_ms: number;
}

export type AIProvider = "openai" | "anthropic" | "google";

export interface AIProviderInfo {
  provider: AIProvider;
  configured: boolean;
  active: boolean;
}

export interface StreamStartEvent {
  source_id: string;
  type: StreamType;
  timestamp: string;
}

export interface StreamStopEvent {
  source_id: string;
  timestamp: string;
}
