import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { tasksRouter } from '../../routers/tasks';
import { createMockDb, createMockContext, VALID_UUID, VALID_UUID_2, VALID_TASK_UUID, testUser, otherUser } from './helpers';

function createCaller(user: { id: string } | null, db?: ReturnType<typeof createMockDb>) {
  const mockDb = db ?? createMockDb();
  const ctx = createMockContext(user, mockDb);
  return { caller: tasksRouter.createCaller(ctx), db: mockDb };
}

// Valid acceptance criteria for testing
const validAcceptanceCriteria = [
  { name: 'LED blink', register: 'GPIOA_ODR', expect: '0x01', byTime: 1000 },
];

describe('tasks router contracts', () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  // ── Auth enforcement ───────────────────────────────────────────────

  describe('authentication', () => {
    it('listByProject requires authentication', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.listByProject({ projectId: VALID_UUID })).rejects.toThrow(TRPCError);
    });

    it('get requires authentication', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.get({ id: VALID_TASK_UUID })).rejects.toThrow(TRPCError);
    });

    it('create requires authentication', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.create({
        projectId: VALID_UUID,
        intent: 'test',
        acceptanceCriteria: validAcceptanceCriteria,
      })).rejects.toThrow(TRPCError);
    });

    it('transition requires authentication', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.transition({
        taskId: VALID_TASK_UUID,
        toState: 'editing',
        reason: 'test',
      })).rejects.toThrow(TRPCError);
    });

    it('stop requires authentication', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.stop({ taskId: VALID_TASK_UUID })).rejects.toThrow(TRPCError);
    });
  });

  // ── Input validation ───────────────────────────────────────────────

  describe('input validation', () => {
    it('listByProject validates projectId UUID', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.listByProject({ projectId: 'not-uuid' })).rejects.toThrow();
    });

    it('get validates UUID format', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.get({ id: 'bad' })).rejects.toThrow();
    });

    it('create validates projectId is UUID', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.create({
        projectId: 'not-uuid',
        intent: 'test',
        acceptanceCriteria: validAcceptanceCriteria,
      })).rejects.toThrow();
    });

    it('create validates intent is non-empty', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.create({
        projectId: VALID_UUID,
        intent: '',
        acceptanceCriteria: validAcceptanceCriteria,
      })).rejects.toThrow();
    });

    it('create validates intent is required', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.create({
        projectId: VALID_UUID,
        acceptanceCriteria: validAcceptanceCriteria,
        // @ts-expect-error - testing missing required field
      })).rejects.toThrow();
    });

    it('create validates acceptanceCriteria is array', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.create({
        projectId: VALID_UUID,
        intent: 'test',
        // @ts-expect-error - testing wrong type
        acceptanceCriteria: 'not-array',
      })).rejects.toThrow();
    });

    it('create validates acceptanceCriteria items have required fields', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.create({
        projectId: VALID_UUID,
        intent: 'test',
        acceptanceCriteria: [{ name: 'test' }] as any, // missing register, expect, byTime
      })).rejects.toThrow();
    });

    it('create validates permissionProfile enum', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.create({
        projectId: VALID_UUID,
        intent: 'test',
        acceptanceCriteria: validAcceptanceCriteria,
        permissionProfile: 'invalid' as any,
      })).rejects.toThrow();
    });

    it('create accepts valid permissionProfile values', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      // Mock project ownership check
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID, userId: testUser.id,
      });
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: VALID_TASK_UUID }]),
        }),
      });

      for (const profile of ['review', 'guided', 'autonomous'] as const) {
        await expect(caller.create({
          projectId: VALID_UUID,
          intent: 'test',
          acceptanceCriteria: validAcceptanceCriteria,
          permissionProfile: profile,
        })).resolves.toBeDefined();
      }
    });

    it('create validates maxIterations range (1-20)', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.create({
        projectId: VALID_UUID,
        intent: 'test',
        acceptanceCriteria: validAcceptanceCriteria,
        maxIterations: 0,
      })).rejects.toThrow();

      await expect(caller.create({
        projectId: VALID_UUID,
        intent: 'test',
        acceptanceCriteria: validAcceptanceCriteria,
        maxIterations: 21,
      })).rejects.toThrow();
    });

    it('create validates maxTimeMs range (60000-3600000)', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.create({
        projectId: VALID_UUID,
        intent: 'test',
        acceptanceCriteria: validAcceptanceCriteria,
        maxTimeMs: 59999,
      })).rejects.toThrow();

      await expect(caller.create({
        projectId: VALID_UUID,
        intent: 'test',
        acceptanceCriteria: validAcceptanceCriteria,
        maxTimeMs: 3600001,
      })).rejects.toThrow();
    });

    it('create validates maxCostUsd range (100-10000)', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.create({
        projectId: VALID_UUID,
        intent: 'test',
        acceptanceCriteria: validAcceptanceCriteria,
        maxCostUsd: 99,
      })).rejects.toThrow();

      await expect(caller.create({
        projectId: VALID_UUID,
        intent: 'test',
        acceptanceCriteria: validAcceptanceCriteria,
        maxCostUsd: 10001,
      })).rejects.toThrow();
    });

    it('transition validates taskId UUID', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.transition({
        taskId: 'bad',
        toState: 'editing',
        reason: 'test',
      })).rejects.toThrow();
    });

    it('transition validates toState enum', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.transition({
        taskId: VALID_TASK_UUID,
        toState: 'invalid-state' as any,
        reason: 'test',
      })).rejects.toThrow();
    });

    it('stop validates taskId UUID', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.stop({ taskId: 'not-uuid' })).rejects.toThrow();
    });
  });

  // ── Ownership enforcement ──────────────────────────────────────────

  describe('ownership', () => {
    it('listByProject throws access denied for different user', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID, userId: otherUser.id,
      });

      await expect(caller.listByProject({ projectId: VALID_UUID })).rejects.toThrow('Access denied');
    });

    it('create throws access denied for different user', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID, userId: otherUser.id,
      });

      await expect(caller.create({
        projectId: VALID_UUID,
        intent: 'test',
        acceptanceCriteria: validAcceptanceCriteria,
      })).rejects.toThrow('Access denied');
    });

    it('get throws access denied for different user', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.tasks.findFirst.mockResolvedValue({
        id: VALID_TASK_UUID, projectId: VALID_UUID,
      });
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID, userId: otherUser.id,
      });

      await expect(caller.get({ id: VALID_TASK_UUID })).rejects.toThrow('Access denied');
    });

    it('get throws for non-existent task', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.tasks.findFirst.mockResolvedValue(null);

      await expect(caller.get({ id: VALID_TASK_UUID })).rejects.toThrow('Task not found');
    });
  });

  // ── FSM state transitions ──────────────────────────────────────────

  describe('FSM state transitions', () => {
    it('transition rejects invalid state transitions', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.tasks.findFirst.mockResolvedValue({
        id: VALID_TASK_UUID,
        projectId: VALID_UUID,
        status: 'completed',
        iteration: 0,
      });
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID, userId: testUser.id,
      });

      // completed → editing is not valid
      await expect(caller.transition({
        taskId: VALID_TASK_UUID,
        toState: 'editing',
        reason: 'test',
      })).rejects.toThrow('Invalid state transition');
    });

    it('transition allows valid state transitions', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.tasks.findFirst.mockResolvedValue({
        id: VALID_TASK_UUID,
        projectId: VALID_UUID,
        status: 'planning',
        iteration: 0,
      });
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID, userId: testUser.id,
      });
      db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: VALID_TASK_UUID, status: 'editing' }]),
          }),
        }),
      });

      // planning → editing is valid
      await expect(caller.transition({
        taskId: VALID_TASK_UUID,
        toState: 'editing',
        reason: 'plan approved',
      })).resolves.toBeDefined();
    });

    it('stop rejects already completed tasks', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.tasks.findFirst.mockResolvedValue({
        id: VALID_TASK_UUID,
        projectId: VALID_UUID,
        status: 'completed',
        iteration: 0,
      });
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID, userId: testUser.id,
      });

      await expect(caller.stop({ taskId: VALID_TASK_UUID })).rejects.toThrow('Cannot stop task in completed state');
    });

    it('stop rejects already stopped tasks', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.tasks.findFirst.mockResolvedValue({
        id: VALID_TASK_UUID,
        projectId: VALID_UUID,
        status: 'stopped',
        iteration: 0,
      });
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID, userId: testUser.id,
      });

      await expect(caller.stop({ taskId: VALID_TASK_UUID })).rejects.toThrow('Cannot stop task in stopped state');
    });

    it('transition throws for non-existent task', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.tasks.findFirst.mockResolvedValue(null);

      await expect(caller.transition({
        taskId: VALID_TASK_UUID,
        toState: 'editing',
        reason: 'test',
      })).rejects.toThrow('Task not found');
    });

    it('stop throws for non-existent task', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.tasks.findFirst.mockResolvedValue(null);

      await expect(caller.stop({ taskId: VALID_TASK_UUID })).rejects.toThrow('Task not found');
    });
  });
});
