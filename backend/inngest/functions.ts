import { inngest, Events, type TaskRunEventData } from './client';
import { modalClient, resolveBoardSlug } from '../modal-client';
import { uploadArtifact } from '../storage';
import { db } from '../db';
import { runs, tasks, activityLogs, patches } from '../db/schema';
import { and, eq, ne, sql } from 'drizzle-orm';
import { parseRenodeLog } from '@engine/renode-parser';
import { analyze } from '@engine/analyze';
import type { TraceEvent, Assertion } from '@engine/types';
import type { RootCause } from '../llm/functions';
import { resolveAgentRuntime } from '../agent/runtime-selection';
import { checkPipelineBudget, materializePatch } from './pipeline-guard';

// Timeout constants (in milliseconds)
const BUILD_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const SIM_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const ANALYZE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

// Retry configuration
const MAX_RETRIES = 2;

// ── Failure type classification ──────────────────────────────────────────────

/** Distinct failure types for the firmware pipeline. */
export type FailureType =
  | 'infra-failure'       // Modal unreachable, timeout, network error
  | 'build-failure'       // west build failed (compiler error)
  | 'simulation-failure'  // Renode crashed, trace parse error
  | 'analysis-failure'    // engine threw exception
  | 'test-failure';       // assertion failed (expected, triggers authoring loop)

/** Classifies an error into a FailureType based on its message/context. */
export function classifyFailure(error: unknown, stage: 'firmware-job' | 'analyze-results'): FailureType {
  // F5: AgentProviderError is always infrastructure — never a firmware/build/criteria failure.
  // Use name check (not instanceof) to avoid importing from backend/agent/.
  if (error instanceof Error && error.name === 'AgentProviderError') {
    return 'infra-failure';
  }

  const message = error instanceof Error ? error.message : String(error);

  if (stage === 'firmware-job') {
    // Simulation errors: check BEFORE infra since "simulation timeout" should not match infra timeout
    if (
      /renode|simulation|trace parse|trace log/i.test(message)
    ) {
      return 'simulation-failure';
    }
    // Build errors: compiler errors, west build failures
    if (
      /build failed|compiler error|undefined reference|undeclared|syntax error|CMake Error|west build/i.test(message)
    ) {
      return 'build-failure';
    }
    // Network / infra errors
    if (
      /fetch failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|network|timeout|MODAL_ENDPOINT/i.test(message) ||
      /failed to|status [45]\d{2}/i.test(message)
    ) {
      return 'infra-failure';
    }
    // Default firmware-job failure to infra
    return 'infra-failure';
  }

  // analyze-results stage
  if (
    /parse|JSON|trace/i.test(message)
  ) {
    return 'simulation-failure'; // trace parse error originates from simulation output
  }
  return 'analysis-failure';
}

/** Extracts a stack trace string for infra failures. */
function getStackTrace(error: unknown): string | undefined {
  if (error instanceof Error && error.stack) {
    return error.stack;
  }
  return undefined;
}

/**
 * Main pipeline function: build → simulate → analyze
 * Triggered by task/run.requested event.
 * Uses Inngest's durable execution for automatic retries and state persistence.
 */
