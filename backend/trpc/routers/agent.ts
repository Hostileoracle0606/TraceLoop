import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { router, authenticatedProcedure } from '../context';
import { tasks, projects, boards, activityLogs } from '../../db/schema';
import { sanitizePath } from '../middleware/validate';
import { applyFileOperationsWithRetry, type FileOperation } from '../../llm/apply-file-operations';
import { validatePlan, validateEditOperations, validatePatchProposal } from '../../llm/validate';
import { resolveAgentRuntime } from '../../agent/runtime-selection';

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

      const response = await resolveAgentRuntime(task).runStage({
        stage: 'clarify', taskId: task.id, intent: task.intent, files: task.currentFiles ?? {},
      });
      if (response.kind !== 'clarification') throw new Error(`Unexpected stage response: ${response.kind}`);
      const result = response.questions === null ? null : { questions: response.questions };
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

      const planResponse = await resolveAgentRuntime(task).runStage({
        stage: 'plan', taskId: task.id, intent: task.intent, files: task.currentFiles ?? {},
        board: { name: board.name, mcu: board.mcu, architecture: board.architecture },
        criteria: task.acceptanceCriteria,
      });
      if (planResponse.kind !== 'plan') throw new Error(`Unexpected stage response: ${planResponse.kind}`);
      const plan = planResponse.plan;

      // Persist plan advancement: transition planning → editing
      await ctx.db
        .update(tasks)
        .set({ status: 'editing', updatedAt: new Date() })
        .where(eq(tasks.id, input.taskId));

      await ctx.db.insert(activityLogs).values({
        taskId: input.taskId,
        fromState: 'planning',
        toState: 'editing',
        reason: 'plan-generated',
        actor: 'agent',
        iteration: task.iteration,
        metadata: { planSummary: plan.summary, stepCount: plan.steps.length },
      });

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

      // ADR-0007: Validate plan via centralized enforcement point
      const planValidation = validatePlan(input.plan);
      if (!planValidation.valid) {
        throw new Error(`Plan validation failed: ${planValidation.errors.map(e => e.message).join('; ')}`);
      }

      const editResponse = await resolveAgentRuntime(task).runStage({
        stage: 'edit', taskId: task.id, plan: input.plan, files: task.currentFiles ?? {},
      });
      if (editResponse.kind !== 'operations') throw new Error(`Unexpected stage response: ${editResponse.kind}`);
      const result = { operations: editResponse.operations, summary: editResponse.summary };

      // ADR-0007: Validate operations against plan scope, protected files, path traversal
      const planFiles = new Set(input.plan.steps.map(s => s.file));
      const opsValidation = validateEditOperations(result.operations, planFiles);
      if (!opsValidation.valid) {
        throw new Error(`Operation validation failed: ${opsValidation.errors.map(e => e.message).join('; ')}`);
      }

      // ADR-0007: Apply-or-reflect-and-retry cycle
      const currentFiles = task.currentFiles ?? {};
      const applyResult = applyFileOperationsWithRetry(currentFiles, result.operations as FileOperation[]);

      if (!applyResult.success) {
        // Return structured failure info for LLM retry feedback
        return {
          ...result,
          success: false,
          failures: applyResult.failures,
          retryHint: 'Operations could not be applied. Use the failures array to correct and retry.',
        };
      }

      const updatedFiles = applyResult.files!;

      await ctx.db
        .update(tasks)
        .set({ currentFiles: updatedFiles, updatedAt: new Date() })
        .where(eq(tasks.id, input.taskId));

      await ctx.db.insert(activityLogs).values({
        taskId: input.taskId,
        fromState: 'editing',
        toState: 'editing',
        reason: 'files-applied',
        actor: 'agent',
        iteration: task.iteration,
        metadata: { operationCount: result.operations.length, summary: result.summary },
      });

      return { ...result, success: true, appliedFiles: Object.keys(updatedFiles) };
    }),

  /**
   * E7: Single turn-path mutation for typed input.
   * Accepts user text, classifies intent, returns an honest reply from the agent.
   * Replaces the canned delayed response with a real backend call.
   */
  turn: authenticatedProcedure
    .input(z.object({
      taskId: z.string().uuid(),
      text: z.string().min(1, 'Turn text must not be empty'),
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

      // FSM state check: reject terminal states
      const terminalStates = ['completed', 'blocked', 'stopped'] as const;
      if ((terminalStates as readonly string[]).includes(task.status)) {
        throw new Error(
          `Cannot submit turn: task is in '${task.status}' state`
        );
      }

      const response = await resolveAgentRuntime(task).runStage({
        stage: 'turn',
        taskId: task.id,
        text: input.text,
        files: task.currentFiles ?? {},
        context: {
          taskStatus: task.status,
          iteration: task.iteration,
          permissionProfile: task.permissionProfile,
        },
      });
      if (response.kind !== 'turn') throw new Error(`Unexpected stage response: ${response.kind}`);
      return { reply: response.reply, action: response.action ?? null };
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

      // Validate root cause source path for traversal
      sanitizePath(input.rootCause.source, 'rootCause.source');

      const patchResponse = await resolveAgentRuntime(task).runStage({
        stage: 'propose-patch', taskId: task.id, rootCause: input.rootCause,
        files: task.currentFiles ?? {}, assertion: input.assertion,
      });
      if (patchResponse.kind !== 'patch') throw new Error(`Unexpected stage response: ${patchResponse.kind}`);
      const patch = patchResponse.patch;

      // ADR-0007: Validate patch proposal via centralized enforcement point
      const patchValidation = validatePatchProposal(patch);
      if (!patchValidation.valid) {
        throw new Error(`Patch validation failed: ${patchValidation.errors.map(e => e.message).join('; ')}`);
      }

      return patch;
    }),
});
