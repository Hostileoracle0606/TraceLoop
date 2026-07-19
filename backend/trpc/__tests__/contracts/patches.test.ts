import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { patchesRouter } from '../../routers/patches';
import { createMockDb, createMockContext, VALID_UUID, VALID_TASK_UUID, VALID_RUN_UUID, VALID_PATCH_UUID, testUser, otherUser } from './helpers';

const inngestSend = vi.hoisted(() => vi.fn());
vi.mock('../../../inngest/client', () => ({
  inngest: { send: inngestSend },
  Events: { TASK_RUN_REQUESTED: 'task/run.requested' },
}));

// Mock the permissions module
vi.mock('../../../../src/engine/permissions', () => ({
  checkPermission: vi.fn().mockReturnValue({ allowed: true }),
}));

function createCaller(user: { id: string } | null, db?: ReturnType<typeof createMockDb>) {
  const mockDb = db ?? createMockDb();
  const ctx = createMockContext(user, mockDb);
  return { caller: patchesRouter.createCaller(ctx), db: mockDb };
}

const validProposeInput = {
  taskId: VALID_TASK_UUID,
  file: 'main.c',
  before: 'int x = 0;',
  after: 'int x = 1;',
  summary: 'Fix initialization',
  filesAfterPatch: { 'main.c': 'int x = 1;' },
};

