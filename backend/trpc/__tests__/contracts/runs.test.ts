import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { runsRouter } from '../../routers/runs';
import { createMockDb, createMockContext, VALID_UUID, VALID_TASK_UUID, VALID_RUN_UUID, testUser, otherUser } from './helpers';

function createCaller(user: { id: string } | null, db?: ReturnType<typeof createMockDb>) {
  const mockDb = db ?? createMockDb();
  const ctx = createMockContext(user, mockDb);
  return { caller: runsRouter.createCaller(ctx), db: mockDb };
}

describe('runs router contracts', () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  // ── Auth enforcement ───────────────────────────────────────────────

  describe('authentication', () => {
    it('listByTask requires authentication', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.listByTask({ taskId: VALID_TASK_UUID })).rejects.toThrow(TRPCError);
    });

    it('get requires authentication', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.get({ id: VALID_RUN_UUID })).rejects.toThrow(TRPCError);
    });

    it('create requires authentication', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.create({ taskId: VALID_TASK_UUID, iteration: 0 })).rejects.toThrow(TRPCError);
    });

    it('updateStatus requires authentication', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.updateStatus({
        id: VALID_RUN_UUID,
        status: 'passed',
      })).rejects.toThrow(TRPCError);
    });
  });

  // ── Input validation ───────────────────────────────────────────────

  describe('input validation', () => {
    it('listByTask validates taskId UUID', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.listByTask({ taskId: 'not-uuid' })).rejects.toThrow();
    });

    it('get validates UUID format', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.get({ id: 'bad-id' })).rejects.toThrow();
    });

    it('create validates taskId UUID', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.create({ taskId: 'bad', iteration: 0 })).rejects.toThrow();
    });

    it('create validates iteration is integer', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.create({
        taskId: VALID_TASK_UUID,
        iteration: 1.5,
      })).rejects.toThrow();
    });

    it('updateStatus validates UUID for id', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.updateStatus({
        id: 'bad',
        status: 'passed',
      })).rejects.toThrow();
    });

    it('updateStatus validates status enum', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.updateStatus({
        id: VALID_RUN_UUID,
        status: 'invalid-status' as any,
      })).rejects.toThrow();
    });

    it('updateStatus accepts all valid status values', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      const validStatuses = ['pending', 'building', 'simulating', 'analyzing', 'passed', 'failed', 'error'] as const;

      for (const status of validStatuses) {
        // Reset mocks for each iteration
        db.query.runs.findFirst.mockResolvedValue({
          id: VALID_RUN_UUID, taskId: VALID_TASK_UUID,
        });
        db.query.tasks.findFirst.mockResolvedValue({
          id: VALID_TASK_UUID, projectId: VALID_UUID,
        });
        db.query.projects.findFirst.mockResolvedValue({
          id: VALID_UUID, userId: testUser.id,
        });
        db.update.mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: VALID_RUN_UUID, status }]),
            }),
          }),
        });

        await expect(caller.updateStatus({
          id: VALID_RUN_UUID,
          status,
        })).resolves.toBeDefined();
      }
    });
  });

  // ── Ownership enforcement ──────────────────────────────────────────

  describe('ownership', () => {
    it('listByTask throws for non-existent task', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.tasks.findFirst.mockResolvedValue(null);

      await expect(caller.listByTask({ taskId: VALID_TASK_UUID })).rejects.toThrow('Task not found');
    });

    it('listByTask throws access denied for different user', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.tasks.findFirst.mockResolvedValue({
        id: VALID_TASK_UUID, projectId: VALID_UUID,
      });
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID, userId: otherUser.id,
      });

      await expect(caller.listByTask({ taskId: VALID_TASK_UUID })).rejects.toThrow('Access denied');
    });

    it('get throws for non-existent run', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.runs.findFirst.mockResolvedValue(null);

      await expect(caller.get({ id: VALID_RUN_UUID })).rejects.toThrow('Run not found');
    });

    it('get throws access denied for different user', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.runs.findFirst.mockResolvedValue({
        id: VALID_RUN_UUID, taskId: VALID_TASK_UUID,
      });
      db.query.tasks.findFirst.mockResolvedValue({
        id: VALID_TASK_UUID, projectId: VALID_UUID,
      });
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID, userId: otherUser.id,
      });

      await expect(caller.get({ id: VALID_RUN_UUID })).rejects.toThrow('Access denied');
    });

    it('updateStatus throws access denied for different user', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.runs.findFirst.mockResolvedValue({
        id: VALID_RUN_UUID, taskId: VALID_TASK_UUID,
      });
      db.query.tasks.findFirst.mockResolvedValue({
        id: VALID_TASK_UUID, projectId: VALID_UUID,
      });
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID, userId: otherUser.id,
      });

      await expect(caller.updateStatus({
        id: VALID_RUN_UUID,
        status: 'passed',
      })).rejects.toThrow('Access denied');
    });
  });
});
