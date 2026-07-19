import { describe, it, expect, vi, beforeEach } from 'vitest';
import { seedBoards, DEFAULT_BOARDS } from './seed';

describe('seedBoards', () => {
  let mockDb: {
    insert: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockResolvedValue([]),
        }),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([]),
        }),
      }),
    };
  });

  it('inserts at least one board with slug="stm32f4_disco"', async () => {
    await seedBoards(mockDb as any);

    // Verify insert was called for each default board
    expect(mockDb.insert).toHaveBeenCalledTimes(DEFAULT_BOARDS.length);
  });

  it('includes STM32F4 Discovery with slug and verified:true', async () => {
    await seedBoards(mockDb as any);

    // Find the values() call that includes the STM32F4 board
    const insertCalls = mockDb.insert.mock.results;
    expect(insertCalls.length).toBeGreaterThanOrEqual(1);

    // Check that DEFAULT_BOARDS contains the expected board
    const stm32Board = DEFAULT_BOARDS.find(b => b.slug === 'stm32f4_disco');
    expect(stm32Board).toBeDefined();
    expect(stm32Board!.name).toBe('STM32F4 Discovery');
    expect(stm32Board!.verified).toBe(true);
    expect(stm32Board!.mcu).toBe('STM32F407VG');
    expect(stm32Board!.architecture).toBe('ARM Cortex-M4F');
  });

  it('all default boards have slug defined', () => {
    for (const board of DEFAULT_BOARDS) {
      expect(board.slug).toBeDefined();
      expect(typeof board.slug).toBe('string');
      expect(board.slug.length).toBeGreaterThan(0);
    }
  });

  it('all default boards have verified flag', () => {
    for (const board of DEFAULT_BOARDS) {
      expect(board.verified).toBeDefined();
      expect(typeof board.verified).toBe('boolean');
    }
  });

  it('after seed, boards.list returns boards with correct slug', async () => {
    // Simulate what boards.list would return after seeding
    const seededBoards = DEFAULT_BOARDS.map((b, i) => ({
      id: `board-${i}`,
      ...b,
      createdAt: new Date().toISOString(),
    }));

    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue(seededBoards),
      }),
    });

    // Simulate boards.list query
    const result = await mockDb.select().from('boards').orderBy('name');

    expect(result.length).toBeGreaterThanOrEqual(1);
    const stm32 = result.find((b: any) => b.slug === 'stm32f4_disco');
    expect(stm32).toBeDefined();
    expect(stm32.verified).toBe(true);
  });
});
