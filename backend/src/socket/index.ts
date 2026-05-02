import { Server as SocketServer } from "socket.io";
import type { Server as HttpServer } from "http";
import { v4 as uuid } from "uuid";
import { jobQueue } from "../services/jobQueue.js";
import {
  saveFrame,
  startBrowserStream,
  startHlsIngestion,
  stopStream,
  getStreamStatus,
  getAllStreams,
  incrementFrameCount,
} from "../services/streamProcessor.js";
import { db } from "../db/index.js";
import { sources, jobs } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { Job, Mode } from "../types/index.js";

let io: SocketServer;

export function initializeSocket(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
      methods: ["GET", "POST"],
    },
    maxHttpBufferSize: 5e6, // 5MB for frame data
  });

  io.on("connection", (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // Clients can join source-specific rooms
    socket.on("join_source", (sourceId: string) => {
      socket.join(`source:${sourceId}`);
      console.log(`📡 ${socket.id} joined source:${sourceId}`);
    });

    socket.on("leave_source", (sourceId: string) => {
      socket.leave(`source:${sourceId}`);
    });

    // Join the dashboard room by default
    socket.join("dashboard");

    // ─── Streaming: Start ───────────────────────────────
    socket.on(
      "stream:start",
      async (
        data: {
          source_id: string;
          type: "webcam" | "screen" | "hls";
          url?: string;
          interval_sec?: number;
        },
        callback?: (res: { success: boolean; error?: string }) => void
      ) => {
        try {
          const { source_id, type, url, interval_sec } = data;

          // Verify source exists
          const [source] = await db
            .select()
            .from(sources)
            .where(eq(sources.id, source_id))
            .limit(1);

          if (!source) {
            callback?.({ success: false, error: "Source not found" });
            return;
          }

          let result;
          if (type === "hls") {
            if (!url) {
              callback?.({ success: false, error: "URL required for HLS stream" });
              return;
            }
            result = startHlsIngestion(source_id, url, interval_sec ?? 5);
          } else {
            result = startBrowserStream(source_id, type);
          }

          if (result.success) {
            // Update source with stream info
            await db
              .update(sources)
              .set({ streamType: type, streamUrl: url ?? null })
              .where(eq(sources.id, source_id));

            io.to("dashboard").emit("stream_started", {
              source_id,
              type,
              timestamp: new Date().toISOString(),
            });
          }

          callback?.(result);
        } catch (err) {
          console.error("stream:start error:", err);
          callback?.({ success: false, error: "Internal error" });
        }
      }
    );

    // ─── Streaming: Frame from browser ──────────────────
    socket.on(
      "stream:frame",
      async (data: {
        source_id: string;
        frame: string; // base64 image data
        mime_type?: string;
      }) => {
        try {
          const { source_id, frame, mime_type } = data;

          const status = getStreamStatus(source_id);
          if (!status || !status.active) return;

          // Save frame to disk
          const framePath = saveFrame(source_id, frame, mime_type);
          incrementFrameCount(source_id);

          // Look up source mode
          const [source] = await db
            .select()
            .from(sources)
            .where(eq(sources.id, source_id))
            .limit(1);

          if (!source) return;

          // Create a job for this frame
          const jobId = uuid();
          await db.insert(jobs).values({
            id: jobId,
            sourceId: source_id,
            status: "queued",
            mediaPath: framePath,
            createdAt: new Date(),
          });

          const job: Job = {
            id: jobId,
            sourceId: source_id,
            mode: source.mode as Mode,
            mediaPath: framePath,
            status: "queued",
            createdAt: new Date(),
          };

          // Enqueue for AI analysis
          jobQueue.enqueue(job).catch((err) => {
            console.error(`Stream frame job ${jobId} failed:`, err.message);
          });

          // Acknowledge frame received
          socket.emit("stream:frame_ack", {
            source_id,
            job_id: jobId,
            frame_count: status.frameCount,
          });
        } catch (err) {
          console.error("stream:frame error:", err);
        }
      }
    );

    // ─── Streaming: Stop ────────────────────────────────
    socket.on(
      "stream:stop",
      async (
        data: { source_id: string },
        callback?: (res: { success: boolean }) => void
      ) => {
        try {
          const { source_id } = data;
          const result = stopStream(source_id);

          if (result.success) {
            // Clear stream info from source
            await db
              .update(sources)
              .set({ streamType: null, streamUrl: null })
              .where(eq(sources.id, source_id));

            io.to("dashboard").emit("stream_stopped", {
              source_id,
              timestamp: new Date().toISOString(),
            });
          }

          callback?.(result);
        } catch (err) {
          console.error("stream:stop error:", err);
          callback?.({ success: false });
        }
      }
    );

    // ─── Streaming: Status ──────────────────────────────
    socket.on(
      "stream:status",
      (
        data: { source_id?: string },
        callback?: (res: any) => void
      ) => {
        if (data.source_id) {
          callback?.(getStreamStatus(data.source_id));
        } else {
          callback?.(getAllStreams());
        }
      }
    );

    socket.on("disconnect", () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
    });
  });

  // Wire up job queue events → Socket.IO broadcasts
  jobQueue.on("job:queued", (data) => {
    io.to("dashboard").emit("job_queued", data);
    io.to(`source:${data.source_id}`).emit("job_queued", data);
  });

  jobQueue.on("job:processing", (data) => {
    io.to("dashboard").emit("job_processing", data);
    io.to(`source:${data.source_id}`).emit("job_processing", data);
  });

  jobQueue.on("job:completed", (data) => {
    io.to("dashboard").emit("job_completed", data);
    io.to(`source:${data.source_id}`).emit("job_completed", data);
  });

  jobQueue.on("job:error", (data) => {
    io.to("dashboard").emit("job_error", data);
    io.to(`source:${data.source_id}`).emit("job_error", data);
  });

  jobQueue.on("threat:alert", (data) => {
    io.to("dashboard").emit("threat_alert", data);
    io.to(`source:${data.source_id}`).emit("threat_alert", data);
  });

  console.log("🔌 Socket.IO initialized (with streaming support)");
  return io;
}

export function getIO(): SocketServer {
  if (!io) throw new Error("Socket.IO not initialized");
  return io;
}
