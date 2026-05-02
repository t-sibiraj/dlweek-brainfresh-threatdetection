import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env from workspace root (two levels up from config/)
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
// Also try backend/.env as fallback
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  DATABASE_URL: z
    .string()
    .default("postgresql://voiddecksafety:voiddecksafety@localhost:5432/voiddecksafety"),
  PORT: z.coerce.number().default(4000),
  VIDEO_CHUNK_SECONDS: z.coerce.number().default(5),
  MAX_VIDEO_CONTEXT: z.coerce.number().default(10),
  MAX_IMAGE_CONTEXT: z.coerce.number().default(20),
  MAX_CONCURRENT_JOBS: z.coerce.number().default(2),
  THREAT_THRESHOLD_HIGH: z.coerce.number().default(70),
  THREAT_THRESHOLD_MEDIUM: z.coerce.number().default(40),
  MODEL_NAME: z.string().default("gpt-4.1-mini"),
  NODE_ENV: z
    .enum(["development", "staging", "production"])
    .default("development"),
  // Phase 4: Auth
  JWT_SECRET: z.string().default("voiddecksafety-dev-jwt-secret-change-in-prod"),
  JWT_ACCESS_EXPIRES: z.string().default("15m"),
  JWT_REFRESH_EXPIRES: z.string().default("7d"),
  // Phase 5: Web Push
  VAPID_PUBLIC_KEY: z.string().default(""),
  VAPID_PRIVATE_KEY: z.string().default(""),
  VAPID_EMAIL: z.string().default("mailto:admin@voiddecksafety.local"),
  // Phase 6: Multi-provider AI
  ANTHROPIC_API_KEY: z.string().default(""),
  GOOGLE_AI_KEY: z.string().default(""),
  AI_PROVIDER: z.string().default("openai"), // 'openai' | 'anthropic' | 'google'
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
