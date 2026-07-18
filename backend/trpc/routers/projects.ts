import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { router, authenticatedProcedure } from '../context';
import { projects, boards } from '../../db/schema';

export const projectsRouter = router({
  // List all projects for the current user
  list: authenticatedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        boardId: projects.boardId,
        boardName: boards.name,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .leftJoin(boards, eq(projects.boardId, boards.id))
      .where(eq(projects.userId, ctx.user.id))
      .orderBy(desc(projects.updatedAt));
  }),

  // Get a single project by ID
  get: authenticatedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const result = await ctx.db
        .select({
          id: projects.id,
          name: projects.name,
          description: projects.description,
          boardId: projects.boardId,
          boardName: boards.name,
          createdAt: projects.createdAt,
          updatedAt: projects.updatedAt,
        })
        .from(projects)
        .leftJoin(boards, eq(projects.boardId, boards.id))
        .where(eq(projects.id, input.id))
        .limit(1);

      const project = result[0];
      if (!project) {
        throw new Error('Project not found');
      }

      // Ownership check
      const fullProject = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.id),
      });

      if (!fullProject || fullProject.userId !== ctx.user.id) {
        throw new Error('Access denied');
      }

      return project;
    }),

  // Create a new project
  create: authenticatedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      boardId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [project] = await ctx.db
        .insert(projects)
        .values({
          userId: ctx.user.id,
          name: input.name,
          description: input.description,
          boardId: input.boardId,
        })
        .returning();

      return project;
    }),

  // Update a project
  update: authenticatedProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      boardId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Ownership check
      const existing = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.id),
      });

      if (!existing || existing.userId !== ctx.user.id) {
        throw new Error('Access denied');
      }

      const { id, ...updates } = input;
      const [project] = await ctx.db
        .update(projects)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(projects.id, id))
        .returning();

      return project;
    }),

  // Delete a project
  delete: authenticatedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Ownership check
      const existing = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.id),
      });

      if (!existing || existing.userId !== ctx.user.id) {
        throw new Error('Access denied');
      }

      await ctx.db
        .delete(projects)
        .where(eq(projects.id, input.id));

      return { success: true };
    }),
});
