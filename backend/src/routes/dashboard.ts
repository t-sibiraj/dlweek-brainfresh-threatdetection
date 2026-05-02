import { Router, Request, Response } from "express";
import { db } from "../db/index.js";
import {
  sources,
  jobs,
  threatEvents,
  threatWeights,
  systemConfig,
  configAuditLog,
  escalationRules,
  weightProfiles,
} from "../db/schema.js";
import { eq, and, desc, sql, gte, count } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import type { DashboardData } from "../types/index.js";
import { requireAuth, requireRole, optionalAuth } from "../middleware/auth.js";
import { listProviders } from "../services/aiProviders.js";

const router = Router();

// ─── Dashboard ────────────────────────────────────────────
router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

    // Active sources
    const activeSources = await db
      .select()
      .from(sources)
      .where(eq(sources.active, true));

    // Recent events (5 min)
    const recentEvents = await db
      .select()
      .from(threatEvents)
      .where(gte(threatEvents.createdAt, fiveMinAgo));

    // High risk: events with score >= threshold
    const highRiskCount = recentEvents.filter(
      (e) => e.threatScore >= 70
    ).length;

    // Overall threat — weighted average of latest event per active source
    let overallScore = 0;
    if (activeSources.length > 0) {
      let totalScore = 0;
      let counted = 0;
      for (const source of activeSources) {
        const [latest] = await db
          .select()
          .from(threatEvents)
          .where(eq(threatEvents.sourceId, source.id))
          .orderBy(desc(threatEvents.createdAt))
          .limit(1);
        if (latest) {
          totalScore += latest.threatScore;
          counted++;
        }
      }
      overallScore = counted > 0 ? Math.round(totalScore / counted) : 0;
    }

    // Average latency from recent completed jobs
    const recentJobs = await db
      .select()
      .from(jobs)
      .where(
        and(eq(jobs.status, "completed"), gte(jobs.completedAt, fiveMinAgo))
      );

    let avgLatency = 0;
    if (recentJobs.length > 0) {
      const totalLatency = recentJobs.reduce((sum, j) => {
        if (j.completedAt && j.createdAt) {
          return (
            sum +
            (new Date(j.completedAt).getTime() -
              new Date(j.createdAt).getTime())
          );
        }
        return sum;
      }, 0);
      avgLatency = Math.round(totalLatency / recentJobs.length);
    }

    const data: DashboardData = {
      overall_threat_score: overallScore,
      active_sources: activeSources.length,
      high_risk_alerts: highRiskCount,
      events_last_5_minutes: recentEvents.length,
      avg_latency_ms: avgLatency,
    };

    res.json(data);
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

// ─── Threat Events ────────────────────────────────────────
router.get("/threats", async (req: Request, res: Response) => {
  const { source_id, limit } = req.query;
  const maxResults = Math.min(Number(limit) || 50, 200);

  let rows;
  if (source_id && typeof source_id === "string") {
    rows = await db
      .select()
      .from(threatEvents)
      .where(eq(threatEvents.sourceId, source_id))
      .orderBy(desc(threatEvents.createdAt))
      .limit(maxResults);
  } else {
    rows = await db
      .select()
      .from(threatEvents)
      .orderBy(desc(threatEvents.createdAt))
      .limit(maxResults);
  }

  res.json(
    rows.map((e) => ({
      id: e.id,
      source_id: e.sourceId,
      job_id: e.jobId,
      categories: e.categories,
      threat_score: e.threatScore,
      confidence: e.confidence,
      summary: e.summary,
      created_at: e.createdAt,
    }))
  );
});

// ─── Get All Weights ──────────────────────────────────────
router.get("/config/weights", async (_req: Request, res: Response) => {
  const rows = await db.select().from(threatWeights);

  const result: Record<string, Record<string, { weight: number; active: boolean; id: string }>> = {
    physical: {},
    online: {},
  };

  for (const row of rows) {
    result[row.mode][row.category] = {
      weight: row.weight,
      active: row.active,
      id: row.id,
    };
  }

  res.json(result);
});

// ─── Update Weight ────────────────────────────────────────
router.put("/config/weights", requireAuth, requireRole("admin", "operator"), async (req: Request, res: Response) => {
  const { mode, category, weight, active } = req.body;

  if (!mode || !category) {
    res.status(400).json({ error: "mode and category are required" });
    return;
  }

  const [existing] = await db
    .select()
    .from(threatWeights)
    .where(
      and(eq(threatWeights.mode, mode), eq(threatWeights.category, category))
    )
    .limit(1);

  if (existing) {
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (typeof weight === "number") updates.weight = weight;
    if (typeof active === "boolean") updates.active = active;

    // Audit log
    await db.insert(configAuditLog).values({
      id: uuid(),
      action: `update_weight:${mode}:${category}`,
      oldValue: JSON.stringify({
        weight: existing.weight,
        active: existing.active,
      }),
      newValue: JSON.stringify({ weight, active }),
      timestamp: new Date(),
    });

    await db
      .update(threatWeights)
      .set(updates)
      .where(eq(threatWeights.id, existing.id));

    res.json({ success: true });
  } else {
    // Create new weight
    await db.insert(threatWeights).values({
      id: uuid(),
      category,
      mode,
      weight: weight ?? 50,
      active: active !== false,
      updatedAt: new Date(),
    });

    await db.insert(configAuditLog).values({
      id: uuid(),
      action: `create_weight:${mode}:${category}`,
      oldValue: null,
      newValue: JSON.stringify({ weight, active }),
      timestamp: new Date(),
    });

    res.status(201).json({ success: true });
  }
});

