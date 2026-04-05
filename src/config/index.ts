import { Config } from '../types/index.js';
import { z } from 'zod';

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required'),
  TELEGRAM_ALLOWED_USER_IDS: z.string(),
  GROQ_API_KEY: z.string().min(1, 'GROQ_API_KEY is required'),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default('openrouter/llama-3.3-70b-instruct'),
  DB_PATH: z.string().default('./memory.db'),
  MAX_AGENT_ITERATIONS: z.coerce.number().default(10),
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
  };
}
