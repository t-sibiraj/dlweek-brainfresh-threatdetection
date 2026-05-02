import { db, pool } from "./index.js";
import {
  threatWeights,
  systemConfig,
  escalationRules,
  sources,
  jobs,
  threatEvents,
  configAuditLog,
  weightProfiles,
  contextSummaries,
  users,
  sessions,
  webhookEndpoints,
  pushSubscriptions,
  alertLog,
} from "./schema.js";
import { v4 as uuid } from "uuid";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

const DEFAULT_PHYSICAL_WEIGHTS = [
  { category: "violence", weight: 40 },
  { category: "weapon", weight: 50 },
  { category: "medical_emergency", weight: 35 },
  { category: "nudity", weight: 25 },
  { category: "public_disturbance", weight: 20 },
];

const DEFAULT_ONLINE_WEIGHTS = [
  { category: "grooming", weight: 60 },
  { category: "sexual_content", weight: 50 },
  { category: "abusive", weight: 30 },
  { category: "coercion", weight: 55 },
  { category: "manipulation", weight: 45 },
];

const DEFAULT_SYSTEM_CONFIG: Record<string, unknown> = {
  THREAT_LOW_MAX: 20,
  THREAT_MEDIUM_MAX: 40,
  THREAT_HIGH_MIN: 70,
  MODEL_NAME: "gpt-4.1-mini",
  VIDEO_CHUNK_SECONDS: 5,
  MAX_VIDEO_CONTEXT: 10,
  MAX_IMAGE_CONTEXT: 20,
  MAX_CONCURRENT_JOBS: 2,
};

const DEFAULT_ESCALATION_RULES = [
  {
    ruleType: "consecutive" as const,
    config: { count: 3, threshold: 60 },
  },
  {
    ruleType: "average" as const,
    config: { window: 5, threshold: 70 },
  },
  {
    ruleType: "category_repeat" as const,
    config: { category: "grooming", count: 2, window: 10 },
  },
];

/**
 * Create all tables using raw SQL (idempotent with IF NOT EXISTS).
 * This keeps us independent of drizzle-kit push for dev convenience.
 */
async function createTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      mode TEXT NOT NULL,
      context_limit INTEGER NOT NULL DEFAULT 10,
      threat_threshold INTEGER NOT NULL DEFAULT 70,
      alert_threshold INTEGER,
      medium_threshold INTEGER,
      low_threshold INTEGER,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      ingestion_token TEXT NOT NULL,
      stream_type TEXT,
      stream_url TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES sources(id),
      status TEXT NOT NULL DEFAULT 'queued',
      media_path TEXT NOT NULL,
      chunk_index INTEGER,
      threat_score INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS threat_events (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES sources(id),
      job_id TEXT NOT NULL REFERENCES jobs(id),
      categories JSONB NOT NULL,
      threat_score INTEGER NOT NULL,
      confidence INTEGER NOT NULL,
      summary TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS threat_weights (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      mode TEXT NOT NULL,
      weight INTEGER NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS config_audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      timestamp TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS escalation_rules (
      id TEXT PRIMARY KEY,
      source_id TEXT REFERENCES sources(id),
      rule_type TEXT NOT NULL,
      config JSONB NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS weight_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      mode TEXT NOT NULL,
      weights JSONB NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS context_summaries (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      mode TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      refresh_token TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS webhook_endpoints (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      secret TEXT NOT NULL,
      events JSONB NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS alert_log (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      target_id TEXT,
      event_type TEXT NOT NULL,
      payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_source_id ON jobs(source_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_threat_events_source ON threat_events(source_id);
    CREATE INDEX IF NOT EXISTS idx_threat_events_created ON threat_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_context_summaries_source ON context_summaries(source_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_alert_log_type ON alert_log(event_type);
  `);
}

export async function seedDatabase() {
  // Create tables first
  await createTables();

  // Seed threat weights if empty
  const existingWeights = await db.select().from(threatWeights);
  if (existingWeights.length === 0) {
    console.log("🌱 Seeding threat weights...");
    const now = new Date();
    for (const w of DEFAULT_PHYSICAL_WEIGHTS) {
      await db.insert(threatWeights).values({
        id: uuid(),
        category: w.category,
        mode: "physical",
        weight: w.weight,
        active: true,
        updatedAt: now,
      });
    }
    for (const w of DEFAULT_ONLINE_WEIGHTS) {
      await db.insert(threatWeights).values({
        id: uuid(),
        category: w.category,
        mode: "online",
        weight: w.weight,
        active: true,
        updatedAt: now,
      });
    }
  }

  // Seed system config if empty
  const existingConfig = await db.select().from(systemConfig);
  if (existingConfig.length === 0) {
    console.log("🌱 Seeding system config...");
    const now = new Date();
    for (const [key, value] of Object.entries(DEFAULT_SYSTEM_CONFIG)) {
      await db.insert(systemConfig).values({
        key,
        value: JSON.stringify(value),
        updatedAt: now,
      });
    }
  }

  // Seed escalation rules if empty
  const existingRules = await db.select().from(escalationRules);
  if (existingRules.length === 0) {
    console.log("🌱 Seeding escalation rules...");
    const now = new Date();
    for (const rule of DEFAULT_ESCALATION_RULES) {
      await db.insert(escalationRules).values({
        id: uuid(),
        sourceId: null,
        ruleType: rule.ruleType,
        config: rule.config,
        active: true,
        createdAt: now,
      });
    }
  }

  // Seed default admin user if no users exist
  const existingUsers = await db.select().from(users);
  if (existingUsers.length === 0) {
    console.log("🌱 Seeding default admin user...");
    const passwordHash = await bcrypt.hash("admin123", 12);
    await db.insert(users).values({
      id: uuid(),
      email: "admin@voiddecksafety.local",
      passwordHash,
      displayName: "Admin",
      role: "admin",
      active: true,
      createdAt: new Date(),
    });
    console.log("   📧 Email: admin@voiddecksafety.local");
    console.log("   🔑 Password: admin123");
  }

  console.log("✅ Database ready");
}