// ─── Delete Weight ────────────────────────────────────────
router.delete("/config/weights/:id", requireAuth, requireRole("admin", "operator"), async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const [existing] = await db
    .select()
    .from(threatWeights)
    .where(eq(threatWeights.id, id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Weight not found" });
    return;
  }

  await db.insert(configAuditLog).values({
    id: uuid(),
    action: `delete_weight:${existing.mode}:${existing.category}`,
    oldValue: JSON.stringify(existing),
    newValue: null,
    timestamp: new Date(),
  });

  await db.delete(threatWeights).where(eq(threatWeights.id, id));
  res.json({ success: true });
});

// ─── Get Thresholds ───────────────────────────────────────
router.get("/config/thresholds", async (_req: Request, res: Response) => {
  const keys = ["THREAT_LOW_MAX", "THREAT_MEDIUM_MAX", "THREAT_HIGH_MIN"];
  const result: Record<string, number> = {};

  for (const key of keys) {
    const [row] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, key))
      .limit(1);
    if (row) {
      result[key.toLowerCase()] = JSON.parse(row.value);
    }
  }

  res.json(result);
});

// ─── Update Thresholds ────────────────────────────────────
router.put("/config/thresholds", requireAuth, requireRole("admin", "operator"), async (req: Request, res: Response) => {
  const { global_high, global_medium, global_low } = req.body;
  const now = new Date();

  const updates: Array<{ key: string; value: number }> = [];
  if (typeof global_high === "number")
    updates.push({ key: "THREAT_HIGH_MIN", value: global_high });
  if (typeof global_medium === "number")
    updates.push({ key: "THREAT_MEDIUM_MAX", value: global_medium });
  if (typeof global_low === "number")
    updates.push({ key: "THREAT_LOW_MAX", value: global_low });

  for (const u of updates) {
    const [existing] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, u.key))
      .limit(1);

    await db.insert(configAuditLog).values({
      id: uuid(),
      action: `update_threshold:${u.key}`,
      oldValue: existing?.value ?? null,
      newValue: JSON.stringify(u.value),
      timestamp: now,
    });

    if (existing) {
      await db
        .update(systemConfig)
        .set({ value: JSON.stringify(u.value), updatedAt: now })
        .where(eq(systemConfig.key, u.key));
    } else {
      await db.insert(systemConfig).values({
        key: u.key,
        value: JSON.stringify(u.value),
        updatedAt: now,
      });
    }
  }

  res.json({ success: true });
});

// ─── Get System Config ────────────────────────────────────
router.get("/config/system", async (_req: Request, res: Response) => {
  const rows = await db.select().from(systemConfig);
  const result: Record<string, any> = {};
  for (const row of rows) {
    result[row.key] = JSON.parse(row.value);
  }
  res.json(result);
});

// ─── Update System Config ─────────────────────────────────
router.put("/config/system", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { key, value } = req.body;

  if (!key) {
    res.status(400).json({ error: "key is required" });
    return;
  }

  const now = new Date();
  const [existing] = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.key, key))
    .limit(1);

  await db.insert(configAuditLog).values({
    id: uuid(),
    action: `update_config:${key}`,
    oldValue: existing?.value ?? null,
    newValue: JSON.stringify(value),
    timestamp: now,
  });

  if (existing) {
    await db
      .update(systemConfig)
      .set({ value: JSON.stringify(value), updatedAt: now })
      .where(eq(systemConfig.key, key));
  } else {
    await db.insert(systemConfig).values({
      key,
      value: JSON.stringify(value),
      updatedAt: now,
    });
  }

  res.json({ success: true });
});

// ─── Get Escalation Rules ─────────────────────────────────
router.get("/config/escalation", async (_req: Request, res: Response) => {
  const rows = await db.select().from(escalationRules);
  res.json(
    rows.map((r) => ({
      id: r.id,
      source_id: r.sourceId,
      rule_type: r.ruleType,
      config: r.config,
      active: r.active,
    }))
  );
});

// ─── Update Escalation Rule ──────────────────────────────
router.put("/config/escalation/:id", requireAuth, requireRole("admin", "operator"), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { config, active } = req.body;

  const [existing] = await db
    .select()
    .from(escalationRules)
    .where(eq(escalationRules.id, id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Rule not found" });
    return;
  }

  const updates: Record<string, any> = {};
  if (config) updates.config = config;
  if (typeof active === "boolean") updates.active = active;

  await db
    .update(escalationRules)
    .set(updates)
    .where(eq(escalationRules.id, id));

  res.json({ success: true });
});

// ─── Audit Log ────────────────────────────────────────────
router.get("/config/audit-log", async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = await db
    .select()
    .from(configAuditLog)
    .orderBy(desc(configAuditLog.timestamp))
    .limit(limit);
  res.json(rows);
});

