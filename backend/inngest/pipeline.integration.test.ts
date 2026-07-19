import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const harness = vi.hoisted(() => {
  const state = {
    task: {} as Record<string, any>,
    runs: [] as Array<Record<string, any>>,
    patches: [] as Array<Record<string, any>>,
    activities: [] as Array<Record<string, any>>,
    sent: [] as Array<Record<string, any>>,
    jobResults: [] as Array<Record<string, any>>,
    patchProposal: {
      file: 'src/main.c',
      before: 'gpio_pin_set_dt(&orange_led, 1)',
      after: 'gpio_pin_set_dt(&green_led, 1)',
      summary: 'Write the expected LED',
      confidence: 0.99,
    },
  };

  const tableName = (table: any) => table[Symbol.for('drizzle:Name')] as string;
  const collection = (name: string) => {
    if (name === 'runs') return state.runs;
    if (name === 'patches') return state.patches;
    if (name === 'activity_logs') return state.activities;
    throw new Error(`Unsupported collection: ${name}`);
  };
  const thenable = (value: unknown) => ({
    returning: async () => value,
    then: (resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(undefined).then(resolve, reject),
  });

  const db: any = {
    query: {
      tasks: { findFirst: vi.fn(async () => state.task.id ? state.task : undefined) },
      runs: { findFirst: vi.fn(async () => state.runs.find((run) => run.iteration === state.task.iteration)) },
      patches: { findFirst: vi.fn(async () => state.patches.at(-1)) },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => [{ total: state.runs.reduce((sum, run) => sum + (run.costUsd ?? 0), 0) }]),
      })),
    })),
    update: vi.fn((table: any) => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(() => {
          const name = tableName(table);
          if (name === 'tasks') {
            Object.assign(state.task, values);
            return thenable([state.task]);
          }
          const rows = collection(name);
          const target = name === 'runs'
            ? rows.find((row) => row.iteration === state.task.iteration) ?? rows.at(-1)
            : rows.at(-1);
          if (target) Object.assign(target, values);
          return thenable(target ? [target] : []);
        }),
      })),
    })),
    insert: vi.fn((table: any) => ({
      values: vi.fn((values: Record<string, any>) => {
        const name = tableName(table);
        if (name === 'runs') {
          const row = { id: `run-${state.runs.length}`, createdAt: new Date(), ...values };
          state.runs.push(row);
          return thenable([row]);
        }
        if (name === 'patches') {
          const row = { id: `patch-${state.patches.length}`, createdAt: new Date(), ...values };
          state.patches.push(row);
          return thenable([row]);
        }
        if (name === 'activity_logs') {
          state.activities.push({ id: `activity-${state.activities.length}`, ...values });
          return thenable([]);
        }
        throw new Error(`Unsupported insert: ${name}`);
      }),
    })),
  };
  db.transaction = vi.fn(async (callback: (tx: any) => unknown) => callback(db));
  return { state, db };
});

vi.mock('../db', () => ({ db: harness.db }));
vi.mock('../storage', () => ({ uploadArtifact: vi.fn() }));
vi.mock('../modal-client', () => ({
  resolveBoardSlug: vi.fn(async () => 'stm32f4_disco'),
  modalClient: { firmwareJob: vi.fn(async () => harness.state.jobResults.shift()) },
}));
vi.mock('../agent/runtime-selection', () => ({
  resolveAgentRuntime: vi.fn(() => ({
    runStage: vi.fn(async () => ({ kind: 'patch', patch: harness.state.patchProposal })),
  })),
}));
vi.mock('./client', () => ({
  Events: { TASK_RUN_REQUESTED: 'task/run.requested', TASK_CANCELLED: 'task/cancelled' },
  inngest: {
    createFunction: vi.fn((_options, handler) => handler),
    send: vi.fn(),
  },
}));

import { firmwareRunPipeline, cancelFirmwareRun } from './functions';

const failingTrace = readFileSync(new URL('../../src/engine/__fixtures__/renode-zephyr-sample.log', import.meta.url), 'utf8');
const passingTrace = failingTrace.replace('BitSet), value 0x2000', 'BitSet), value 0x1000');
const acceptanceCriteria = [{ name: 'green LED', register: 'GPIOG_ODR[12]', expect: '1', byTime: 2000 }];
const initialFiles = { 'src/main.c': 'void timer_isr(void) { gpio_pin_set_dt(&orange_led, 1); }' };

