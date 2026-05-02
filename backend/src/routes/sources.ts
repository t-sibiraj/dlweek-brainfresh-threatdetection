import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import crypto from "crypto";
import { db } from "../db/index.js";
import { sources, jobs } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { upload, isVideoFile } from "../middleware/upload.js";
import { env } from "../config/env.js";
import { processVideo } from "../services/videoProcessor.js";
import { jobQueue } from "../services/jobQueue.js";
import type { Job, Mode } from "../types/index.js";

const router = Router();

// ─── Create Source ────────────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  try {
    const { name, mode, context_limit, threat_threshold } = req.body;

    if (!name || !mode) {
      res.status(400).json({ error: "name and mode are required" });
      return;
    }

    if (mode !== "physical" && mode !== "online") {
      res.status(400).json({ error: "mode must be 'physical' or 'online'" });
      return;
    }

    const sourceId = uuid();
    const ingestionToken = crypto.randomBytes(32).toString("hex");

    await db.insert(sources).values({
      id: sourceId,
      name,
      mode,
      contextLimit: context_limit ?? (mode === "physical" ? 10 : 20),
      threatThreshold: threat_threshold ?? 70,
      active: true,
      ingestionToken,
      createdAt: new Date(),
    });

    res.status(201).json({
      source_id: sourceId,
      ingestion_token: ingestionToken,
    });
  } catch (err) {
    console.error("Error creating source:", err);
    res.status(500).json({ error: "Failed to create source" });
  }
});

// ─── List Sources ─────────────────────────────────────────
router.get("/", async (_req: Request, res: Response) => {
  const allSources = await db.select().from(sources);
  res.json(
    allSources.map((s) => ({
      id: s.id,
      name: s.name,
      mode: s.mode,
      context_limit: s.contextLimit,
      threat_threshold: s.threatThreshold,
      active: s.active,
      created_at: s.createdAt,
    }))
  );
});

// ─── Get Source Status ────────────────────────────────────
router.get("/:source_id", async (req: Request, res: Response) => {
  const source_id = req.params.source_id as string;

  const [source] = await db
    .select()
    .from(sources)
    .where(eq(sources.id, source_id))
    .limit(1);

  if (!source) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  // Get latest job for this source
  const [latestJob] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.sourceId, source_id))
    .orderBy(jobs.createdAt)
    .limit(1);

  const queueLength = jobQueue.getSourceQueueLength(source_id);

  res.json({
    source_id: source.id,
    name: source.name,
    mode: source.mode,
    queue_length: queueLength,
    last_threat_score: latestJob?.threatScore ?? null,
    status: latestJob?.status ?? "waiting",
    active: source.active,
  });
});

// ─── Upload Media ─────────────────────────────────────────
router.post(
  "/:source_id/upload",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const source_id = req.params.source_id as string;
      const file = req.file;

      if (!file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      const [source] = await db
        .select()
        .from(sources)
        .where(eq(sources.id, source_id))
        .limit(1);

      if (!source) {
        res.status(404).json({ error: "Source not found" });
        return;
      }

      if (!source.active) {
        res.status(400).json({ error: "Source is not active" });
        return;
      }

      const jobIds: string[] = [];

      if (isVideoFile(file.originalname) && source.mode === "physical") {
        // Split video into chunks, create a job per chunk
        const chunks = await processVideo(
          file.path,
          env.VIDEO_CHUNK_SECONDS,
          uuid()
        );

        for (const chunk of chunks) {
          const jobId = uuid();
          jobIds.push(jobId);

          await db.insert(jobs).values({
            id: jobId,
            sourceId: source_id,
            status: "queued",
            mediaPath: chunk.gifPath,
            chunkIndex: chunk.chunkIndex,
            createdAt: new Date(),
          });

          // Enqueue (fire and forget — don't await)
          const job: Job = {
            id: jobId,
            sourceId: source_id,
            mode: source.mode as Mode,
            mediaPath: chunk.gifPath,
            chunkIndex: chunk.chunkIndex,
            status: "queued",
            createdAt: new Date(),
          };
          jobQueue.enqueue(job).catch((err) => {
            console.error(`Job ${jobId} failed:`, err.message);
          });
        }
      } else {
        // Single image job
        const jobId = uuid();
        jobIds.push(jobId);

        await db.insert(jobs).values({
          id: jobId,
          sourceId: source_id,
          status: "queued",
          mediaPath: file.path,
          createdAt: new Date(),
        });

        const job: Job = {
          id: jobId,
          sourceId: source_id,
          mode: source.mode as Mode,
          mediaPath: file.path,
          status: "queued",
          createdAt: new Date(),
        };
        jobQueue.enqueue(job).catch((err) => {
          console.error(`Job ${jobId} failed:`, err.message);
        });
      }

      res.status(202).json({ job_ids: jobIds });
    } catch (err) {
      console.error("Error uploading media:", err);
      res.status(500).json({ error: "Failed to process upload" });
    }
  }
);

// ─── Toggle Source Active ─────────────────────────────────
router.patch("/:source_id", async (req: Request, res: Response) => {
  const source_id = req.params.source_id as string;
  const { active, threat_threshold, context_limit } = req.body;

  const [source] = await db
    .select()
    .from(sources)
    .where(eq(sources.id, source_id))
    .limit(1);

  if (!source) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  const updates: Record<string, any> = {};
  if (typeof active === "boolean") updates.active = active;
  if (typeof threat_threshold === "number")
    updates.threatThreshold = threat_threshold;
  if (typeof context_limit === "number") updates.contextLimit = context_limit;

  if (Object.keys(updates).length > 0) {
    await db.update(sources).set(updates).where(eq(sources.id, source_id));
  }

  res.json({ success: true });
});

// ─── Delete Source ────────────────────────────────────────
router.delete("/:source_id", async (req: Request, res: Response) => {
  const source_id = req.params.source_id as string;

  const [source] = await db
    .select()
    .from(sources)
    .where(eq(sources.id, source_id))
    .limit(1);

  if (!source) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  // Delete jobs first (foreign key)
  await db.delete(jobs).where(eq(jobs.sourceId, source_id));
  // Delete the source
  await db.delete(sources).where(eq(sources.id, source_id));

  res.json({ success: true });
});

export default router;
