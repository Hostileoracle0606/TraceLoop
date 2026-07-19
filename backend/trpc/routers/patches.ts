import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { router, authenticatedProcedure } from '../context';
import { patches, tasks, projects, runs, activityLogs } from '../../db/schema';
import { checkPermission } from '../../../src/engine/permissions';
import { inngest, Events, type TaskRunEventData } from '../../inngest/client';
import { buildResourceControls } from './execute-helpers';

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

      // C3: Atomic transaction — approve patch, update task, create run, enqueue rerun
      const result = await ctx.db.transaction(async (tx) => {
        const updatedRows = await tx
          .update(patches)
          .set({
            status: 'approved',
            approvedBy: ctx.user.id,
            approvedAt: new Date(),
          })
          .where(eq(patches.id, input.id))
          .returning();

        const updated = updatedRows[0];
        if (!updated) throw new Error('Failed to update patch');

        // Update task: set status to 'rerunning', apply patched files, increment iteration
        const nextIteration = task.iteration + 1;
        await tx
          .update(tasks)
          .set({
            status: 'rerunning',
            currentFiles: patch.filesAfterPatch,
            iteration: nextIteration,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, patch.taskId));

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

      // C3: Enqueue rerun (outside transaction — Inngest send is not transactional)
      // A6: pass resourceControls derived from task DB columns (cost cents→dollars)
      const eventData: TaskRunEventData = {
        taskId: task.id,
        runId: result.run.id,
        userId: ctx.user.id,
        projectId: task.projectId,
        iteration: result.nextIteration,
        files: patch.filesAfterPatch,
        boardId: project.boardId!,
        acceptanceCriteria: task.acceptanceCriteria,
        resourceControls: buildResourceControls(task),
      };

      await inngest.send({
        name: Events.TASK_RUN_REQUESTED,
        data: eventData,
      });

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
          .where(eq(patches.id, input.id))
          .returning();

        // C3: Set task status back to 'editing'
        await tx
          .update(tasks)
          .set({
            status: 'editing',
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, patch.taskId));

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
