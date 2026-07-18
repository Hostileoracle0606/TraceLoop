import { z } from 'zod';

// Environment variable schema with validation
const envSchema = z.object({
  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_KEY: z.string().min(1),

  // Database (Direct connection for Drizzle)
  DATABASE_URL: z.string().url(),

  // Modal compute plane
  MODAL_ENDPOINT: z.string().url().optional(),

  // Inngest (durable job execution)
  INNGEST_EVENT_KEY: z.string().min(1).optional(),
  INNGEST_BASE_URL: z.string().url().optional(),

  // LLM (Vercel AI SDK)
  LLM_PROVIDER: z.enum(['anthropic', 'openai']).default('anthropic'),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),

  // Observability
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  SENTRY_DSN: z.string().url().optional(),

  // Server
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

let env: Env | undefined;

export function getEnv(): Env {
  if (!env) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      console.error('❌ Invalid environment variables:');
      console.error(parsed.error.flatten().fieldErrors);
      throw new Error('Invalid environment variables');
    }
    env = parsed.data;
  }
  return env;
}

// Convenience getters
export function getSupabaseConfig() {
  const e = getEnv();
  return {
    url: e.SUPABASE_URL,
    anonKey: e.SUPABASE_ANON_KEY,
    serviceKey: e.SUPABASE_SERVICE_KEY,
  };
}

export function getDatabaseUrl(): string {
  return getEnv().DATABASE_URL;
}

export function getModalEndpoint(): string | undefined {
  return getEnv().MODAL_ENDPOINT;
}

export function getInngestConfig(): { eventKey?: string; baseUrl?: string } {
  const e = getEnv();
  return {
    eventKey: e.INNGEST_EVENT_KEY,
    baseUrl: e.INNGEST_BASE_URL,
  };
}

export function getLLMConfig(): {
  provider: 'anthropic' | 'openai';
  anthropicApiKey?: string;
  openaiApiKey?: string;
} {
  const e = getEnv();
  return {
    provider: e.LLM_PROVIDER,
    anthropicApiKey: e.ANTHROPIC_API_KEY,
    openaiApiKey: e.OPENAI_API_KEY,
  };
}

export function getPort(): number {
  return getEnv().PORT;
}

export function getNodeEnv(): string {
  return getEnv().NODE_ENV;
}

export function getLogConfig(): { level: Env['LOG_LEVEL']; sentryDsn?: string } {
  const e = getEnv();
  return {
    level: e.LOG_LEVEL,
    sentryDsn: e.SENTRY_DSN,
  };
}
