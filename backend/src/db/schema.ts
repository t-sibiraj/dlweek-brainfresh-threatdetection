import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  real,
} from "drizzle-orm/pg-core";

// ─── Sources ──────────────────────────────────────────────
export const sources = pgTable("sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  mode: text("mode").notNull(), // 'physical' | 'online'
  contextLimit: integer("context_limit").notNull().default(10),
  threatThreshold: integer("threat_threshold").notNull().default(70),
  alertThreshold: integer("alert_threshold"),
  mediumThreshold: integer("medium_threshold"),
  lowThreshold: integer("low_threshold"),
  active: boolean("active").notNull().default(true),
  ingestionToken: text("ingestion_token").notNull(),
  // Streaming fields (Phase 3)
  streamType: text("stream_type"), // 'webcam' | 'screen' | 'hls' | null
  streamUrl: text("stream_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Jobs ─────────────────────────────────────────────────
export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(),
  sourceId: text("source_id")
    .notNull()
    .references(() => sources.id),
  status: text("status").notNull().default("queued"), // 'queued' | 'processing' | 'completed' | 'error'
  mediaPath: text("media_path").notNull(),
  chunkIndex: integer("chunk_index"),
  threatScore: integer("threat_score"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

// ─── Threat Events ────────────────────────────────────────
export const threatEvents = pgTable("threat_events", {
  id: text("id").primaryKey(),
  sourceId: text("source_id")
    .notNull()
    .references(() => sources.id),
  jobId: text("job_id")
    .notNull()
    .references(() => jobs.id),
  categories: jsonb("categories").notNull(), // string[]
  threatScore: integer("threat_score").notNull(),
  confidence: integer("confidence").notNull(),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Threat Weights (configurable scoring) ────────────────
export const threatWeights = pgTable("threat_weights", {
  id: text("id").primaryKey(),
  category: text("category").notNull(),
  mode: text("mode").notNull(), // 'physical' | 'online'
  weight: integer("weight").notNull(),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── System Config ────────────────────────────────────────
export const systemConfig = pgTable("system_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(), // JSON string
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Config Audit Log ─────────────────────────────────────
export const configAuditLog = pgTable("config_audit_log", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  action: text("action").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

// ─── Escalation Rules ─────────────────────────────────────
export const escalationRules = pgTable("escalation_rules", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").references(() => sources.id), // null = global
  ruleType: text("rule_type").notNull(), // 'consecutive' | 'average' | 'category_repeat'
  config: jsonb("config").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Weight Profiles ──────────────────────────────────────
export const weightProfiles = pgTable("weight_profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  mode: text("mode").notNull(), // 'physical' | 'online'
  weights: jsonb("weights").notNull(), // { category: weight }
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Context Summaries (persistent context memory) ────────
export const contextSummaries = pgTable("context_summaries", {
  id: text("id").primaryKey(),
  sourceId: text("source_id")
    .notNull()
    .references(() => sources.id, { onDelete: "cascade" }),
  summary: text("summary").notNull(),
  mode: text("mode").notNull(), // 'physical' | 'online'
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Users (Phase 4: Auth) ────────────────────────────────
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("viewer"), // 'admin' | 'operator' | 'viewer'
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
});

// ─── Sessions (Phase 4: JWT refresh tokens) ───────────────
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Webhook Endpoints (Phase 5: Alerts) ──────────────────
export const webhookEndpoints = pgTable("webhook_endpoints", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  secret: text("secret").notNull(), // HMAC signing secret
  events: jsonb("events").notNull(), // string[] of event types to subscribe
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Push Subscriptions (Phase 5: Browser Push) ───────────
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Alert Log (Phase 5: delivery tracking) ───────────────
export const alertLog = pgTable("alert_log", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // 'webhook' | 'push' | 'socket'
  targetId: text("target_id"), // webhook or push subscription id
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("pending"), // 'pending' | 'sent' | 'failed'
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