// ─── Weight Profiles ──────────────────────────────────────
router.get("/config/profiles", async (_req: Request, res: Response) => {
  const rows = await db.select().from(weightProfiles);
  res.json(
    rows.map((p) => ({
      id: p.id,
      name: p.name,
      mode: p.mode,
      weights: p.weights,
    }))
  );
});

router.post("/config/profiles", requireAuth, requireRole("admin", "operator"), async (req: Request, res: Response) => {
  const { name, mode, weights } = req.body;
  if (!name || !mode || !weights) {
    res.status(400).json({ error: "name, mode, and weights are required" });
    return;
  }

  const id = uuid();
  await db.insert(weightProfiles).values({
    id,
    name,
    mode,
    weights,
    createdAt: new Date(),
  });

  res.status(201).json({ id, success: true });
});

// ─── Analytics: Threat trend (time-series) ────────────────
router.get("/analytics/trend", async (req: Request, res: Response) => {
  try {
    const hours = Math.min(parseInt(req.query.hours as string) || 24, 168);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Group threat events by hour
    const rows = await db.execute(sql`
      SELECT
        date_trunc('hour', created_at) as bucket,
        COUNT(*) as event_count,
        ROUND(AVG(threat_score)) as avg_score,
        MAX(threat_score) as max_score,
        COUNT(*) FILTER (WHERE threat_score >= 70) as high_count
      FROM threat_events
      WHERE created_at >= ${since}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    res.json(rows.rows);
  } catch (err) {
    console.error("Analytics trend error:", err);
    res.status(500).json({ error: "Failed to fetch trend data" });
  }
});

// ─── Analytics: Per-source breakdown ──────────────────────
router.get("/analytics/sources", async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        s.id,
        s.name,
        s.mode,
        s.active,
        COUNT(te.id) as total_events,
        ROUND(AVG(te.threat_score)) as avg_score,
        MAX(te.threat_score) as max_score,
        COUNT(*) FILTER (WHERE te.threat_score >= 70) as high_events,
        MAX(te.created_at) as last_event_at
      FROM sources s
      LEFT JOIN threat_events te ON te.source_id = s.id
      GROUP BY s.id, s.name, s.mode, s.active
      ORDER BY avg_score DESC NULLS LAST
    `);

    res.json(rows.rows);
  } catch (err) {
    console.error("Analytics sources error:", err);
    res.status(500).json({ error: "Failed to fetch source analytics" });
  }
});

// ─── Analytics: Category breakdown ────────────────────────
router.get("/analytics/categories", async (req: Request, res: Response) => {
  try {
    const hours = Math.min(parseInt(req.query.hours as string) || 24, 168);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Unnest categories JSONB array and count occurrences
    const rows = await db.execute(sql`
      SELECT
        cat::text as category,
        COUNT(*) as count,
        ROUND(AVG(threat_score)) as avg_score
      FROM threat_events,
        jsonb_array_elements_text(categories) as cat
      WHERE created_at >= ${since}
      GROUP BY cat
      ORDER BY count DESC
    `);

    res.json(rows.rows);
  } catch (err) {
    console.error("Analytics categories error:", err);
    res.status(500).json({ error: "Failed to fetch category analytics" });
  }
});

// ─── Analytics: Response time stats ───────────────────────
router.get("/analytics/latency", async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        COUNT(*) as total_jobs,
        ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000)) as avg_ms,
        ROUND(MIN(EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000)) as min_ms,
        ROUND(MAX(EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000)) as max_ms,
        ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000)) as p95_ms
      FROM jobs
      WHERE status = 'completed' AND completed_at IS NOT NULL
    `);

    res.json(rows.rows[0] || { total_jobs: 0, avg_ms: 0, min_ms: 0, max_ms: 0, p95_ms: 0 });
  } catch (err) {
    console.error("Analytics latency error:", err);
    res.status(500).json({ error: "Failed to fetch latency stats" });
  }
});

// ─── AI Provider management ──────────────────────────────
router.get("/config/ai-providers", async (_req: Request, res: Response) => {
  try {
    res.json(listProviders());
  } catch (err) {
    res.status(500).json({ error: "Failed to list AI providers" });
  }
});

router.put("/config/ai-provider", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { provider } = req.body;
    if (!["openai", "anthropic", "google"].includes(provider)) {
      res.status(400).json({ error: "Invalid provider. Must be openai, anthropic, or google" });
      return;
    }

    // Store in system config
    const [existing] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, "AI_PROVIDER"))
      .limit(1);

    if (existing) {
      await db
        .update(systemConfig)
        .set({ value: JSON.stringify(provider), updatedAt: new Date() })
        .where(eq(systemConfig.key, "AI_PROVIDER"));
    } else {
      await db.insert(systemConfig).values({
        key: "AI_PROVIDER",
        value: JSON.stringify(provider),
        updatedAt: new Date(),
      });
    }

    res.json({ success: true, provider });
  } catch (err) {
    res.status(500).json({ error: "Failed to update AI provider" });
  }
});

export default router;