export const firmwareRunPipeline = inngest.createFunction(
  {
    id: 'firmware-run-pipeline',
    retries: MAX_RETRIES,
    triggers: [{ event: Events.TASK_RUN_REQUESTED }],
    cancelOn: [
      {
        event: Events.TASK_CANCELLED,
        if: 'async.data.taskId == event.data.taskId',
      },
    ],
  },
  async ({ event, step }) => {
    const data = event.data as TaskRunEventData;
    const startTime = Date.now();

    const authorization = await step.run('authorize-attempt', async () => {
      const task = await db.query.tasks.findFirst({ where: eq(tasks.id, data.taskId) });
      if (!task) throw new Error('Task not found');
      if (task.status === 'stopped') return { allowed: false as const, reason: 'task-stopped' };
      if (!['building', 'rerunning'].includes(task.status)) {
        return { allowed: false as const, reason: `task-not-runnable:${task.status}` };
      }
      if (task.iteration !== data.iteration) {
        return { allowed: false as const, reason: 'stale-iteration' };
      }

      const run = await db.query.runs.findFirst({ where: eq(runs.id, data.runId) });
      if (!run || run.taskId !== data.taskId || run.iteration !== data.iteration) {
        return { allowed: false as const, reason: 'invalid-run' };
      }

      const accumulatedCostCents = await getAccumulatedCostCents(data.taskId);
      const budget = checkPipelineBudget(task, data.iteration, accumulatedCostCents);
      if (budget) {
        await updateRun(data.runId, { status: 'failed', analysisCompletedAt: new Date() });
        await transitionTask(data.taskId, task.status, 'blocked', 'budget-exhausted', data.iteration, {
          budgetKind: budget.kind,
          budgetReason: budget.reason,
        });
        return { allowed: false as const, reason: budget.reason };
      }

      return { allowed: true as const };
    });

    if (!authorization.allowed) {
      return { status: 'skipped' as const, reason: authorization.reason, elapsedMs: Date.now() - startTime };
    }

    // ── Step 1: Firmware Job (build + simulate on Modal) ───────────
    let jobResult: Awaited<ReturnType<typeof modalClient.firmwareJob>>;
    try {
      jobResult = await step.run('firmware-job', async () => {
        await updateRunStatus(data.runId, 'building');
        const task = await db.query.tasks.findFirst({ where: eq(tasks.id, data.taskId) });
        if (!task) throw new Error('Task not found');
        if (task.status === 'rerunning') {
          await transitionTask(data.taskId, 'rerunning', 'building', 'rerun-started', data.iteration);
        }
        const boardSlug = await resolveBoardSlug(data.boardId);
        const result = await modalClient.firmwareJob({
          files: data.files,
          board: boardSlug,
        });
        // Upload build log
        if (result.build.log) {
          await uploadArtifact(data.taskId, data.runId, 'build.log', result.build.log, 'text/plain');
        }
        return result;
      });
    } catch (error) {
      const failureType = classifyFailure(error, 'firmware-job');
      const errorMessage = error instanceof Error ? error.message : String(error);

      await step.run('handle-firmware-job-error', async () => {
        await updateRunStatus(data.runId, 'failed');
        const task = await db.query.tasks.findFirst({ where: eq(tasks.id, data.taskId) });
        if (!task) throw new Error('Task not found');
        await transitionTask(data.taskId, task.status, 'blocked', failureType, data.iteration, {
          failureType,
          errorMessage,
          ...(failureType === 'infra-failure' ? { stackTrace: getStackTrace(error) } : {}),
        });
      });

      return {
        status: 'error' as const,
        failureType,
        errorMessage,
        stage: 'firmware-job',
        elapsedMs: Date.now() - startTime,
      };
    }

    // ── Handle build failure (authoring loop entry) ────────────────
    if (!jobResult.build.ok) {
      const buildFailure = await step.run('handle-build-failure', async () => {
        await updateRun(data.runId, {
          status: 'failed',
          buildOk: false,
          buildLog: jobResult.build.log,
          ...costUpdate(jobResult.usage?.costUsd),
          elapsedMs: Date.now() - startTime,
          analysisCompletedAt: new Date(),
        });
        const task = await db.query.tasks.findFirst({ where: eq(tasks.id, data.taskId) });
        if (!task) throw new Error('Task not found');
        const budget = checkPipelineBudget(
          task,
          data.iteration + 1,
          await getAccumulatedCostCents(data.taskId),
        );
        if (budget) {
          await transitionTask(data.taskId, task.status, 'blocked', 'budget-exhausted', data.iteration, {
            budgetKind: budget.kind,
            budgetReason: budget.reason,
            buildLog: jobResult.build.log,
          });
          return { blocked: true as const, reason: budget.reason };
        }

        const moved = await transitionTask(data.taskId, task.status, 'editing', 'build-failed', data.iteration, {
          buildLog: jobResult.build.log,
        });
        return { blocked: false as const, stopped: !moved };
      });

      if (buildFailure.blocked || buildFailure.stopped) {
        return {
          status: buildFailure.blocked ? 'blocked' as const : 'stopped' as const,
          stage: 'build',
          buildLog: jobResult.build.log,
          elapsedMs: Date.now() - startTime,
        };
      }

      let proposed: Awaited<ReturnType<typeof persistProposedPatch>>;
      try {
        proposed = await step.run('propose-build-repair', async () => {
          const task = await db.query.tasks.findFirst({ where: eq(tasks.id, data.taskId) });
          if (!task || task.status !== 'editing') throw new Error('Task is not available for build repair');
          const response = await resolveAgentRuntime(task).runStage({
            stage: 'repair-build',
            taskId: data.taskId,
            buildLog: jobResult.build.log,
            files: data.files,
          });
          if (response.kind !== 'patch') throw new Error(`Unexpected stage response: ${response.kind}`);
          return persistProposedPatch({
            taskId: data.taskId,
            runId: data.runId,
            iteration: data.iteration,
            fromState: 'editing',
            reason: 'build-repair-proposed',
            files: data.files,
            proposal: response.patch,
          });
        });
      } catch (error) {
        await step.run('handle-build-repair-error', async () => {
          await transitionTask(data.taskId, 'editing', 'blocked', 'agent-repair-failed', data.iteration, {
            error: error instanceof Error ? error.message : String(error),
          });
        });
        return { status: 'error' as const, stage: 'build-repair', errorMessage: error instanceof Error ? error.message : String(error), elapsedMs: Date.now() - startTime };
      }

      if (proposed.permissionProfile !== 'autonomous') {
        return { status: 'awaiting-approval' as const, stage: 'build', patchId: proposed.patchId, elapsedMs: Date.now() - startTime };
      }

      const rerunEvent = await step.run('apply-build-repair', () => approveAndPrepareRerun({
        patchId: proposed.patchId,
        taskId: data.taskId,
        currentIteration: data.iteration,
        userId: data.userId,
        projectId: data.projectId,
        boardId: data.boardId,
        acceptanceCriteria: data.acceptanceCriteria,
        actor: 'agent',
      }));
      await step.sendEvent('enqueue-build-repair-rerun', { name: Events.TASK_RUN_REQUESTED, data: rerunEvent });
      return { status: 'rerunning' as const, stage: 'build', patchId: proposed.patchId, elapsedMs: Date.now() - startTime };
    }

    // Upload trace log if present
    if (jobResult.trace?.log) {
      await step.run('upload-trace', async () => {
        await uploadArtifact(data.taskId, data.runId, 'trace.log', jobResult.trace!.log, 'text/plain');
      });
    }

    // ── Step 2: Analyze locally ────────────────────────────────────
    let analyzeResult: { status: 'passed' | 'failed'; rootCauseText?: string; rootCause?: TraceEvent; assertion?: Assertion };
    try {
      analyzeResult = await step.run('analyze-results', async () => {
        await updateRunStatus(data.runId, 'analyzing');
        const task = await db.query.tasks.findFirst({ where: eq(tasks.id, data.taskId) });
        if (!task) throw new Error('Task not found');
        if (task.status !== 'analyzing') {
          await transitionTask(data.taskId, task.status, 'analyzing', 'simulation-complete', data.iteration);
        }

        return analyzeTraceStep(
          jobResult.trace?.log ?? '',
          data.acceptanceCriteria,
        );
      });
    } catch (error) {
      const failureType = classifyFailure(error, 'analyze-results');
      const errorMessage = error instanceof Error ? error.message : String(error);

      await step.run('handle-analyze-error', async () => {
        await updateRunStatus(data.runId, 'failed');
        const task = await db.query.tasks.findFirst({ where: eq(tasks.id, data.taskId) });
        if (!task) throw new Error('Task not found');
        await transitionTask(data.taskId, task.status, 'blocked', failureType, data.iteration, {
          failureType,
          errorMessage,
          ...(failureType === 'infra-failure' ? { stackTrace: getStackTrace(error) } : {}),
        });
      });

      return {
        status: 'error' as const,
        failureType,
        errorMessage,
        stage: 'analyze-results',
        elapsedMs: Date.now() - startTime,
      };
    }

    // ── Handle test failure (authoring loop entry) ─────────────────
    if (analyzeResult.status === 'failed') {
      const failureGate = await step.run('record-test-failure', async () => {
        await updateRun(data.runId, {
          status: 'failed',
          buildOk: true,
          buildLog: jobResult.build.log,
          traceLog: jobResult.trace?.log ?? null,
          analysisResult: analyzeResult,
          ...costUpdate(jobResult.usage?.costUsd),
          elapsedMs: Date.now() - startTime,
          analysisCompletedAt: new Date(),
        });
        const task = await db.query.tasks.findFirst({ where: eq(tasks.id, data.taskId) });
        if (!task) throw new Error('Task not found');
        const budget = checkPipelineBudget(
          task,
          data.iteration + 1,
          await getAccumulatedCostCents(data.taskId),
        );
        if (budget) {
          await transitionTask(data.taskId, task.status, 'blocked', 'budget-exhausted', data.iteration, {
            budgetKind: budget.kind,
            budgetReason: budget.reason,
            rootCause: analyzeResult.rootCauseText,
          });
          return { blocked: true as const, reason: budget.reason };
        }
        return { blocked: false as const };
      });

      if (failureGate.blocked) {
        return { status: 'blocked' as const, stage: 'analysis', rootCause: analyzeResult.rootCauseText, elapsedMs: Date.now() - startTime };
      }

      let proposed: Awaited<ReturnType<typeof persistProposedPatch>> | null;
      try {
        proposed = await step.run('propose-patch', async () => {
          const task = await db.query.tasks.findFirst({ where: eq(tasks.id, data.taskId) });
          if (!task || task.status !== 'analyzing') throw new Error('Task is not available for patching');

          const rootCause = analyzeResult.rootCause;
          // The criterion that actually failed and produced rootCause — may not be
          // acceptanceCriteria[0] when earlier criteria passed and a later one didn't.
          const assertion = analyzeResult.assertion ?? data.acceptanceCriteria[0];

          if (rootCause && assertion) {
            const stageResponse = await resolveAgentRuntime(task).runStage({
              stage: 'propose-patch',
              taskId: data.taskId,
              rootCause: rootCause as unknown as RootCause,
              files: data.files,
              assertion,
            });
            if (stageResponse.kind !== 'patch') throw new Error(`Unexpected stage response: ${stageResponse.kind}`);
            return persistProposedPatch({
              taskId: data.taskId,
              runId: data.runId,
              iteration: data.iteration,
              fromState: 'analyzing',
              reason: 'criteria-failed',
              files: data.files,
              proposal: stageResponse.patch,
              metadata: { rootCause: analyzeResult.rootCauseText },
            });
          }

          await transitionTask(data.taskId, 'analyzing', 'blocked', 'no-progress', data.iteration);
          return null;
        });
      } catch (error) {
        await step.run('handle-patch-proposal-error', async () => {
          await transitionTask(data.taskId, 'analyzing', 'blocked', 'agent-repair-failed', data.iteration, {
            error: error instanceof Error ? error.message : String(error),
          });
        });
        return { status: 'error' as const, stage: 'patch-proposal', errorMessage: error instanceof Error ? error.message : String(error), elapsedMs: Date.now() - startTime };
      }

      if (!proposed) {
        return { status: 'blocked' as const, stage: 'analysis', rootCause: analyzeResult.rootCauseText, elapsedMs: Date.now() - startTime };
      }
      if (proposed.permissionProfile !== 'autonomous') {
        return { status: 'awaiting-approval' as const, stage: 'analysis', patchId: proposed.patchId, rootCause: analyzeResult.rootCauseText, elapsedMs: Date.now() - startTime };
      }

      const rerunEvent = await step.run('apply-causal-patch', () => approveAndPrepareRerun({
        patchId: proposed.patchId,
        taskId: data.taskId,
        currentIteration: data.iteration,
        userId: data.userId,
        projectId: data.projectId,
        boardId: data.boardId,
        acceptanceCriteria: data.acceptanceCriteria,
        actor: 'agent',
      }));
      await step.sendEvent('enqueue-causal-rerun', { name: Events.TASK_RUN_REQUESTED, data: rerunEvent });
      return { status: 'rerunning' as const, stage: 'analysis', patchId: proposed.patchId, rootCause: analyzeResult.rootCauseText, elapsedMs: Date.now() - startTime };
    }

    // ── Finalize (all criteria passed) ─────────────────────────────
    await step.run('finalize-run', async () => {
      await updateRun(data.runId, {
        status: 'passed',
        buildOk: jobResult.build.ok,
        buildLog: jobResult.build.log,
        traceLog: jobResult.trace?.log ?? null,
        analysisResult: analyzeResult,
        ...costUpdate(jobResult.usage?.costUsd),
        elapsedMs: Date.now() - startTime,
        analysisCompletedAt: new Date(),
      });
      await transitionTask(data.taskId, 'analyzing', 'completed', 'all-criteria-met', data.iteration, {
        rootCause: analyzeResult.rootCauseText,
      });
    });

    return {
      status: analyzeResult.status,
      elapsedMs: Date.now() - startTime,
      rootCause: analyzeResult.rootCauseText,
    };
  }
);

