import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted() to declare mocks that are hoisted along with vi.mock
const { mockSend, mockCreateFunction } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockCreateFunction: vi.fn().mockReturnValue({}),
}));

vi.mock('../../../inngest/client', async () => {
  const actual = await vi.importActual('../../../inngest/client');
  return {
    ...actual,
    inngest: {
      send: mockSend,
      createFunction: mockCreateFunction,
    },
  };
});

import { tasksRouter } from '../tasks';
import { createMockDb, createMockContext, VALID_TASK_UUID, VALID_RUN_UUID, testUser } from '../../__tests__/contracts/helpers';

// Import to trigger module-level pipeline registration
import '../../../inngest/functions';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('Issue 06: tasks.stop sends TASK_CANCELLED', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupStopMocks({ runStatus }: { runStatus: string | null }) {
    const mockDb = createMockDb();
    const ctx = createMockContext(testUser, mockDb);

    mockDb.query.tasks.findFirst.mockResolvedValue({
      id: VALID_TASK_UUID,
      projectId: PROJECT_ID,
      status: 'building',
      iteration: 0,
    });
    mockDb.query.projects.findFirst.mockResolvedValue({
      id: PROJECT_ID,
      userId: testUser.id,
    });
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: VALID_TASK_UUID, status: 'stopped' }]),
        }),
      }),
    });
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    });
    mockDb.query.runs.findFirst.mockResolvedValue(
      runStatus ? { id: VALID_RUN_UUID, taskId: VALID_TASK_UUID, status: runStatus } : null
    );

    return { mockDb, ctx };
  }

  it('sends TASK_CANCELLED when stopping a task with an active run', async () => {
    const { ctx } = setupStopMocks({ runStatus: 'building' });
    const caller = tasksRouter.createCaller(ctx);

    await caller.stop({ taskId: VALID_TASK_UUID, reason: 'user-requested' });

    expect(mockSend).toHaveBeenCalledWith({
      name: 'task/cancelled',
      data: {
        taskId: VALID_TASK_UUID,
        runId: VALID_RUN_UUID,
        reason: 'user-requested',
      },
    });
  });

  it('does NOT send TASK_CANCELLED when run status is passed', async () => {
    const { ctx } = setupStopMocks({ runStatus: 'passed' });
    const caller = tasksRouter.createCaller(ctx);

    await caller.stop({ taskId: VALID_TASK_UUID });

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('does NOT send TASK_CANCELLED when run status is cancelled', async () => {
    const { ctx } = setupStopMocks({ runStatus: 'cancelled' });
    const caller = tasksRouter.createCaller(ctx);

    await caller.stop({ taskId: VALID_TASK_UUID });

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('does NOT send TASK_CANCELLED when run status is error', async () => {
    const { ctx } = setupStopMocks({ runStatus: 'error' });
    const caller = tasksRouter.createCaller(ctx);

    await caller.stop({ taskId: VALID_TASK_UUID });

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('does NOT send TASK_CANCELLED when no run exists', async () => {
    const { ctx } = setupStopMocks({ runStatus: null });
    const caller = tasksRouter.createCaller(ctx);

    await caller.stop({ taskId: VALID_TASK_UUID });

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('defaults reason to user-cancelled when none provided', async () => {
    const { ctx } = setupStopMocks({ runStatus: 'simulating' });
    const caller = tasksRouter.createCaller(ctx);

    await caller.stop({ taskId: VALID_TASK_UUID });

    expect(mockSend).toHaveBeenCalledWith({
      name: 'task/cancelled',
      data: {
        taskId: VALID_TASK_UUID,
        runId: VALID_RUN_UUID,
        reason: 'user-cancelled',
      },
    });
  });
});

describe('Issue 06: firmwareRunPipeline cancelOn configuration', () => {
  it('pipeline was registered with cancelOn keyed to TASK_CANCELLED by taskId', async () => {
    // Reset modules to ensure clean state
    vi.resetModules();
    
    // Dynamically import functions module to trigger registration with our mock
    await import('../../../inngest/functions');
    
    // Find the call for 'firmware-run-pipeline'
    const pipelineCall = mockCreateFunction.mock.calls.find(
      (call: any[]) => call[0]?.id === 'firmware-run-pipeline'
    );

    expect(pipelineCall).toBeDefined();
    const config = pipelineCall![0];

    expect(config.cancelOn).toBeDefined();
    expect(config.cancelOn).toHaveLength(1);
    expect(config.cancelOn[0].event).toBe('task/cancelled');
    expect(config.cancelOn[0].if).toBe('async.data.taskId == event.data.taskId');
  });
});