function reset(profile: 'review' | 'guided' | 'autonomous' = 'autonomous', maxIterations = 3) {
  harness.state.task = {
    id: 'task-1',
    projectId: 'project-1',
    userId: 'user-1',
    status: 'building',
    iteration: 0,
    permissionProfile: profile,
    agentRuntime: 'legacy',
    maxIterations,
    maxTimeMs: 60_000,
    maxCostUsd: 500,
    startedAt: new Date(),
    currentFiles: initialFiles,
  };
  harness.state.runs = [{ id: 'run-0', taskId: 'task-1', iteration: 0, status: 'pending', costUsd: 0 }];
  harness.state.patches = [];
  harness.state.activities = [];
  harness.state.sent = [];
  harness.state.jobResults = [];
}

async function invokePipeline(data: Record<string, unknown>) {
  const step = {
    run: vi.fn(async (_id: string, callback: () => unknown) => callback()),
    sendEvent: vi.fn(async (_id: string, payload: Record<string, unknown>) => {
      harness.state.sent.push(payload);
    }),
  };
  const result = await (firmwareRunPipeline as any)({ event: { data }, step });
  return { result, step };
}

function eventData(runId = 'run-0', iteration = 0, files = initialFiles) {
  return {
    taskId: 'task-1', runId, userId: 'user-1', projectId: 'project-1',
    iteration, files, boardId: 'board-1', acceptanceCriteria,
  };
}

describe('firmwareRunPipeline shipped-path integration', () => {
  beforeEach(() => reset());

  it('converges fail → validated patch → autonomous rerun → pass', async () => {
    harness.state.jobResults.push(
      { build: { ok: true, log: 'built' }, trace: { log: failingTrace } },
      { build: { ok: true, log: 'built' }, trace: { log: passingTrace } },
    );

    const first = await invokePipeline(eventData());
    expect(first.result.status).toBe('rerunning');
    expect(harness.state.patches[0]).toMatchObject({ status: 'approved' });
    expect(harness.state.task).toMatchObject({ status: 'rerunning', iteration: 1 });
    expect(harness.state.sent).toHaveLength(1);

    const rerun = (harness.state.sent[0] as any).data;
    const second = await invokePipeline(rerun);
    expect(second.result.status).toBe('passed');
    expect(harness.state.task.status).toBe('completed');
    expect(harness.state.runs).toHaveLength(2);
  });

  it('pauses review mode with unchanged task files and a proposed patch', async () => {
    reset('review');
    harness.state.jobResults.push({ build: { ok: true, log: 'built' }, trace: { log: failingTrace } });

    const { result } = await invokePipeline(eventData());
    expect(result.status).toBe('awaiting-approval');
    expect(harness.state.task.status).toBe('patching');
    expect(harness.state.task.currentFiles).toEqual(initialFiles);
    expect(harness.state.patches[0]).toMatchObject({ status: 'proposed' });
    expect(harness.state.sent).toHaveLength(0);
  });

  it('repairs build failures and blocks exactly at the iteration budget', async () => {
    reset('autonomous', 2);
    harness.state.jobResults.push(
      { build: { ok: false, log: 'main.c: error: bad LED symbol' } },
      { build: { ok: false, log: 'main.c: error: still broken' } },
    );

    const first = await invokePipeline(eventData());
    expect(first.result.status).toBe('rerunning');
    const rerun = (harness.state.sent[0] as any).data;
    const second = await invokePipeline(rerun);
    expect(second.result.status).toBe('blocked');
    expect(harness.state.task.status).toBe('blocked');
    expect(harness.state.activities.some((entry) => entry.reason === 'budget-exhausted')).toBe(true);
  });

  it('cancellation leaves the task stopped and the run cancelled', async () => {
    const step = { run: vi.fn(async (_id: string, callback: () => unknown) => callback()) };
    await (cancelFirmwareRun as any)({
      event: { data: { taskId: 'task-1', runId: 'run-0', reason: 'user requested' } },
      step,
    });
    expect(harness.state.task.status).toBe('stopped');
    expect(harness.state.runs[0]?.status).toBe('cancelled');
  });
});