/**
 * Cancel a running task's pipeline.
 */
export const cancelFirmwareRun = inngest.createFunction(
  {
    id: 'cancel-firmware-run',
    triggers: [{ event: Events.TASK_CANCELLED }],
  },
  async ({ event, step }) => {
    const { taskId, runId, reason } = event.data;

    await step.run('mark-cancelled', async () => {
      await updateRunStatus(runId, 'cancelled');
      const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
      if (task && task.status !== 'stopped') {
        await transitionTask(taskId, task.status, 'stopped', 'user-cancelled', task.iteration, {
          reason: reason ?? 'user-cancelled',
          runId,
        });
      }
    });

    return { cancelled: true, runId, reason: reason ?? 'user-cancelled' };
  }
);

// ── Helper functions ───────────────────────────────────────────────

async function updateRunStatus(
  runId: string,
  status: 'building' | 'simulating' | 'analyzing' | 'passed' | 'failed' | 'error' | 'cancelled'
) {
  const updateData: Partial<typeof runs.$inferInsert> = { status };
  if (status === 'building') updateData.buildStartedAt = new Date();
  if (status === 'simulating') updateData.buildCompletedAt = new Date();
  if (status === 'analyzing') updateData.simCompletedAt = new Date();
  if (['passed', 'failed', 'error', 'cancelled'].includes(status)) updateData.analysisCompletedAt = new Date();
  await updateRun(runId, updateData);
}

