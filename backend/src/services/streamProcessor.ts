import { ChildProcess, spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { v4 as uuid } from "uuid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../../data");
const framesDir = path.join(dataDir, "frames");
const hlsDir = path.join(dataDir, "hls");

// Ensure directories exist
for (const dir of [framesDir, hlsDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

interface ActiveStream {
  sourceId: string;
  type: "webcam" | "screen" | "hls";
  url?: string; // for HLS/DASH
  process?: ChildProcess; // for HLS ffmpeg child
  intervalId?: ReturnType<typeof setInterval>; // for frame polling
  active: boolean;
  frameCount: number;
  startedAt: Date;
}

const activeStreams = new Map<string, ActiveStream>();

/**
 * Save a base64-encoded frame (from WebRTC/screen capture) to disk
 * Returns the saved file path
 */
export function saveFrame(
  sourceId: string,
  base64Data: string,
  mimeType: string = "image/jpeg"
): string {
  const ext = mimeType.includes("png") ? ".png" : ".jpg";
  const filename = `${sourceId}_${uuid()}${ext}`;
  const filePath = path.join(framesDir, filename);

  // Strip data URI prefix if present
  const raw = base64Data.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(raw, "base64");
  fs.writeFileSync(filePath, buffer);

  return filePath;
}

/**
 * Start an HLS/DASH stream ingestion using ffmpeg
 * Captures a frame every `intervalSec` seconds
 */
export function startHlsIngestion(
  sourceId: string,
  streamUrl: string,
  intervalSec: number = 5
): { success: boolean; error?: string } {
  if (activeStreams.has(sourceId)) {
    return { success: false, error: "Stream already active for this source" };
  }

  const sourceFrameDir = path.join(framesDir, sourceId);
  if (!fs.existsSync(sourceFrameDir)) {
    fs.mkdirSync(sourceFrameDir, { recursive: true });
  }

  const stream: ActiveStream = {
    sourceId,
    type: "hls",
    url: streamUrl,
    active: true,
    frameCount: 0,
    startedAt: new Date(),
  };

  // Use ffmpeg to capture frames from the HLS stream
  // -i: input HLS URL
  // -vf fps=1/interval: capture 1 frame every N seconds
  // -f image2: output as image sequence
  // -update 1: overwrite same file (we'll read it periodically)
  const outputPattern = path.join(sourceFrameDir, "frame_%04d.jpg");

  const ffmpegProcess = spawn("ffmpeg", [
    "-i",
    streamUrl,
    "-vf",
    `fps=1/${intervalSec}`,
    "-f",
    "image2",
    "-q:v",
    "2",
    outputPattern,
  ]);

  stream.process = ffmpegProcess;

  ffmpegProcess.stderr?.on("data", (data: Buffer) => {
    // Ffmpeg logs to stderr — only log errors
    const msg = data.toString();
    if (msg.includes("Error") || msg.includes("error")) {
      console.error(`HLS ffmpeg [${sourceId}]:`, msg);
    }
  });

  ffmpegProcess.on("close", (code) => {
    console.log(`HLS ffmpeg [${sourceId}] exited with code ${code}`);
    const s = activeStreams.get(sourceId);
    if (s) {
      s.active = false;
      if (s.intervalId) clearInterval(s.intervalId);
    }
  });

  activeStreams.set(sourceId, stream);

  return { success: true };
}

/**
 * Register a WebRTC/screen capture stream (frame-by-frame from browser)
 */
export function startBrowserStream(
  sourceId: string,
  type: "webcam" | "screen"
): { success: boolean; error?: string } {
  if (activeStreams.has(sourceId)) {
    return { success: false, error: "Stream already active for this source" };
  }

  const stream: ActiveStream = {
    sourceId,
    type,
    active: true,
    frameCount: 0,
    startedAt: new Date(),
  };

  activeStreams.set(sourceId, stream);
  return { success: true };
}

/**
 * Stop an active stream
 */
export function stopStream(sourceId: string): { success: boolean } {
  const stream = activeStreams.get(sourceId);
  if (!stream) return { success: false };

  stream.active = false;

  if (stream.process) {
    stream.process.kill("SIGTERM");
  }

  if (stream.intervalId) {
    clearInterval(stream.intervalId);
  }

  activeStreams.delete(sourceId);
  return { success: true };
}

/**
 * Get status of a stream
 */
export function getStreamStatus(sourceId: string): ActiveStream | null {
  return activeStreams.get(sourceId) ?? null;
}

/**
 * Get all active streams
 */
export function getAllStreams(): Array<{
  sourceId: string;
  type: string;
  active: boolean;
  frameCount: number;
  startedAt: Date;
}> {
  return Array.from(activeStreams.values()).map((s) => ({
    sourceId: s.sourceId,
    type: s.type,
    active: s.active,
    frameCount: s.frameCount,
    startedAt: s.startedAt,
  }));
}

/**
 * Increment frame count for a stream
 */
export function incrementFrameCount(sourceId: string): void {
  const stream = activeStreams.get(sourceId);
  if (stream) {
    stream.frameCount++;
  }
}

/**
 * Get the latest HLS frame file path for a source (if using HLS ingestion)
 */
export function getLatestHlsFrame(sourceId: string): string | null {
  const sourceFrameDir = path.join(framesDir, sourceId);
  if (!fs.existsSync(sourceFrameDir)) return null;

  const files = fs
    .readdirSync(sourceFrameDir)
    .filter((f) => f.endsWith(".jpg"))
    .sort()
    .reverse();

  if (files.length === 0) return null;
  return path.join(sourceFrameDir, files[0]);
}

/**
 * Clean up old frames for a source (keep only latest N)
 */
export function cleanupFrames(sourceId: string, keepCount: number = 5): void {
  const sourceFrameDir = path.join(framesDir, sourceId);
  if (!fs.existsSync(sourceFrameDir)) return;

  const files = fs
    .readdirSync(sourceFrameDir)
    .filter((f) => f.endsWith(".jpg") || f.endsWith(".png"))
    .sort()
    .reverse();

  // Delete all but keepCount newest
  for (const file of files.slice(keepCount)) {
    try {
      fs.unlinkSync(path.join(sourceFrameDir, file));
    } catch {
      // ignore cleanup errors
    }
  }
}
