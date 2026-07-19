import { z } from 'zod';
import { eq, desc, and, sql } from 'drizzle-orm';
import { router, authenticatedProcedure } from '../context';
import { tasks, projects, runs, boards, activityLogs, type TaskStatus, type PermissionProfile } from '../../db/schema';
import { canTransition, type AgentState } from '../../../src/engine/agent-state';
import { inngest, Events, type TaskRunEventData } from '../../inngest/client';
import { validateFirmwareFilesInput, validateFileSizeLimits } from '../middleware/validate';
import { resolveRuntimeForNewTask } from '../../agent/runtime-selection';
import { validateExecuteState, buildResourceControls, isActiveTask } from './execute-helpers';
import { checkPipelineBudget } from '../../inngest/pipeline-guard';

// Zod schemas for task data
const acceptanceCriteriaSchema = z.array(z.object({
  name: z.string(),
  register: z.string(),
  expect: z.string(),
  byTime: z.number(),
})).min(1, 'At least one acceptance criterion is required');

const taskStatusSchema = z.enum([
  'clarification-needed',
  'planning',
  'editing',
  'building',
  'simulating',
  'analyzing',
  'patching',
  'rerunning',
  'completed',
  'blocked',
  'stopped',
]);

const permissionProfileSchema = z.enum(['review', 'guided', 'autonomous']);