async function updateRun(
  runId: string,
  values: Partial<typeof runs.$inferInsert>,
) {
  const predicate = values.status === 'cancelled'
    ? eq(runs.id, runId)
    : and(eq(runs.id, runId), ne(runs.status, 'cancelled'));
  const [updated] = await db.update(runs).set(values).where(predicate).returning();
  if (!updated) {
    const existing = await db.query.runs.findFirst({ where: eq(runs.id, runId) });
    if (existing?.status === 'cancelled') return existing;
    throw new Error('Run not found');
  }
  return updated;
}

async function transitionTask(
  taskId: string,
  fromState: string,
  toState: string,
  reason: string,
  iteration: number,
  metadata?: Record<string, unknown>,
) {
  if (fromState === 'stopped' && toState !== 'stopped') return false;
  return db.transaction(async (tx) => {
    const updateData: Partial<typeof tasks.$inferInsert> = { status: toState, updatedAt: new Date() };
    if (toState === 'completed' || toState === 'stopped') updateData.completedAt = new Date();
    const [updated] = await tx
      .update(tasks)
      .set(updateData)
      .where(and(eq(tasks.id, taskId), eq(tasks.status, fromState)))
      .returning();
    if (!updated) return false;
    await tx.insert(activityLogs).values({
      taskId,
      fromState,
      toState,
      reason,
      actor: 'system',
      iteration,
      metadata: metadata ?? {},
    });
    return true;
  });
}

