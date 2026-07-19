import { AgentProviderError } from '../../errors';

/**
 * Provider-shape-agnostic view of a Backboard run.
 */
export interface NormalizedRun {
  id: string;
  status: 'in_progress' | 'requires_action' | 'completed' | 'failed' | 'cancelled' | 'expired';
  toolCalls: Array<{ id: string; name: string; argumentsRaw: unknown }>;
  finalText?: string;
  usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number };
  raw: unknown;
}

export interface ToolOutput {
  toolCallId: string;
  output: unknown;
}

const STATUS_MAP: Record<string, NormalizedRun['status']> = {
  IN_PROGRESS: 'in_progress',
  QUEUED: 'in_progress',
  REQUIRES_ACTION: 'requires_action',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
};

export function normalizeRun(raw: unknown): NormalizedRun {
  if (typeof raw !== 'object' || raw === null) {
    throw new AgentProviderError('provider-malformed-response', 'run is not an object', raw);
  }
  const r = raw as Record<string, unknown>;
  const status = STATUS_MAP[String(r.status ?? '').toUpperCase()];
  if (!r.id || !status) {
    throw new AgentProviderError('provider-malformed-response', `unrecognized run shape (status=${String(r.status)})`, raw);
  }

  const requiredAction = r.required_action as { tool_calls?: unknown[] } | undefined;
  const toolCalls = (requiredAction?.tool_calls ?? []).map((c) => {
    const call = c as Record<string, unknown>;
    return {
      id: String(call.id ?? ''),
      name: String(call.name ?? ''),
      argumentsRaw: call.arguments,
    };
  });

  const output = r.output as { text?: string } | undefined;

  return {
    id: String(r.id),
    status,
    toolCalls,
    finalText: typeof output?.text === 'string' ? output.text : undefined,
    raw,
  };
}

/**
 * Drive the REQUIRES_ACTION loop.
 * F2: all outputs of a round are submitted together (failed tools submit `{ error }` payloads).
 * F3: bounded rounds.
 * F11: a cancelled run stops the loop without submission.
 */
export async function driveToolLoop(opts: {
  getRun: () => Promise<NormalizedRun>;
  submitOutputs: (outputs: ToolOutput[]) => Promise<void>;
  executeTool: (call: NormalizedRun['toolCalls'][number]) => Promise<ToolOutput>;
  maxRounds: number;
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<NormalizedRun> {
  const sleep = opts.sleep ?? ((ms) => new Promise((res) => setTimeout(res, ms)));
  const interval = opts.pollIntervalMs ?? 1000;

  for (let round = 0; round < opts.maxRounds; round++) {
    let run = await opts.getRun();
    while (run.status === 'in_progress') {
      await sleep(interval);
      run = await opts.getRun();
    }
    if (run.status !== 'requires_action') return run;

    const outputs: ToolOutput[] = [];
    for (const call of run.toolCalls) {
      try {
        outputs.push(await opts.executeTool(call));
      } catch (e) {
        outputs.push({
          toolCallId: call.id,
          output: { error: e instanceof Error ? e.message : String(e) },
        });
      }
    }
    await opts.submitOutputs(outputs);
  }
  throw new AgentProviderError('budget-exceeded', `tool loop exceeded ${opts.maxRounds} rounds`);
}
