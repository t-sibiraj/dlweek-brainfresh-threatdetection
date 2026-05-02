import { Router, Request, Response } from "express";
import { db } from "../db/index.js";
import { jobs, threatEvents } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";

const router = Router();

// ─── Get Jobs for a Source ────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  const { source_id } = req.query;

  let allJobs;
  if (source_id && typeof source_id === "string") {
    allJobs = await db
      .select()
      .from(jobs)
      .where(eq(jobs.sourceId, source_id))
      .orderBy(desc(jobs.createdAt))
      .limit(100);
  } else {
    allJobs = await db
      .select()
      .from(jobs)
      .orderBy(desc(jobs.createdAt))
      .limit(100);
  }

  res.json(
    allJobs.map((j) => ({
      id: j.id,
      source_id: j.sourceId,
      status: j.status,
      chunk_index: j.chunkIndex,
      threat_score: j.threatScore,
      created_at: j.createdAt,
      completed_at: j.completedAt,
    }))
  );
});

// ─── Get Job Detail ───────────────────────────────────────
router.get("/:job_id", async (req: Request, res: Response) => {
  const job_id = req.params.job_id as string;

  const [job] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.id, job_id))
    .limit(1);

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  // Get the threat event for this job if exists
  const [event] = await db
    .select()
    .from(threatEvents)
    .where(eq(threatEvents.jobId, job_id))
    .limit(1);

  res.json({
    id: job.id,
    source_id: job.sourceId,
    status: job.status,
    chunk_index: job.chunkIndex,
    threat_score: job.threatScore,
    created_at: job.createdAt,
    completed_at: job.completedAt,
    threat_event: event
      ? {
          categories: event.categories,
          threat_score: event.threatScore,
          confidence: event.confidence,
          summary: event.summary,
        }
      : null,
  });
});

export default router;
