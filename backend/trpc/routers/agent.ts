import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { router, authenticatedProcedure } from '../context';
import { tasks, projects, boards } from '../../db/schema';
import { clarifyIntent, generatePlan, editSource, proposePatchLLM } from '../../llm/functions';

/**
 * Agent tRPC router.
 *
 * Exposes LLM functions as tRPC procedures. Each procedure:
 * 1. Validates the task is in the correct FSM state for the operation
 * 2. Checks project ownership
 * 3. Calls the corresponding LLM function
 * 4. Returns structured output
 */
export const agentRouter = router({
  /**
   * Clarification-needed state: examine intent and ask questions if ambiguous.
   */
  clarify: authenticatedProcedure
    .input(z.object({ taskId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.query.tasks.findFirst({
        where: eq(tasks.id, input.taskId),
      });
      if (!task) throw new Error('Task not found');

      // Ownership check
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, task.projectId),
      });
      if (!project || project.userId !== ctx.user.id) {
        throw new Error('Access denied');
      }

      // FSM state check
      if (task.status !== 'clarification-needed') {
        throw new Error(
          `Cannot clarify: task is in '${task.status}' state, expected 'clarification-needed'`
        );
      }

      const result = await clarifyIntent(task.intent, task.currentFiles ?? {});
      return result;
    }),

  /**
   * Planning state: generate a structured implementation plan.
   */
  plan: authenticatedProcedure
    .input(z.object({ taskId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.query.tasks.findFirst({
        where: eq(tasks.id, input.taskId),
      });
      if (!task) throw new Error('Task not found');

      // Ownership check
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, task.projectId),
      });
      if (!project || project.userId !== ctx.user.id) {
        throw new Error('Access denied');
      }

      // FSM state check
      if (task.status !== 'planning') {
        throw new Error(
          `Cannot plan: task is in '${task.status}' state, expected 'planning'`
        );
      }

      // Get board info
      const board = project.boardId
        ? await ctx.db.query.boards.findFirst({
            where: eq(boards.id, project.boardId),
          })
        : null;

      if (!board) {
        throw new Error('Project has no board assigned');
      }

      const plan = await generatePlan(
        task.intent,
        task.currentFiles ?? {},
        { name: board.name, mcu: board.mcu, architecture: board.architecture },
        task.acceptanceCriteria
      );

      return plan;
    }),

  /**
   * Editing state: execute an approved plan by modifying source files.
   */
  edit: authenticatedProcedure
    .input(z.object({
      taskId: z.string().uuid(),
      plan: z.object({
        steps: z.array(z.object({
          file: z.string(),
          action: z.enum(['create', 'modify', 'delete']),
          description: z.string(),
        })),
        summary: z.string(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.query.tasks.findFirst({
        where: eq(tasks.id, input.taskId),
      });
      if (!task) throw new Error('Task not found');

      // Ownership check
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, task.projectId),
      });
      if (!project || project.userId !== ctx.user.id) {
        throw new Error('Access denied');
      }

      // FSM state check
      if (task.status !== 'editing') {
        throw new Error(
          `Cannot edit: task is in '${task.status}' state, expected 'editing'`
        );
      }

      const result = await editSource(input.plan, task.currentFiles ?? {});

      // Update task files with the operations
      // In a full implementation, this would apply the file operations to the workspace
      // and update task.currentFiles. For now, return the operations for the client to handle.

      return result;
    }),

  /**
   * Patching state: propose a fix based on the causal engine's root cause.
   */
  patch: authenticatedProcedure
    .input(z.object({
      taskId: z.string().uuid(),
      rootCause: z.object({
        time: z.number(),
        type: z.string(),
        source: z.string(),
        register: z.string(),
        value: z.string(),
        detail: z.string(),
        label: z.string(),
        lane: z.string(),
      }),
      assertion: z.object({
        name: z.string(),
        register: z.string(),
        expect: z.string(),
        byTime: z.number(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.query.tasks.findFirst({
        where: eq(tasks.id, input.taskId),
      });
      if (!task) throw new Error('Task not found');

      // Ownership check
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, task.projectId),
      });
      if (!project || project.userId !== ctx.user.id) {
        throw new Error('Access denied');
      }

      // FSM state check
      if (task.status !== 'patching') {
        throw new Error(
          `Cannot patch: task is in '${task.status}' state, expected 'patching'`
        );
      }

      const patch = await proposePatchLLM(
        input.rootCause,
        task.currentFiles ?? {},
        input.assertion
      );

      return patch;
    }),
});
