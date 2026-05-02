import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import { db } from "../db/index.js";
import { sources, jobs } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { upload, isVideoFile } from "../middleware/upload.js";
import { env } from "../config/env.js";
import { processVideo } from "../services/videoProcessor.js";
import { jobQueue } from "../services/jobQueue.js";
import type { Job, Mode } from "../types/index.js";

const router = Router();

/**
 * API Ingestion endpoint — uses Bearer token for auth
 * POST /api/ingest
 * Headers: Authorization: Bearer <ingestion_token>
 * Form Data: file, source_id
 */
router.post(
  "/",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({ error: "Missing or invalid authorization token" });
        return;
      }

      const token = authHeader.slice(7);
      const sourceId = req.body.source_id;
      const file = req.file;

      if (!sourceId) {
        res.status(400).json({ error: "source_id is required" });
        return;
      }

      if (!file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      // Verify token matches source
      const [source] = await db
        .select()
        .from(sources)
        .where(eq(sources.id, sourceId))
        .limit(1);

      if (!source) {
        res.status(404).json({ error: "Source not found" });
        return;
      }

      if (source.ingestionToken !== token) {
        res.status(403).json({ error: "Invalid ingestion token" });
        return;
      }

      if (!source.active) {
        res.status(400).json({ error: "Source is not active" });
        return;
      }

      const jobIds: string[] = [];

      if (isVideoFile(file.originalname) && source.mode === "physical") {
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
            sourceId,
            status: "queued",
            mediaPath: chunk.gifPath,
            chunkIndex: chunk.chunkIndex,
            createdAt: new Date(),
          });

          const job: Job = {
            id: jobId,
            sourceId,
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
        const jobId = uuid();
        jobIds.push(jobId);

        await db.insert(jobs).values({
          id: jobId,
          sourceId,
          status: "queued",
          mediaPath: file.path,
          createdAt: new Date(),
        });

        const job: Job = {
          id: jobId,
          sourceId,
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
      console.error("Ingestion error:", err);
      res.status(500).json({ error: "Failed to process ingestion" });
    }
  }
);

export default router;