export const tasksRouter = router({
  // List tasks for a project
  listByProject: authenticatedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Verify project ownership
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.projectId),
      });

      if (!project || project.userId !== ctx.user.id) {
        throw new Error('Access denied');
      }

      return ctx.db.query.tasks.findMany({
        where: eq(tasks.projectId, input.projectId),
        orderBy: [desc(tasks.createdAt)],
      });
    }),

  // Get the current user's most recent active (non-terminal) task
  getActive: authenticatedProcedure
    .query(async ({ ctx }) => {
      const userTasks = await ctx.db.query.tasks.findMany({
        where: eq(tasks.userId, ctx.user.id),
        orderBy: [desc(tasks.updatedAt)],
        with: {
          runs: {
            orderBy: [desc(runs.iteration)],
          },
        },
      });

      const activeTask = userTasks.find((task) => isActiveTask(task.status as TaskStatus));
      return activeTask ?? null;
    }),

  // Get a single task
  get: authenticatedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const task = await ctx.db.query.tasks.findFirst({
        where: eq(tasks.id, input.id),
        with: {
          runs: {
            orderBy: [desc(runs.iteration)],
          },
        },
      });

      if (!task) {
        throw new Error('Task not found');
      }

      // Ownership check via project
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, task.projectId),
      });

      if (!project || project.userId !== ctx.user.id) {
        throw new Error('Access denied');
      }

      return task;
    }),

  // Create a new task (starts the authoring loop)
  create: authenticatedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      intent: z.string().min(1),
      acceptanceCriteria: acceptanceCriteriaSchema,
      permissionProfile: permissionProfileSchema.default('guided'),
      maxIterations: z.number().int().min(1).max(20).default(5),
      maxTimeMs: z.number().int().min(60000).max(3600000).default(1800000),
      maxCostUsd: z.number().int().min(100).max(10000).default(500),
      initialFiles: z.record(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify project ownership
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.projectId),
      });

      if (!project || project.userId !== ctx.user.id) {
        throw new Error('Access denied');
      }

      // Validate initial firmware files if provided
      if (input.initialFiles && Object.keys(input.initialFiles).length > 0) {
        validateFirmwareFilesInput(input.initialFiles);
        validateFileSizeLimits(input.initialFiles);
      }

      // Create the task
      const [task] = await ctx.db
        .insert(tasks)
        .values({
          projectId: input.projectId,
          userId: ctx.user.id,
          intent: input.intent,
          acceptanceCriteria: input.acceptanceCriteria,
          permissionProfile: input.permissionProfile,
          agentRuntime: resolveRuntimeForNewTask(project.agentRuntimeDefault),
          maxIterations: input.maxIterations,
          maxTimeMs: input.maxTimeMs,
          maxCostUsd: input.maxCostUsd,
          currentFiles: input.initialFiles,
          status: 'planning',
          iteration: 0,
          startedAt: new Date(),
        })
        .returning();

      if (!task) {
        throw new Error('Failed to create task');
      }

      // Record initial activity log
      await ctx.db.insert(activityLogs).values({
        taskId: task.id,
        fromState: null,
        toState: 'planning',
        reason: 'intent-received',
        actor: 'user',
        userId: ctx.user.id,
        iteration: 0,
        metadata: { intent: input.intent },
      });

      return task;
    }),

  // Transition task state (explicit FSM control)
  transition: authenticatedProcedure
    .input(z.object({
      taskId: z.string().uuid(),
      toState: taskStatusSchema,
      reason: z.string(),
      files: z.record(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.query.tasks.findFirst({
        where: eq(tasks.id, input.taskId),
      });

      if (!task) {
        throw new Error('Task not found');
      }

      // Ownership check
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, task.projectId),
      });

      if (!project || project.userId !== ctx.user.id) {
        throw new Error('Access denied');
      }

      // Validate state transition using the FSM
      const fromState = task.status as AgentState;
      const toState = input.toState as AgentState;

      if (!canTransition(fromState, toState)) {
        throw new Error(`Invalid state transition: ${fromState} → ${toState}`);
      }

      // Perform the transition
      const updateData: Record<string, unknown> = {
        status: toState,
        updatedAt: new Date(),
      };

      if (toState === 'completed' || toState === 'stopped') {
        updateData.completedAt = new Date();
      }

      if (input.files) {
        updateData.currentFiles = input.files;
      }

      const [updatedTask] = await ctx.db
        .update(tasks)
        .set(updateData)
        .where(eq(tasks.id, input.taskId))
        .returning();

      // Record activity log
      await ctx.db.insert(activityLogs).values({
        taskId: input.taskId,
        fromState: fromState,
        toState: toState,
        reason: input.reason,
        actor: 'user',
        userId: ctx.user.id,
        iteration: task.iteration,
      });

      return updatedTask;
    }),

  // Increment iteration counter
  incrementIteration: authenticatedProcedure
    .input(z.object({ taskId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.query.tasks.findFirst({
        where: eq(tasks.id, input.taskId),
      });

      if (!task) {
        throw new Error('Task not found');
      }

      // Ownership check
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, task.projectId),
      });

      if (!project || project.userId !== ctx.user.id) {
        throw new Error('Access denied');
      }

      const [updatedTask] = await ctx.db
        .update(tasks)
        .set({
          iteration: task.iteration + 1,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, input.taskId))
        .returning();

      return updatedTask;
    }),

  // Get activity log for a task
  getActivityLog: authenticatedProcedure
    .input(z.object({ taskId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const task = await ctx.db.query.tasks.findFirst({
        where: eq(tasks.id, input.taskId),
      });

      if (!task) {
        throw new Error('Task not found');
      }

      // Ownership check
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, task.projectId),
      });

      if (!project || project.userId !== ctx.user.id) {
        throw new Error('Access denied');
      }

      return ctx.db.query.activityLogs.findMany({
        where: eq(activityLogs.taskId, input.taskId),
        orderBy: [activityLogs.createdAt],
      });
    }),

  // Execute the build-simulate-analyze pipeline for a task
  execute: authenticatedProcedure
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

      // A6: FSM state guard — only allow execution from planning/editing/blocked
      validateExecuteState(task.status as import('../../db/schema').TaskStatus);

      // C1: Concurrent run guard — prevent multiple runs for same task+iteration
      const activeRun = await ctx.db.query.runs.findFirst({
        where: and(
          eq(runs.taskId, task.id),
          eq(runs.iteration, task.iteration),
        ),
      });
      if (activeRun && !['passed', 'failed', 'error', 'cancelled'].includes(activeRun.status)) {
        throw new Error(`Run already in progress for iteration ${task.iteration}`);
      }

      const [costRow] = await ctx.db
        .select({ total: sql<number>`coalesce(sum(${runs.costUsd}), 0)` })
        .from(runs)
        .where(eq(runs.taskId, task.id));
      const budget = checkPipelineBudget(task, task.iteration, Number(costRow?.total ?? 0));
      if (budget) throw new Error(budget.reason);

      // Task must have files
      if (!task.currentFiles || Object.keys(task.currentFiles).length === 0) {
        throw new Error('Task has no source files to build');
      }

      // Validate firmware files before execution
      validateFirmwareFilesInput(task.currentFiles);
      validateFileSizeLimits(task.currentFiles);

      if (!project.boardId) {
        throw new Error('Project has no board assigned');
      }

      // Create a new run
      const [run] = await ctx.db
        .insert(runs)
        .values({
          taskId: task.id,
          iteration: task.iteration,
          status: 'pending',
          buildStartedAt: new Date(),
        })
        .returning();

      if (!run) throw new Error('Failed to create run');

      // C1: Atomic compare-and-set for status transition
      // Only transition if task is still in a valid state (prevents race conditions)
      const [updatedTask] = await ctx.db
        .update(tasks)
        .set({ status: 'building', updatedAt: new Date() })
        .where(
          and(
            eq(tasks.id, task.id),
            // Ensure status hasn't changed since we checked
            eq(tasks.status, task.status)
          )
        )
        .returning();

      if (!updatedTask) {
        // Status changed concurrently — rollback the run
        await ctx.db.delete(runs).where(eq(runs.id, run.id));
        throw new Error('Task state changed concurrently. Please retry.');
      }

      // Log activity
      await ctx.db.insert(activityLogs).values({
        taskId: task.id,
        fromState: task.status,
        toState: 'building',
        reason: 'execution-requested',
        actor: 'system',
        iteration: task.iteration,
      });

      // Send Inngest event to trigger the pipeline
      // A6: pass resourceControls derived from task DB columns (cost cents→dollars)
      const resourceControls = buildResourceControls(task);
      const eventData: TaskRunEventData = {
        taskId: task.id,
        runId: run.id,
        userId: ctx.user.id,
        projectId: task.projectId,
        iteration: task.iteration,
        files: task.currentFiles,
        boardId: project.boardId,
        acceptanceCriteria: task.acceptanceCriteria,
        resourceControls,
      };

      try {
        await inngest.send({
          name: Events.TASK_RUN_REQUESTED,
          data: eventData,
        });
      } catch (error) {
        await ctx.db.transaction(async (tx) => {
          await tx.update(runs).set({ status: 'error', analysisCompletedAt: new Date() })
            .where(eq(runs.id, run.id));
          const [blocked] = await tx.update(tasks).set({ status: 'blocked', updatedAt: new Date() })
            .where(and(eq(tasks.id, task.id), eq(tasks.status, 'building'))).returning();
          if (blocked) {
            await tx.insert(activityLogs).values({
              taskId: task.id,
              fromState: 'building',
              toState: 'blocked',
              reason: 'run-dispatch-failed',
              actor: 'system',
              iteration: task.iteration,
              metadata: { runId: run.id, error: error instanceof Error ? error.message : String(error) },
            });
          }
        });
        throw new Error('Run could not be dispatched. The task is blocked and can be retried safely.');
      }

      return { runId: run.id, taskId: task.id };
    }),

  // Stop/cancel a task
  stop: authenticatedProcedure
    .input(z.object({ 
      taskId: z.string().uuid(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.query.tasks.findFirst({
        where: eq(tasks.id, input.taskId),
      });

      if (!task) {
        throw new Error('Task not found');
      }

      // Ownership check
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, task.projectId),
      });

      if (!project || project.userId !== ctx.user.id) {
        throw new Error('Access denied');
      }

      // Can only stop non-terminal tasks
      if (task.status === 'completed' || task.status === 'stopped') {
        throw new Error(`Cannot stop task in ${task.status} state`);
      }

      const [updatedTask] = await ctx.db
        .update(tasks)
        .set({
          status: 'stopped',
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, input.taskId))
        .returning();

      // Record activity log
      await ctx.db.insert(activityLogs).values({
        taskId: input.taskId,
        fromState: task.status,
        toState: 'stopped',
        reason: 'user-cancelled',
        actor: 'user',
        userId: ctx.user.id,
        iteration: task.iteration,
        metadata: { reason: input.reason },
      });

      // Look up the latest run for this task to get the runId
      const latestRun = await ctx.db.query.runs.findFirst({
        where: eq(runs.taskId, input.taskId),
        orderBy: [desc(runs.createdAt)],
      });

      // Send TASK_CANCELLED event to Inngest if there's an active run
      if (latestRun && !['passed', 'failed', 'error', 'cancelled'].includes(latestRun.status)) {
        await inngest.send({
          name: Events.TASK_CANCELLED,
          data: {
            taskId: input.taskId,
            runId: latestRun.id,
            reason: input.reason ?? 'user-cancelled',
          },
        });
      }

      return updatedTask;
    }),
});
