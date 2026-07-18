import { createSupabaseAdminClient } from './supabase';
import { db } from './db';
import { runs, tasks } from './db/schema';
import { sql, and, gte, eq, count, avg } from 'drizzle-orm';
import { getInngestConfig } from './config';

// ── Types ────────────────────────────────────────────────────────────

export interface HealthStatus {
  status: 'ok' | 'degraded';
  checks: {
    supabase: 'ok' | 'error';
    inngest: 'ok' | 'error';
  };
  timestamp: string;
}

export interface QueueHealth {
  pendingRuns: number;
  runningRuns: number;
  timestamp: string;
}

export interface Metrics {
  runs24h: number;
  successRate: number;
  avgDurationMs: number;
  activeTasks: number;
  timestamp: string;
}

// ── Health Check ─────────────────────────────────────────────────────

export async function healthCheck(): Promise<HealthStatus> {
  const checks: HealthStatus['checks'] = {
    supabase: 'error',
    inngest: 'error',
  };

  // Check Supabase via a simple query
  try {
    await db.execute(sql`SELECT 1`);
    checks.supabase = 'ok';
  } catch {
    checks.supabase = 'error';
  }

  // Check Inngest by pinging the local endpoint
  try {
    const baseUrl = getInngestConfig().baseUrl ?? 'http://localhost:3000';
    const url = `${baseUrl}/api/inngest`;
    const response = await fetch(url, {
      method: 'PUT', // Inngest SDK uses PUT for health/ping
      signal: AbortSignal.timeout(5000),
    });
    // Inngest responds to PUT with function registration info
    if (response.ok || response.status === 200 || response.status === 201) {
      checks.inngest = 'ok';
    }
  } catch {
    checks.inngest = 'error';
  }

  const status = checks.supabase === 'ok' && checks.inngest === 'ok' ? 'ok' : 'degraded';

  return {
    status,
    checks,
    timestamp: new Date().toISOString(),
  };
}

// ── Queue Health ─────────────────────────────────────────────────────

export async function queueHealth(): Promise<QueueHealth> {
  // Query the database for pending and running runs
  const now = new Date();

  const [pendingResult] = await db
    .select({ value: count() })
    .from(runs)
    .where(eq(runs.status, 'pending'));

  const [runningResult] = await db
    .select({ value: count() })
    .from(runs)
    .where(
      sql`${runs.status} IN ('building', 'simulating', 'analyzing')`
    );

  return {
    pendingRuns: pendingResult?.value ?? 0,
    runningRuns: runningResult?.value ?? 0,
    timestamp: now.toISOString(),
  };
}

// ── Metrics ──────────────────────────────────────────────────────────

export async function metrics(): Promise<Metrics> {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Total runs in last 24h
  const [totalResult] = await db
    .select({ value: count() })
    .from(runs)
    .where(gte(runs.createdAt, twentyFourHoursAgo));

  const runs24h = totalResult?.value ?? 0;

  // Passed runs in last 24h
  const [passedResult] = await db
    .select({ value: count() })
    .from(runs)
    .where(
      and(
        gte(runs.createdAt, twentyFourHoursAgo),
        eq(runs.status, 'passed')
      )
    );

  const passed24h = passedResult?.value ?? 0;
  const successRate = runs24h > 0 ? Math.round((passed24h / runs24h) * 100) : 0;

  // Average run duration (from runs that have elapsed_ms)
  const [avgResult] = await db
    .select({ value: avg(runs.elapsedMs) })
    .from(runs)
    .where(
      and(
        gte(runs.createdAt, twentyFourHoursAgo),
        sql`${runs.elapsedMs} IS NOT NULL`
      )
    );

  const avgDurationMs = Math.round(Number(avgResult?.value ?? 0));

  // Active tasks (not in terminal state)
  const [activeResult] = await db
    .select({ value: count() })
    .from(tasks)
    .where(
      sql`${tasks.status} NOT IN ('completed', 'blocked', 'stopped')`
    );

  const activeTasks = activeResult?.value ?? 0;

  return {
    runs24h,
    successRate,
    avgDurationMs,
    activeTasks,
    timestamp: now.toISOString(),
  };
}