describe('patches router contracts', () => {
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
      await expect(caller.get({ id: VALID_PATCH_UUID })).rejects.toThrow(TRPCError);
    });

    it('propose requires authentication', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.propose(validProposeInput)).rejects.toThrow(TRPCError);
    });

    it('approve requires authentication', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.approve({ id: VALID_PATCH_UUID })).rejects.toThrow(TRPCError);
    });

    it('reject requires authentication', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.reject({ id: VALID_PATCH_UUID })).rejects.toThrow(TRPCError);
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
      await expect(caller.get({ id: 'bad' })).rejects.toThrow();
    });

    it('propose validates taskId is UUID', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.propose({
        ...validProposeInput,
        taskId: 'not-uuid',
      })).rejects.toThrow();
    });

    it('propose validates file is required', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.propose({
        ...validProposeInput,
        // @ts-expect-error - testing missing required field
        file: undefined,
      })).rejects.toThrow();
    });

    it('propose validates before is required', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.propose({
        ...validProposeInput,
        // @ts-expect-error - testing missing required field
        before: undefined,
      })).rejects.toThrow();
    });

    it('propose validates after is required', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.propose({
        ...validProposeInput,
        // @ts-expect-error - testing missing required field
        after: undefined,
      })).rejects.toThrow();
    });

    it('propose validates summary is required', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.propose({
        ...validProposeInput,
        // @ts-expect-error - testing missing required field
        summary: undefined,
      })).rejects.toThrow();
    });

    it('propose validates filesAfterPatch is required', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.propose({
        ...validProposeInput,
        // @ts-expect-error - testing missing required field
        filesAfterPatch: undefined,
      })).rejects.toThrow();
    });

    it('approve validates UUID format', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.approve({ id: 'bad' })).rejects.toThrow();
    });

    it('reject validates UUID format', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.reject({ id: 'bad' })).rejects.toThrow();
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

    it('get throws for non-existent patch', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.patches.findFirst.mockResolvedValue(null);

      await expect(caller.get({ id: VALID_PATCH_UUID })).rejects.toThrow('Patch not found');
    });

    it('approve throws for non-existent patch', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.patches.findFirst.mockResolvedValue(null);

      await expect(caller.approve({ id: VALID_PATCH_UUID })).rejects.toThrow('Patch not found');
    });

    it('reject throws for non-existent patch', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.patches.findFirst.mockResolvedValue(null);

      await expect(caller.reject({ id: VALID_PATCH_UUID })).rejects.toThrow('Patch not found');
    });
  });

  // ── State enforcement ──────────────────────────────────────────────

  describe('state enforcement', () => {
    it('approve rejects non-proposed patches (approved)', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.patches.findFirst.mockResolvedValue({
        id: VALID_PATCH_UUID,
        taskId: VALID_TASK_UUID,
        status: 'approved',
      });
      db.query.tasks.findFirst.mockResolvedValue({
        id: VALID_TASK_UUID, projectId: VALID_UUID,
      });
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID, userId: testUser.id,
      });

      await expect(caller.approve({ id: VALID_PATCH_UUID })).rejects.toThrow('Cannot approve patch in approved state');
    });

    it('approve rejects non-proposed patches (rejected)', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.patches.findFirst.mockResolvedValue({
        id: VALID_PATCH_UUID,
        taskId: VALID_TASK_UUID,
        status: 'rejected',
      });
      db.query.tasks.findFirst.mockResolvedValue({
        id: VALID_TASK_UUID, projectId: VALID_UUID,
      });
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID, userId: testUser.id,
      });

      await expect(caller.approve({ id: VALID_PATCH_UUID })).rejects.toThrow('Cannot approve patch in rejected state');
    });

    it('reject rejects non-proposed patches', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.patches.findFirst.mockResolvedValue({
        id: VALID_PATCH_UUID,
        taskId: VALID_TASK_UUID,
        status: 'approved',
      });
      db.query.tasks.findFirst.mockResolvedValue({
        id: VALID_TASK_UUID, projectId: VALID_UUID,
      });
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID, userId: testUser.id,
      });

      await expect(caller.reject({ id: VALID_PATCH_UUID })).rejects.toThrow('Cannot reject patch in approved state');
    });

    it('approve throws access denied for different user', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.patches.findFirst.mockResolvedValue({
        id: VALID_PATCH_UUID,
        taskId: VALID_TASK_UUID,
        status: 'proposed',
      });
      db.query.tasks.findFirst.mockResolvedValue({
        id: VALID_TASK_UUID, projectId: VALID_UUID,
      });
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID, userId: otherUser.id,
      });

      await expect(caller.approve({ id: VALID_PATCH_UUID })).rejects.toThrow('Access denied');
    });

    it('reject throws access denied for different user', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.patches.findFirst.mockResolvedValue({
        id: VALID_PATCH_UUID,
        taskId: VALID_TASK_UUID,
        status: 'proposed',
      });
      db.query.tasks.findFirst.mockResolvedValue({
        id: VALID_TASK_UUID, projectId: VALID_UUID,
      });
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID, userId: otherUser.id,
      });

      await expect(caller.reject({ id: VALID_PATCH_UUID })).rejects.toThrow('Access denied');
    });
  });

  describe('approval dispatch', () => {
    it('atomically applies a proposed patch, creates a new run, and dispatches that run ID', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      const patch = {
        id: VALID_PATCH_UUID,
        taskId: VALID_TASK_UUID,
        status: 'proposed',
        filesAfterPatch: { 'src/main.c': 'fixed' },
      };
      const task = {
        id: VALID_TASK_UUID,
        projectId: VALID_UUID,
        status: 'patching',
        iteration: 0,
        maxIterations: 5,
        maxTimeMs: 60_000,
        maxCostUsd: 500,
        startedAt: null,
        acceptanceCriteria: [{ name: 'works', register: 'GPIO[1]', expect: '1', byTime: 1000 }],
      };
      db.query.patches.findFirst.mockResolvedValue(patch);
      db.query.tasks.findFirst.mockResolvedValue(task);
      db.query.projects.findFirst.mockResolvedValue({ id: VALID_UUID, userId: testUser.id, boardId: VALID_UUID });
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ total: 0 }]) }),
      } as any);

      const tableName = (table: any) => table[Symbol.for('drizzle:Name')];
      db.update.mockImplementation((table: any) => ({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue(tableName(table) === 'patches' ? [{ ...patch, status: 'approved' }] : [{ ...task, status: 'rerunning', iteration: 1 }]),
          }),
        }),
      }));
      db.insert.mockImplementation((table: any) => ({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(tableName(table) === 'runs' ? [{ id: VALID_RUN_UUID, taskId: VALID_TASK_UUID, iteration: 1 }] : []),
        }),
      }));
      inngestSend.mockResolvedValue(undefined);

      await caller.approve({ id: VALID_PATCH_UUID });

      expect(inngestSend).toHaveBeenCalledWith(expect.objectContaining({
        name: 'task/run.requested',
        data: expect.objectContaining({ runId: VALID_RUN_UUID, iteration: 1, files: patch.filesAfterPatch }),
      }));
    });
  });
});
