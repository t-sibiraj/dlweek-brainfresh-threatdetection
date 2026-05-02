import express from "express";
import cors from "cors";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "./config/env.js";
import { seedDatabase } from "./db/seed.js";
import { initializeSocket } from "./socket/index.js";
import { errorHandler } from "./middleware/errorHandler.js";
import sourcesRouter from "./routes/sources.js";
import jobsRouter from "./routes/jobs.js";
import dashboardRouter from "./routes/dashboard.js";
import ingestRouter from "./routes/ingest.js";
import authRouter from "./routes/auth.js";
import alertsRouter from "./routes/alerts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = http.createServer(app);

// ─── Middleware ────────────────────────────────────────────
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve generated GIFs and uploaded files as static assets
const dataDir = path.resolve(__dirname, "../../data");
app.use("/static/gifs", express.static(path.join(dataDir, "gifs")));
app.use("/static/uploads", express.static(path.join(dataDir, "uploads")));

// ─── Routes ───────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/sources", sourcesRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api", dashboardRouter);
app.use("/api/ingest", ingestRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Error Handler ────────────────────────────────────────
app.use(errorHandler);

// ─── Initialize ───────────────────────────────────────────
async function start() {
  // Seed database (creates tables + default data)
  await seedDatabase();

  // Initialize Socket.IO
  initializeSocket(server);

  // Start server
  server.listen(env.PORT, () => {
    console.log(`\n🚀 VoidDeckSafety backend running on http://localhost:${env.PORT}`);
    console.log(`   Environment: ${env.NODE_ENV}`);
    console.log(`   Model: ${env.MODEL_NAME}`);
    console.log(`   Max concurrent jobs: ${env.MAX_CONCURRENT_JOBS}`);
    console.log(`   Video chunk duration: ${env.VIDEO_CHUNK_SECONDS}s\n`);
  });
}

start().catch((err) => {
  console.error("❌ Failed to start server:", err);
  process.exit(1);
});