async function getAccumulatedCostCents(taskId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${runs.costUsd}), 0)` })
    .from(runs)
    .where(eq(runs.taskId, taskId));
  return Number(row?.total ?? 0);
}

function costUpdate(costUsd: number | undefined): Pick<typeof runs.$inferInsert, 'costUsd'> | Record<string, never> {
  if (costUsd === undefined || !Number.isFinite(costUsd) || costUsd < 0) return {};
  return { costUsd: Math.round(costUsd * 100) };
}

async function persistProposedPatch(input: {
  taskId: string;
  runId: string;
  iteration: number;
  fromState: string;
  reason: string;
  files: Record<string, string>;
  proposal: { file: string; before: string; after: string; summary: string; confidence: number };
  metadata?: Record<string, unknown>;
}) {
  const filesAfterPatch = materializePatch(input.files, input.proposal);
  return db.transaction(async (tx) => {
    const task = await tx.query.tasks.findFirst({ where: eq(tasks.id, input.taskId) });
    if (!task || task.status !== input.fromState) throw new Error('Task state changed before patch proposal');

    const [patch] = await tx.insert(patches).values({
      taskId: input.taskId,
      runId: input.runId,
      file: input.proposal.file,
      before: input.proposal.before,
      after: input.proposal.after,
      summary: input.proposal.summary,
      filesAfterPatch,
      status: 'proposed',
    }).returning();
    if (!patch) throw new Error('Failed to persist patch');

    const [updatedTask] = await tx.update(tasks).set({
      status: 'patching',
      updatedAt: new Date(),
    }).where(and(eq(tasks.id, input.taskId), eq(tasks.status, input.fromState))).returning();
    if (!updatedTask) throw new Error('Task state changed before patch proposal');

    await tx.insert(activityLogs).values({
      taskId: input.taskId,
      fromState: input.fromState,
      toState: 'patching',
      reason: input.reason,
      actor: 'agent',
      iteration: input.iteration,
      metadata: { ...input.metadata, patchId: patch.id, confidence: input.proposal.confidence },
    });

    return { patchId: patch.id, permissionProfile: task.permissionProfile };
  });
}

async function approveAndPrepareRerun(input: {
  patchId: string;
  taskId: string;
  currentIteration: number;
  userId: string;
  projectId: string;
  boardId: string;
  acceptanceCriteria: TaskRunEventData['acceptanceCriteria'];
  actor: 'agent' | 'user';
}): Promise<TaskRunEventData> {
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, input.taskId) });
  const patch = await db.query.patches.findFirst({ where: eq(patches.id, input.patchId) });
  if (!task || !patch) throw new Error('Task or patch not found');
  if (task.status !== 'patching' || task.iteration !== input.currentIteration || patch.status !== 'proposed') {
    throw new Error('Patch can no longer be applied');
  }

  const nextIteration = input.currentIteration + 1;
  const budget = checkPipelineBudget(task, nextIteration, await getAccumulatedCostCents(input.taskId));
  if (budget) {
    await transitionTask(input.taskId, 'patching', 'blocked', 'budget-exhausted', input.currentIteration, {
      budgetKind: budget.kind,
      budgetReason: budget.reason,
    });
    throw new Error(budget.reason);
  }

  const result = await db.transaction(async (tx) => {
    const [approved] = await tx.update(patches).set({
      status: 'approved',
      approvedBy: input.actor === 'user' ? input.userId : null,
      approvedAt: new Date(),
    }).where(and(eq(patches.id, input.patchId), eq(patches.status, 'proposed'))).returning();
    if (!approved) throw new Error('Patch was already decided');

    const [run] = await tx.insert(runs).values({
      taskId: input.taskId,
      iteration: nextIteration,
      status: 'pending',
    }).returning();
    if (!run) throw new Error('Failed to create rerun');

    const [updatedTask] = await tx.update(tasks).set({
      currentFiles: patch.filesAfterPatch,
      status: 'rerunning',
      iteration: nextIteration,
      updatedAt: new Date(),
    }).where(and(
      eq(tasks.id, input.taskId),
      eq(tasks.status, 'patching'),
      eq(tasks.iteration, input.currentIteration),
    )).returning();
    if (!updatedTask) throw new Error('Task state changed before patch approval');

    await tx.insert(activityLogs).values({
      taskId: input.taskId,
      fromState: 'patching',
      toState: 'rerunning',
      reason: 'patch-approved',
      actor: input.actor,
      userId: input.actor === 'user' ? input.userId : null,
      iteration: input.currentIteration,
      metadata: { patchId: input.patchId, runId: run.id },
    });
    return run;
  });

  return {
    taskId: input.taskId,
    runId: result.id,
    userId: input.userId,
    projectId: input.projectId,
    iteration: nextIteration,
    files: patch.filesAfterPatch,
    boardId: input.boardId,
    acceptanceCriteria: input.acceptanceCriteria,
  };
}

// ── Pure analysis step (testable, no side effects) ─────────────────────

/**
 * Parse a raw Renode trace log and evaluate all acceptance criteria.
 * Extracted for testability — the pipeline step calls this directly.
 */
export function analyzeTraceStep(
  rawTraceLog: string,
  acceptanceCriteria: Array<{ name: string; register: string; expect: string; byTime: number }>,
): {
  status: 'passed' | 'failed';
  rootCauseText?: string;
  rootCause?: TraceEvent;
  chain?: unknown;
  /** The specific criterion that produced rootCause — NOT always acceptanceCriteria[0]. */
  assertion?: Assertion;
} {
  // Empty criteria ≠ passed — there's nothing to prove
  if (acceptanceCriteria.length === 0) {
    return { status: 'failed', rootCauseText: 'No acceptance criteria to prove' };
  }

  // Parse the raw Renode text log into normalized trace events
  const traceEvents = parseRenodeLog(rawTraceLog);

  // Evaluate ALL criteria — fail if ANY fails
  const results = acceptanceCriteria.map((c) => analyze(traceEvents, c as Assertion));
  const allPassed = results.every((r) => r.status === 'passed');

  if (allPassed) {
    return { status: 'passed', rootCauseText: results[0]?.rootCauseText };
  }

  // Return the first failure's root cause paired with the SAME criterion that
  // produced it. propose-patch sends rootCause + assertion to the LLM together,
  // so they must describe the same criterion (not acceptanceCriteria[0]).
  const firstFailIndex = results.findIndex((r) => r.status === 'failed');
  const firstFail = firstFailIndex === -1 ? undefined : results[firstFailIndex];
  return {
    status: 'failed',
    rootCause: firstFail?.rootCause,
    rootCauseText: firstFail?.rootCauseText,
    chain: firstFail?.chain,
    assertion:
      firstFailIndex === -1 ? undefined : (acceptanceCriteria[firstFailIndex] as Assertion),
  };
}

// Export all functions for Inngest to serve
export const functions = [firmwareRunPipeline, cancelFirmwareRun];
