import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { router, authenticatedProcedure } from '../context';
import { runs, tasks, projects } from '../../db/schema';

export const runsRouter = router({
  // List runs for a task
  listByTask: authenticatedProcedure
    .input(z.object({ taskId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Ownership check via task -> project
      const task = await ctx.db.query.tasks.findFirst({
        where: eq(tasks.id, input.taskId),
      });

      if (!task) throw new Error('Task not found');

      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, task.projectId),
      });

      if (!project || project.userId !== ctx.user.id) {
        throw new Error('Access denied');
      }

      return ctx.db.query.runs.findMany({
        where: eq(runs.taskId, input.taskId),
        orderBy: [desc(runs.iteration)],
      });
    }),

  // Get a single run
  get: authenticatedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const run = await ctx.db.query.runs.findFirst({
        where: eq(runs.id, input.id),
      });

      if (!run) throw new Error('Run not found');

      // Ownership check
      const task = await ctx.db.query.tasks.findFirst({
        where: eq(tasks.id, run.taskId),
      });
      if (!task) throw new Error('Task not found');

      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, task.projectId),
      });
      if (!project || project.userId !== ctx.user.id) {
        throw new Error('Access denied');
      }

      return run;
    }),

  // Create a new run (starts build+sim cycle)
  create: authenticatedProcedure
    .input(z.object({
      taskId: z.string().uuid(),
      iteration: z.number().int(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Ownership check
      const task = await ctx.db.query.tasks.findFirst({
        where: eq(tasks.id, input.taskId),
      });
      if (!task) throw new Error('Task not found');

      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, task.projectId),
      });
      if (!project || project.userId !== ctx.user.id) {
        throw new Error('Access denied');
      }

      const [run] = await ctx.db
        .insert(runs)
        .values({
          taskId: input.taskId,
          iteration: input.iteration,
          status: 'pending',
          buildStartedAt: new Date(),
        })
        .returning();

      return run;
    }),

});
