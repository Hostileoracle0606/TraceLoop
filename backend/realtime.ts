import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './config';

/**
 * Realtime subscription helpers for streaming task/run state changes
 * to connected frontend clients.
 */

// Channel name patterns
const TASK_CHANNEL = (taskId: string) => `task:${taskId}`;
const RUN_CHANNEL = (taskId: string) => `run:${taskId}`;

/**
 * Create a realtime client for broadcasting state changes.
 * Uses the service role key since this is server-side only.
 */
function createRealtimeClient(): SupabaseClient {
  const { url, serviceKey } = getSupabaseConfig();
  return createClient(url, serviceKey, {
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });
}

// Singleton client
let realtimeClient: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!realtimeClient) {
    realtimeClient = createRealtimeClient();
  }
  return realtimeClient;
}

/**
 * Broadcast a task state change to all subscribers.
 */
export async function broadcastTaskStateChange(
  taskId: string,
  payload: {
    fromState: string;
    toState: string;
    reason: string;
    iteration: number;
    timestamp: string;
  }
): Promise<void> {
  const client = getClient();
  const channel = client.channel(TASK_CHANNEL(taskId));

  await channel.send({
    type: 'broadcast',
    event: 'task:state-changed',
    payload,
  });
}

/**
 * Broadcast a run status change to all subscribers.
 */
export async function broadcastRunStatusChange(
  taskId: string,
  runId: string,
  payload: {
    runId: string;
    status: string;
    iteration: number;
    timestamp: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const client = getClient();
  const channel = client.channel(RUN_CHANNEL(taskId));

  await channel.send({
    type: 'broadcast',
    event: 'run:status-changed',
    payload: { ...payload, runId },
  });
}

/**
 * Broadcast build progress (log streaming).
 */
export async function broadcastBuildProgress(
  taskId: string,
  runId: string,
  payload: {
    runId: string;
    logChunk: string;
    progress?: number; // 0-100
  }
): Promise<void> {
  const client = getClient();
  const channel = client.channel(RUN_CHANNEL(taskId));

  await channel.send({
    type: 'broadcast',
    event: 'build:progress',
    payload,
  });
}

/**
 * Broadcast analysis results when complete.
 */
export async function broadcastAnalysisComplete(
  taskId: string,
  runId: string,
  payload: {
    runId: string;
    status: 'passed' | 'failed';
    rootCause?: string;
    chain?: unknown[];
    artifacts?: Array<{ name: string; url: string }>;
  }
): Promise<void> {
  const client = getClient();
  const channel = client.channel(RUN_CHANNEL(taskId));

  await channel.send({
    type: 'broadcast',
    event: 'analysis:complete',
    payload,
  });
}

/**
 * Subscribe to database changes for a specific task.
 * This uses Postgres CDC (Change Data Capture) to stream
 * actual row changes from the tasks and runs tables.
 */
export function subscribeToTaskChanges(
  taskId: string,
  callback: (payload: {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    new: Record<string, unknown>;
    old: Record<string, unknown>;
  }) => void
): RealtimeChannel {
  const client = getClient();
  const channel = client.channel(`db-changes:${taskId}`);

  // Use postgres_changes channel for CDC subscriptions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chan = channel as any;
  chan
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `id=eq.${taskId}`,
      },
      (payload: {
        eventType: 'INSERT' | 'UPDATE' | 'DELETE';
        new: Record<string, unknown>;
        old: Record<string, unknown>;
      }) => {
        callback(payload);
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'runs',
        filter: `task_id=eq.${taskId}`,
      },
      (payload: {
        eventType: 'INSERT' | 'UPDATE' | 'DELETE';
        new: Record<string, unknown>;
        old: Record<string, unknown>;
      }) => {
        callback(payload);
      }
    )
    .subscribe();

  return channel;
}

/**
 * Unsubscribe from a realtime channel.
 */
export async function unsubscribe(channel: RealtimeChannel): Promise<void> {
  const client = getClient();
  await client.removeChannel(channel);
}
