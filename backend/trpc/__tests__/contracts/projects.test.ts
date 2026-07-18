import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { initTRPC } from '@trpc/server';
import { projectsRouter } from '../../routers/projects';
import { createMockDb, createMockContext, VALID_UUID, VALID_UUID_2, testUser, otherUser } from './helpers';

// We need to create a caller using the same tRPC init as the router
// The router exports are already initialized, so we use createCallerFactory
const t = initTRPC.context<ReturnType<typeof createMockContext>>().create();

function createCaller(user: { id: string } | null, db?: ReturnType<typeof createMockDb>) {
  const mockDb = db ?? createMockDb();
  const ctx = createMockContext(user, mockDb);
  // Use the router's own createCaller via tRPC internals
  const caller = projectsRouter.createCaller(ctx);
  return { caller, db: mockDb };
}

describe('projects router contracts', () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  // ── Auth enforcement ───────────────────────────────────────────────

  describe('authentication', () => {
    it('list requires authentication', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.list()).rejects.toThrow(TRPCError);
      await expect(caller.list()).rejects.toThrow('logged in');
    });

    it('get requires authentication', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.get({ id: VALID_UUID })).rejects.toThrow(TRPCError);
    });

    it('create requires authentication', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.create({ name: 'Test' })).rejects.toThrow(TRPCError);
    });

    it('update requires authentication', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.update({ id: VALID_UUID })).rejects.toThrow(TRPCError);
    });

    it('delete requires authentication', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.delete({ id: VALID_UUID })).rejects.toThrow(TRPCError);
    });
  });

  // ── Input validation ───────────────────────────────────────────────

  describe('input validation', () => {
    it('get validates UUID format', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.get({ id: 'not-a-uuid' })).rejects.toThrow();
    });

    it('get rejects empty string', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.get({ id: '' })).rejects.toThrow();
    });

    it('create validates name is required', async () => {
      const { caller } = createCaller(testUser, mockDb);
      // @ts-expect-error - testing missing required field
      await expect(caller.create({})).rejects.toThrow();
    });

    it('create validates name min length (1)', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.create({ name: '' })).rejects.toThrow();
    });

    it('create validates name max length (255)', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.create({ name: 'x'.repeat(256) })).rejects.toThrow();
    });

    it('create accepts valid name at boundaries', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      // Set up mock to return a project
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: VALID_UUID,
            name: 'x',
            userId: testUser.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          }]),
        }),
      });
      // Should not throw for min-length name
      await expect(caller.create({ name: 'x' })).resolves.toBeDefined();
    });

    it('create validates boardId is UUID when provided', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.create({ name: 'Test', boardId: 'not-uuid' })).rejects.toThrow();
    });

    it('update validates UUID for id', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.update({ id: 'bad-id' })).rejects.toThrow();
    });

    it('update validates name length when provided', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.update({ id: VALID_UUID, name: '' })).rejects.toThrow();
    });

    it('delete validates UUID format', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.delete({ id: 'not-uuid' })).rejects.toThrow();
    });
  });

  // ── Ownership enforcement ──────────────────────────────────────────

  describe('ownership', () => {
    it('get throws access denied for different user', async () => {
      const { caller, db } = createCaller(testUser, mockDb);

      // First select returns the project (found)
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{
                id: VALID_UUID,
                name: 'Other Project',
              }]),
            }),
          }),
        }),
      });

      // Ownership check: project belongs to different user
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID,
        userId: otherUser.id,
      });

      await expect(caller.get({ id: VALID_UUID })).rejects.toThrow('Access denied');
    });

    it('get throws for non-existent project', async () => {
      const { caller, db } = createCaller(testUser, mockDb);

      // Select returns empty
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      await expect(caller.get({ id: VALID_UUID })).rejects.toThrow('Project not found');
    });

    it('update throws access denied for different user', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID,
        userId: otherUser.id,
      });

      await expect(caller.update({ id: VALID_UUID, name: 'Updated' })).rejects.toThrow('Access denied');
    });

    it('delete throws access denied for different user', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID,
        userId: otherUser.id,
      });

      await expect(caller.delete({ id: VALID_UUID })).rejects.toThrow('Access denied');
    });

    it('update throws for non-existent project', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.projects.findFirst.mockResolvedValue(null);

      await expect(caller.update({ id: VALID_UUID })).rejects.toThrow('Access denied');
    });

    it('delete throws for non-existent project', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.projects.findFirst.mockResolvedValue(null);

      await expect(caller.delete({ id: VALID_UUID })).rejects.toThrow('Access denied');
    });
  });
});
