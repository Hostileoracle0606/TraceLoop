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

export function getPort(): number {
  return getEnv().PORT;
}

export function getNodeEnv(): string {
  return getEnv().NODE_ENV;
}
