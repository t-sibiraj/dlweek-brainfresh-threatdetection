import ffmpeg from "fluent-ffmpeg";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const chunksDir = path.resolve(__dirname, "../../../data/chunks");
const gifsDir = path.resolve(__dirname, "../../../data/gifs");

/**
 * Get video duration in seconds using ffprobe
 */
export function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const duration = metadata.format.duration;
      if (duration === undefined) return reject(new Error("Could not determine video duration"));
      resolve(duration);
    });
  });
}

/**
 * Split a video file into N-second chunks
 * Returns array of chunk file paths
 */
export async function splitIntoChunks(
  filePath: string,
  chunkSeconds: number,
  jobIdPrefix: string
): Promise<string[]> {
  const duration = await getVideoDuration(filePath);
  const numChunks = Math.ceil(duration / chunkSeconds);
  const chunkPaths: string[] = [];

  for (let i = 0; i < numChunks; i++) {
    const startTime = i * chunkSeconds;
    const outputPath = path.join(chunksDir, `${jobIdPrefix}_chunk_${i}.mp4`);
    chunkPaths.push(outputPath);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(filePath)
        .setStartTime(startTime)
        .setDuration(chunkSeconds)
        .output(outputPath)
        .outputOptions(["-c", "copy", "-avoid_negative_ts", "1"])
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
    });
  }

  return chunkPaths;
}

/**
 * Convert a video chunk to GIF for AI analysis
 * 5fps, 512px width, single-pass
 */
export function convertToGif(
  chunkPath: string,
  outputFilename: string
): Promise<string> {
  const outputPath = path.join(gifsDir, outputFilename);

  return new Promise((resolve, reject) => {
    ffmpeg(chunkPath)
      .outputOptions([
        "-vf",
        "fps=5,scale=512:-1:flags=lanczos",
        "-f",
        "gif",
        "-loop",
        "0",
      ])
      .output(outputPath)
      .on("end", () => resolve(outputPath))
      .on("error", (err) => reject(err))
      .run();
  });
}

/**
 * Process a video file: split into chunks and convert each to GIF
 * Returns array of { chunkIndex, gifPath }
 */
export async function processVideo(
  filePath: string,
  chunkSeconds: number,
  jobIdPrefix: string
): Promise<Array<{ chunkIndex: number; gifPath: string }>> {
  const chunkPaths = await splitIntoChunks(filePath, chunkSeconds, jobIdPrefix);

  const results: Array<{ chunkIndex: number; gifPath: string }> = [];

  for (let i = 0; i < chunkPaths.length; i++) {
    const gifFilename = `${jobIdPrefix}_chunk_${i}.gif`;
    const gifPath = await convertToGif(chunkPaths[i], gifFilename);
    results.push({ chunkIndex: i, gifPath });
  }

  return results;
}

/**
 * Clean up temporary chunk files
 */
export function cleanupChunks(prefix: string): void {
  try {
    const files = fs.readdirSync(chunksDir);
    for (const file of files) {
      if (file.startsWith(prefix)) {
        fs.unlinkSync(path.join(chunksDir, file));
      }
    }
  } catch {
    // Ignore cleanup errors
  }
}
