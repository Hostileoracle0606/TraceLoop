import { vi } from 'vitest';
import type { Context } from '../../context';

/**
 * Creates a mock database context for testing tRPC routers.
 * All query methods return vi.fn() mocks that can be configured per test.
 */
export function createMockDb() {
  return {
    query: {
      projects: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      tasks: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      runs: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      patches: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      boards: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      activityLogs: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
          orderBy: vi.fn().mockResolvedValue([]),
        }),
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
          orderBy: vi.fn().mockResolvedValue([]),
        }),
        orderBy: vi.fn().mockResolvedValue([]),
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

/** A valid UUID for testing. */
export const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
/** Another valid UUID for testing (different user). */
export const VALID_UUID_2 = '660e8400-e29b-41d4-a716-446655440001';
/** A valid board UUID. */
export const VALID_BOARD_UUID = '770e8400-e29b-41d4-a716-446655440002';
/** A valid task UUID. */
export const VALID_TASK_UUID = '880e8400-e29b-41d4-a716-446655440003';
/** A valid run UUID. */
export const VALID_RUN_UUID = '990e8400-e29b-41d4-a716-446655440004';
/** A valid patch UUID. */
export const VALID_PATCH_UUID = 'aa0e8400-e29b-41d4-a716-446655440005';

/** Standard test user. */
export const testUser = { id: 'user-1' };
/** Different user for ownership tests. */
export const otherUser = { id: 'user-2' };

/**
 * Creates a mock context suitable for tRPC caller creation.
 */
export function createMockContext(
  user: { id: string } | null,
  db?: ReturnType<typeof createMockDb>
): Context {
  return {
    db: (db ?? createMockDb()) as unknown as Context['db'],
    user: user as Context['user'],
    traceId: 'test-trace-id',
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Context['logger'],
  };
}
