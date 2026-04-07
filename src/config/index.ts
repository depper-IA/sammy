import { Config } from '../types/index.js';
import { z } from 'zod';
import { resolve } from 'node:path';

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required'),
  TELEGRAM_ALLOWED_USER_IDS: z.string(),
  GROQ_API_KEY: z.string().min(1, 'GROQ_API_KEY is required'),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default('openrouter/llama-3.3-70b-instruct'),
  DB_PATH: z.string().default('./memory.db'),
  MAX_AGENT_ITERATIONS: z.coerce.number().default(10),
  PROJECT_ROOT: z.string().default('..'),
  MAX_AUDIO_FILE_SIZE_MB: z.coerce.number().default(20),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_KEY: z.string().optional(),
  SUPABASE_SYNC_INTERVAL_MS: z.coerce.number().default(30000),
});

type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const env: Record<string, string | undefined> = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_ALLOWED_USER_IDS: process.env.TELEGRAM_ALLOWED_USER_IDS,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    DB_PATH: process.env.DB_PATH,
    MAX_AGENT_ITERATIONS: process.env.MAX_AGENT_ITERATIONS,
    PROJECT_ROOT: process.env.PROJECT_ROOT,
    MAX_AUDIO_FILE_SIZE_MB: process.env.MAX_AUDIO_FILE_SIZE_MB,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    SUPABASE_SYNC_INTERVAL_MS: process.env.SUPABASE_SYNC_INTERVAL_MS,
  };

  return envSchema.parse(env);
}

export function loadConfig(): Config {
  const env = loadEnv();

  const allowedUserIds = new Set<number>(
    env.TELEGRAM_ALLOWED_USER_IDS.split(',').map((id) => {
      const parsed = parseInt(id.trim(), 10);
      if (isNaN(parsed)) {
        throw new Error(`Invalid Telegram user ID: ${id}`);
      }
      return parsed;
    })
  );

  return {
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    telegramAllowedUserIds: allowedUserIds,
    groqApiKey: env.GROQ_API_KEY,
    openrouterApiKey: env.OPENROUTER_API_KEY ?? '',
    openrouterModel: env.OPENROUTER_MODEL,
    dbPath: env.DB_PATH,
    maxAgentIterations: env.MAX_AGENT_ITERATIONS,
    projectRoot: resolve(env.PROJECT_ROOT),
    maxAudioFileSizeMb: env.MAX_AUDIO_FILE_SIZE_MB,
    supabaseUrl: env.SUPABASE_URL ?? '',
    supabaseServiceKey: env.SUPABASE_SERVICE_KEY ?? '',
    supabaseSyncIntervalMs: env.SUPABASE_SYNC_INTERVAL_MS,
  };
}
