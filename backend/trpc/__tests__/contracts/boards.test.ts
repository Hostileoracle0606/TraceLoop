import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { boardsRouter } from '../../routers/boards';
import { createMockDb, createMockContext, VALID_UUID, VALID_BOARD_UUID, testUser, adminUser } from './helpers';

// Mock board-capabilities module
vi.mock('../../../../src/engine/board-capabilities', () => ({
  validateAssertionForBoard: vi.fn().mockReturnValue({ valid: true }),
  getBoardForTarget: vi.fn(),
}));

function createCaller(user: { id: string } | null, db?: ReturnType<typeof createMockDb>) {
  const mockDb = db ?? createMockDb();
  const ctx = createMockContext(user, mockDb);
  return { caller: boardsRouter.createCaller(ctx), db: mockDb };
}

const validBoardInput = {
  name: 'STM32F4 Discovery',
  slug: 'stm32f4_discovery',
  mcu: 'STM32F407VG',
  architecture: 'arm_cortex_m4',
  memoryFlash: 1024,
  memoryRam: 192,
  peripherals: ['GPIO', 'UART', 'SPI', 'Timers'],
  buildTarget: 'stm32f4_disco',
};

describe('boards router contracts', () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  // ── Public access ──────────────────────────────────────────────────

  describe('public access', () => {
    it('list does NOT require authentication', async () => {
      const { caller } = createCaller(null, mockDb);
      // Should not throw UNAUTHORIZED
      await expect(caller.list()).resolves.toBeDefined();
    });

    it('get does NOT require authentication', async () => {
      const { caller, db } = createCaller(null, mockDb);
      db.query.boards.findFirst.mockResolvedValue({
        id: VALID_BOARD_UUID,
        name: 'Test Board',
      });
      await expect(caller.get({ id: VALID_BOARD_UUID })).resolves.toBeDefined();
    });

    it('getByTarget does NOT require authentication', async () => {
      const { caller, db } = createCaller(null, mockDb);
      db.query.boards.findFirst.mockResolvedValue({
        id: VALID_BOARD_UUID,
        name: 'Test Board',
        buildTarget: 'stm32f4_disco',
      });
      await expect(caller.getByTarget({ buildTarget: 'stm32f4_disco' })).resolves.toBeDefined();
    });

    it('search does NOT require authentication', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.search({ query: 'stm32' })).resolves.toBeDefined();
    });

    it('validateCapability does NOT require authentication', async () => {
      const { caller, db } = createCaller(null, mockDb);
      db.query.boards.findFirst.mockResolvedValue({
        id: VALID_BOARD_UUID,
        name: 'Test Board',
        mcu: 'STM32',
        architecture: 'arm',
        memoryFlash: 1024,
        memoryRam: 192,
        buildTarget: 'stm32f4_disco',
        peripherals: ['GPIO'],
      });
      await expect(caller.validateCapability({
        boardId: VALID_BOARD_UUID,
        assertion: { register: 'GPIOA_ODR' },
      })).resolves.toBeDefined();
    });
  });

  // ── Auth enforcement (create/update/delete) ────────────────────────

  describe('authentication for mutations', () => {
    it('create requires authentication', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.create(validBoardInput)).rejects.toThrow(TRPCError);
    });

    it('update requires authentication', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.update({ id: VALID_BOARD_UUID, name: 'Updated' })).rejects.toThrow(TRPCError);
    });

    it('delete requires authentication', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.delete({ id: VALID_BOARD_UUID })).rejects.toThrow(TRPCError);
    });
  });

  // ── Input validation ───────────────────────────────────────────────

  describe('input validation', () => {
    it('get validates UUID format', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.get({ id: 'not-uuid' })).rejects.toThrow();
    });

    it('getByTarget validates buildTarget is non-empty', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.getByTarget({ buildTarget: '' })).rejects.toThrow();
    });

    it('search validates query is non-empty', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.search({ query: '' })).rejects.toThrow();
    });

    it('validateCapability validates boardId UUID', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.validateCapability({
        boardId: 'bad',
        assertion: { register: 'GPIOA_ODR' },
      })).rejects.toThrow();
    });

    it('validateCapability validates assertion has register', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.validateCapability({
        boardId: VALID_BOARD_UUID,
        // @ts-expect-error - testing missing required field
        assertion: {},
      })).rejects.toThrow();
    });

    it('create validates name is required', async () => {
      const { caller } = createCaller(testUser, mockDb);
      const { name, ...noName } = validBoardInput;
      // @ts-expect-error - testing missing required field
      await expect(caller.create(noName)).rejects.toThrow();
    });

    it('create validates name min length', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.create({ ...validBoardInput, name: '' })).rejects.toThrow();
    });

    it('create validates name max length', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.create({ ...validBoardInput, name: 'x'.repeat(256) })).rejects.toThrow();
    });

    it('create validates mcu is non-empty', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.create({ ...validBoardInput, mcu: '' })).rejects.toThrow();
    });

    it('create validates architecture is non-empty', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.create({ ...validBoardInput, architecture: '' })).rejects.toThrow();
    });

    it('create validates memoryFlash is positive integer', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.create({ ...validBoardInput, memoryFlash: 0 })).rejects.toThrow();
      await expect(caller.create({ ...validBoardInput, memoryFlash: -1 })).rejects.toThrow();
    });

    it('create validates memoryRam is positive integer', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.create({ ...validBoardInput, memoryRam: 0 })).rejects.toThrow();
    });

    it('create validates buildTarget is non-empty', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.create({ ...validBoardInput, buildTarget: '' })).rejects.toThrow();
    });

    it('create validates peripherals is non-empty array', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.create({ ...validBoardInput, peripherals: [] })).rejects.toThrow();
    });

    it('create validates peripherals items are strings', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.create({
        ...validBoardInput,
        // @ts-expect-error - testing wrong type
        peripherals: [123],
      })).rejects.toThrow();
    });

    it('create accepts valid board input', async () => {
      const { caller, db } = createCaller(adminUser, mockDb);
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: VALID_BOARD_UUID, ...validBoardInput }]),
        }),
      });

      await expect(caller.create(validBoardInput)).resolves.toBeDefined();
    });

    it('create validates status enum when provided', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.create({
        ...validBoardInput,
        status: 'invalid' as any,
      })).rejects.toThrow();
    });

    it('create accepts valid status values', async () => {
      const { caller, db } = createCaller(adminUser, mockDb);
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: VALID_BOARD_UUID }]),
        }),
      });

      for (const status of ['active', 'deprecated', 'beta'] as const) {
        await expect(caller.create({
          ...validBoardInput,
          status,
        })).resolves.toBeDefined();
      }
    });
  });

  // ── Not found ──────────────────────────────────────────────────────

  describe('not found', () => {
    it('get throws for non-existent board', async () => {
      const { caller, db } = createCaller(null, mockDb);
      db.query.boards.findFirst.mockResolvedValue(null);

      await expect(caller.get({ id: VALID_BOARD_UUID })).rejects.toThrow('Board not found');
    });

    it('getByTarget throws for non-existent target', async () => {
      const { caller, db } = createCaller(null, mockDb);
      db.query.boards.findFirst.mockResolvedValue(null);

      await expect(caller.getByTarget({ buildTarget: 'nonexistent' })).rejects.toThrow('No board found');
    });

    it('validateCapability throws for non-existent board', async () => {
      const { caller, db } = createCaller(null, mockDb);
      db.query.boards.findFirst.mockResolvedValue(null);

      await expect(caller.validateCapability({
        boardId: VALID_BOARD_UUID,
        assertion: { register: 'GPIOA_ODR' },
      })).rejects.toThrow('Board not found');
    });
  });
});
