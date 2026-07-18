/**
 * Vitest setup for contract tests.
 * Sets minimal environment variables required by the config module
 * so that importing routers doesn't fail on env validation.
 */
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.DATABASE_URL = 'postgresql://localhost/test';
