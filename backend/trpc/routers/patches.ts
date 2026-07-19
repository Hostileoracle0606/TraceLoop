import { z } from 'zod';
import { and, eq, desc, sql } from 'drizzle-orm';
import { router, authenticatedProcedure } from '../context';
import { patches, tasks, projects, runs, activityLogs } from '../../db/schema';
import { checkPermission } from '../../../src/engine/permissions';
import { inngest, Events, type TaskRunEventData } from '../../inngest/client';
import { checkPipelineBudget } from '../../inngest/pipeline-guard';

export const patchesRouter = router({
  // List patches for a task
  listByTask: authenticatedProcedure
    .input(z.object({ taskId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
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

      return ctx.db.query.patches.findMany({
        where: eq(patches.taskId, input.taskId),
        orderBy: [desc(patches.createdAt)],
      });
    }),

  // Get a single patch
  get: authenticatedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const patch = await ctx.db.query.patches.findFirst({
        where: eq(patches.id, input.id),
      });
      if (!patch) throw new Error('Patch not found');

      // Ownership check
      const task = await ctx.db.query.tasks.findFirst({
        where: eq(tasks.id, patch.taskId),
      });
      if (!task) throw new Error('Task not found');

      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, task.projectId),
      });
      if (!project || project.userId !== ctx.user.id) {
        throw new Error('Access denied');
      }

      return patch;
    }),

  // Propose a new patch (from agent)
  propose: authenticatedProcedure
    .input(z.object({
      taskId: z.string().uuid(),
      runId: z.string().uuid().optional(),
      file: z.string(),
      before: z.string(),
      after: z.string(),
      summary: z.string(),
      filesAfterPatch: z.record(z.string()),
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

      // Check if patch requires approval based on permission profile
      const permCheck = checkPermission(
        task.permissionProfile as 'review' | 'guided' | 'autonomous',
        'apply-patch'
      );

      const [patch] = await ctx.db
        .insert(patches)
        .values({
          taskId: input.taskId,
          runId: input.runId,
          file: input.file,
          before: input.before,
          after: input.after,
          summary: input.summary,
          filesAfterPatch: input.filesAfterPatch,
          status: 'proposed',
        })
        .returning();

      // Record activity log
      await ctx.db.insert(activityLogs).values({
        taskId: input.taskId,
        fromState: task.status,
        toState: 'patching',
        reason: 'tests-failed',
        actor: 'agent',
        iteration: task.iteration,
        metadata: {
          patchId: patch?.id,
          requiresApproval: !permCheck.allowed,
        },
      });

      return {
        patch,
        requiresApproval: !permCheck.allowed,
        approvalReason: !permCheck.allowed ? permCheck.reason : undefined,
      };
    }),

  // Approve a patch
  approve: authenticatedProcedure
    .input(z.object({
      id: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const patch = await ctx.db.query.patches.findFirst({
        where: eq(patches.id, input.id),
      });
      if (!patch) throw new Error('Patch not found');

      // Ownership check
      const task = await ctx.db.query.tasks.findFirst({
        where: eq(tasks.id, patch.taskId),
      });
      if (!task) throw new Error('Task not found');

      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, task.projectId),
      });
      if (!project || project.userId !== ctx.user.id) {
        throw new Error('Access denied');
      }

      // Can only approve proposed patches
      if (patch.status !== 'proposed') {
        throw new Error(`Cannot approve patch in ${patch.status} state`);
      }
      if (task.status !== 'patching') {
        throw new Error(`Cannot approve patch while task is in ${task.status} state`);
      }
      if (!project.boardId) throw new Error('Project has no board assigned');

      const [costRow] = await ctx.db
        .select({ total: sql<number>`coalesce(sum(${runs.costUsd}), 0)` })
        .from(runs)
        .where(eq(runs.taskId, task.id));
      const nextIteration = task.iteration + 1;
      const budget = checkPipelineBudget(task, nextIteration, Number(costRow?.total ?? 0));
      if (budget) {
        await ctx.db.transaction(async (tx) => {
          const [blocked] = await tx.update(tasks).set({ status: 'blocked', updatedAt: new Date() })
            .where(and(eq(tasks.id, task.id), eq(tasks.status, 'patching'))).returning();
          if (blocked) {
            await tx.insert(activityLogs).values({
              taskId: task.id,
              fromState: 'patching',
              toState: 'blocked',
              reason: 'budget-exhausted',
              actor: 'system',
              iteration: task.iteration,
              metadata: { budgetKind: budget.kind, budgetReason: budget.reason },
            });
          }
        });
        throw new Error(budget.reason);
      }

      // Atomic local state change. The external dispatch is handled immediately
      // afterwards and has an explicit blocked recovery state on failure.
      const result = await ctx.db.transaction(async (tx) => {
        const updatedRows = await tx
          .update(patches)
          .set({
            status: 'approved',
            approvedBy: ctx.user.id,
            approvedAt: new Date(),
          })
          .where(and(eq(patches.id, input.id), eq(patches.status, 'proposed')))
          .returning();

        const updated = updatedRows[0];
        if (!updated) throw new Error('Failed to update patch');

        // Update task: set status to 'rerunning', apply patched files, increment iteration
        const updatedTasks = await tx
          .update(tasks)
          .set({
            status: 'rerunning',
            currentFiles: patch.filesAfterPatch,
            iteration: nextIteration,
            updatedAt: new Date(),
          })
          .where(and(
            eq(tasks.id, patch.taskId),
            eq(tasks.status, 'patching'),
            eq(tasks.iteration, task.iteration),
          ))
          .returning();
        if (!updatedTasks[0]) throw new Error('Task state changed before patch approval');

        // C3: Create a new run for the rerun
        const runInsert = await tx
          .insert(runs)
          .values({
            taskId: task.id,
            iteration: nextIteration,
            status: 'pending',
            buildStartedAt: new Date(),
          })
          .returning();

        const run = runInsert[0];
        if (!run) throw new Error('Failed to create run');

        // Record activity log
        await tx.insert(activityLogs).values({
          taskId: patch.taskId,
          fromState: 'patching',
          toState: 'rerunning',
          reason: 'patch-approved',
          actor: 'user',
          userId: ctx.user.id,
          iteration: task.iteration,
          metadata: { patchId: patch.id, runId: run.id },
        });

        return { updated, run, nextIteration };
      });

      const eventData: TaskRunEventData = {
        taskId: task.id,
        runId: result.run.id,
        userId: ctx.user.id,
        projectId: task.projectId,
        iteration: result.nextIteration,
        files: patch.filesAfterPatch,
        boardId: project.boardId,
        acceptanceCriteria: task.acceptanceCriteria,
      };

      try {
        await inngest.send({
          name: Events.TASK_RUN_REQUESTED,
          data: eventData,
        });
      } catch (error) {
        await ctx.db.transaction(async (tx) => {
          await tx.update(runs).set({ status: 'error', analysisCompletedAt: new Date() })
            .where(eq(runs.id, result.run.id));
          const [blocked] = await tx.update(tasks).set({ status: 'blocked', updatedAt: new Date() })
            .where(and(
              eq(tasks.id, task.id),
              eq(tasks.status, 'rerunning'),
              eq(tasks.iteration, result.nextIteration),
            )).returning();
          if (blocked) {
            await tx.insert(activityLogs).values({
              taskId: task.id,
              fromState: 'rerunning',
              toState: 'blocked',
              reason: 'rerun-dispatch-failed',
              actor: 'system',
              iteration: result.nextIteration,
              metadata: {
                patchId: patch.id,
                runId: result.run.id,
                error: error instanceof Error ? error.message : String(error),
              },
            });
          }
        });
        throw new Error('Patch was applied, but the rerun could not be dispatched. The task is blocked and can be retried safely.');
      }

      return result.updated;
    }),

  // Reject a patch
  reject: authenticatedProcedure
    .input(z.object({
      id: z.string().uuid(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const patch = await ctx.db.query.patches.findFirst({
        where: eq(patches.id, input.id),
      });
      if (!patch) throw new Error('Patch not found');

      // Ownership check
      const task = await ctx.db.query.tasks.findFirst({
        where: eq(tasks.id, patch.taskId),
      });
      if (!task) throw new Error('Task not found');

      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, task.projectId),
      });
      if (!project || project.userId !== ctx.user.id) {
        throw new Error('Access denied');
      }

      // Can only reject proposed patches
      if (patch.status !== 'proposed') {
        throw new Error(`Cannot reject patch in ${patch.status} state`);
      }

      // C3: Atomic transaction — reject patch, set task back to editing
      const updated = await ctx.db.transaction(async (tx) => {
        const [rejected] = await tx
          .update(patches)
          .set({
            status: 'rejected',
            rejectionReason: input.reason,
          })
          .where(and(eq(patches.id, input.id), eq(patches.status, 'proposed')))
          .returning();
        if (!rejected) throw new Error('Patch was already decided');

        // C3: Set task status back to 'editing'
        const [updatedTask] = await tx
          .update(tasks)
          .set({
            status: 'editing',
            updatedAt: new Date(),
          })
          .where(and(eq(tasks.id, patch.taskId), eq(tasks.status, 'patching')))
          .returning();
        if (!updatedTask) throw new Error('Task state changed before patch rejection');

        // Record activity log
        await tx.insert(activityLogs).values({
          taskId: patch.taskId,
          fromState: 'patching',
          toState: 'editing',
          reason: 'patch-rejected',
          actor: 'user',
          userId: ctx.user.id,
          iteration: task.iteration,
          metadata: { patchId: patch.id, reason: input.reason },
        });

        return rejected;
      });

      return updated;
    }),
});
