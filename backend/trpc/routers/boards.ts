import { z } from 'zod';
import { eq, ilike, or } from 'drizzle-orm';
import { router, procedure, authenticatedProcedure, adminProcedure } from '../context';
import { boards } from '../../db/schema';
import { validateAssertionForBoard, getBoardForTarget } from '../../../src/engine/board-capabilities';

const ledMappingSchema = z.object({
  name: z.string(),
  color: z.string(),
  gpioPort: z.string(),
  pin: z.number(),
});

const boardInputSchema = z.object({
  name: z.string().min(1).max(255),
  mcu: z.string().min(1),
  architecture: z.string().min(1),
  memoryFlash: z.number().int().positive(),
  memoryRam: z.number().int().positive(),
  platformFile: z.string().optional(),
  peripherals: z.array(z.string()).min(1),
  buildTarget: z.string().min(1),
  devicetreePath: z.string().optional(),
  ledMappings: z.array(ledMappingSchema).optional(),
  gpioPorts: z.array(z.string()).optional(),
  timerCount: z.number().int().optional(),
  hasBLE: z.boolean().optional(),
  hasWiFi: z.boolean().optional(),
  renodePlatformDescription: z.string().optional(),
  status: z.enum(['active', 'deprecated', 'beta']).optional(),
});

export const boardsRouter = router({
  /** List all boards (public — board library is shared knowledge). */
  list: procedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(boards)
      .orderBy(boards.name);
  }),

  /** Get a single board by ID. */
  get: procedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const board = await ctx.db.query.boards.findFirst({
        where: eq(boards.id, input.id),
      });
      if (!board) {
        throw new Error('Board not found');
      }
      return board;
    }),

  /** Look up a board by its Zephyr build target. */
  getByTarget: procedure
    .input(z.object({ buildTarget: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const board = await ctx.db.query.boards.findFirst({
        where: eq(boards.buildTarget, input.buildTarget),
      });
      if (!board) {
        throw new Error(`No board found with build target "${input.buildTarget}"`);
      }
      return board;
    }),

  /** Create a new board (admin only). */
  create: adminProcedure
    .input(boardInputSchema)
    .mutation(async ({ ctx, input }) => {
      const [board] = await ctx.db
        .insert(boards)
        .values(input)
        .returning();
      return board;
    }),

  /** Update a board (admin only, partial update). */
  update: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      ...boardInputSchema.partial().shape,
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const [board] = await ctx.db
        .update(boards)
        .set(updates)
        .where(eq(boards.id, id))
        .returning();
      if (!board) {
        throw new Error('Board not found');
      }
      return board;
    }),

  /** Delete a board (admin only). */
  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(boards)
        .where(eq(boards.id, input.id));
      return { success: true };
    }),

  /** Validate that an assertion is compatible with a board's capabilities. */
  validateCapability: procedure
    .input(z.object({
      boardId: z.string().uuid(),
      assertion: z.object({
        register: z.string(),
        pin: z.number().int().optional(),
      }),
    }))
    .query(async ({ ctx, input }) => {
      const board = await ctx.db.query.boards.findFirst({
        where: eq(boards.id, input.boardId),
      });
      if (!board) {
        throw new Error('Board not found');
      }

      // Build a BoardCapabilities from the DB row
      const capabilities = {
        name: board.name,
        mcu: board.mcu,
        architecture: board.architecture,
        memoryFlash: board.memoryFlash,
        memoryRam: board.memoryRam,
        buildTarget: board.buildTarget,
        peripherals: board.peripherals,
        gpioPorts: board.gpioPorts ?? [],
        timerCount: board.timerCount ?? 0,
        hasBLE: board.hasBLE ?? false,
        hasWiFi: board.hasWiFi ?? false,
        ledMappings: board.ledMappings ?? [],
        devicetreePath: board.devicetreePath ?? undefined,
        renodePlatformDescription: board.renodePlatformDescription ?? undefined,
        status: board.status ?? 'active',
      };

      return validateAssertionForBoard(input.assertion, capabilities);
    }),

  /** Search boards by name, MCU, or architecture. */
  search: procedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const pattern = `%${input.query}%`;
      return ctx.db
        .select()
        .from(boards)
        .where(or(
          ilike(boards.name, pattern),
          ilike(boards.mcu, pattern),
          ilike(boards.architecture, pattern),
        ))
        .limit(20);
    }),
});
