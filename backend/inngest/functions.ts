import { inngest, Events, type TaskRunEventData } from './client';
import { modalClient, resolveBoardSlug } from '../modal-client';
import { uploadArtifact } from '../storage';
import { createSupabaseAdminClient } from '../supabase';
import { db } from '../db';
import { runs, tasks, activityLogs, patches } from '../db/schema';
import { eq } from 'drizzle-orm';
import { parseRenodeLog } from '@engine/renode-parser';
import { analyze } from '@engine/analyze';
import type { TraceEvent, Assertion } from '@engine/types';
import type { RootCause } from '../llm/functions';
import { resolveAgentRuntime } from '../agent/runtime-selection';

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

    // ── Step 1: Firmware Job (build + simulate on Modal) ───────────
    let jobResult: Awaited<ReturnType<typeof modalClient.firmwareJob>>;
    try {
      jobResult = await step.run('firmware-job', async () => {
        await updateRunStatus(data.runId, 'building');
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
        await updateTaskStatus(data.taskId, 'blocked');
        await logActivity(data.taskId, 'building', 'blocked', failureType, data.iteration, {
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
      await step.run('handle-build-failure', async () => {
        await updateRunStatus(data.runId, 'failed');

        const task = await db.query.tasks.findFirst({ where: eq(tasks.id, data.taskId) });
        if (!task) throw new Error('Task not found');

        // Log the failure
        await logActivity(data.taskId, 'building', 'patching', 'build-failed', data.iteration, { buildLog: jobResult.build.log });

        // Update task to patching state (not terminal blocked)
        await updateTaskStatus(data.taskId, 'patching');
      });

      return { status: 'build-failed', stage: 'build', buildLog: jobResult.build.log, elapsedMs: Date.now() - startTime };
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
        await updateTaskStatus(data.taskId, 'analyzing');

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
        await updateTaskStatus(data.taskId, 'blocked');
        await logActivity(data.taskId, 'analyzing', 'blocked', failureType, data.iteration, {
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
      await step.run('propose-patch', async () => {
        const task = await db.query.tasks.findFirst({ where: eq(tasks.id, data.taskId) });
        if (!task) throw new Error('Task not found');

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
          const patchProposal = stageResponse.patch;

          // Persist patch
          const [patch] = await db.insert(patches).values({
            taskId: data.taskId,
            runId: data.runId,
            file: patchProposal.file,
            before: patchProposal.before,
            after: patchProposal.after,
            summary: patchProposal.summary,
            filesAfterPatch: { ...data.files, [patchProposal.file]: data.files[patchProposal.file]?.replace(patchProposal.before, patchProposal.after) ?? patchProposal.after },
            status: 'proposed',
          }).returning();

          await updateTaskStatus(data.taskId, 'patching');
          await logActivity(data.taskId, 'analyzing', 'patching', 'criteria-failed', data.iteration, { patchId: patch?.id, rootCause: analyzeResult.rootCauseText });

          // Auto-apply in autonomous mode
          if (task.permissionProfile === 'autonomous' && patch) {
            await db.update(patches).set({ status: 'approved', approvedAt: new Date() }).where(eq(patches.id, patch.id));

            await db.update(tasks).set({
              currentFiles: patch.filesAfterPatch,
              status: 'rerunning',
              iteration: task.iteration + 1,
              updatedAt: new Date(),
            }).where(eq(tasks.id, data.taskId));

            await inngest.send({
              name: Events.TASK_RUN_REQUESTED,
              data: { ...data, iteration: data.iteration + 1, files: patch.filesAfterPatch },
            });
          }
        } else {
          // No root cause or assertion — can't patch
          await updateTaskStatus(data.taskId, 'blocked');
          await logActivity(data.taskId, 'analyzing', 'blocked', 'no-progress', data.iteration);
        }
      });

      return { status: 'failed', stage: 'analysis', rootCause: analyzeResult.rootCauseText, elapsedMs: Date.now() - startTime };
    }

    // ── Finalize (all criteria passed) ─────────────────────────────
    await step.run('finalize-run', async () => {
      const supabase = createSupabaseAdminClient();
      const { error } = await supabase
        .from('runs')
        .update({
          status: 'passed',
          build_ok: jobResult.build.ok,
          build_log: jobResult.build.log,
          trace_log: jobResult.trace?.log ?? null,
          analysis_result: analyzeResult,
          elapsed_ms: Date.now() - startTime,
          analysis_completed_at: new Date().toISOString(),
        })
        .eq('id', data.runId);

      if (error) throw new Error(`Failed to update run: ${error.message}`);

      await updateTaskStatus(data.taskId, 'completed');
      await logActivity(
        data.taskId,
        'analyzing',
        'completed',
        'all-criteria-met',
        data.iteration,
        { rootCause: analyzeResult.rootCauseText }
      );
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
      // Mark run as 'cancelled' (not 'error') — cancellation is intentional
      await updateRunStatus(runId, 'cancelled');
      await updateTaskStatus(taskId, 'stopped');
      await logActivity(taskId, 'building', 'stopped', 'user-cancelled', 0, {
        reason: reason ?? 'user-cancelled',
        cancellationMetadata: {
          cancelledAt: new Date().toISOString(),
          reason: reason ?? 'user-cancelled',
          runId,
          taskId,
        },
      });
    });

    return { cancelled: true, runId, reason: reason ?? 'user-cancelled' };
  }
);

// ── Helper functions ───────────────────────────────────────────────

export async function updateRunStatus(
  runId: string,
  status: 'building' | 'simulating' | 'analyzing' | 'passed' | 'failed' | 'error' | 'cancelled'
) {
  const supabase = createSupabaseAdminClient();
  
  // C2: Guard — don't update if task has been stopped
  const { data: run, error: fetchError } = await supabase
    .from('runs')
    .select('task_id')
    .eq('id', runId)
    .single();
  
  if (fetchError || !run) {
    throw new Error(`Failed to fetch run: ${fetchError?.message}`);
  }
  
  const { data: task } = await supabase
    .from('tasks')
    .select('status')
    .eq('id', run.task_id)
    .single();
  
  if (task?.status === 'stopped') {
    // Task was cancelled — skip status update
    return;
  }
  
  const updateData: Record<string, unknown> = { status };

  if (status === 'building') updateData.build_started_at = new Date().toISOString();
  if (status === 'simulating') updateData.build_completed_at = new Date().toISOString();
  if (status === 'analyzing') updateData.sim_completed_at = new Date().toISOString();
  if (['passed', 'failed', 'error', 'cancelled'].includes(status)) {
    updateData.analysis_completed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('runs')
    .update(updateData)
    .eq('id', runId);

  if (error) throw new Error(`Failed to update run status: ${error.message}`);
}

export async function updateTaskStatus(
  taskId: string,
  status: string
) {
  const supabase = createSupabaseAdminClient();
  
  // C2: Guard — don't overwrite 'stopped' status (task was cancelled)
  const { data: currentTask } = await supabase
    .from('tasks')
    .select('status')
    .eq('id', taskId)
    .single();
  
  if (currentTask?.status === 'stopped' && status !== 'stopped') {
    // Task was cancelled — don't overwrite
    return;
  }
  
  const updateData: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'completed' || status === 'stopped') {
    updateData.completed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('tasks')
    .update(updateData)
    .eq('id', taskId);

  if (error) throw new Error(`Failed to update task status: ${error.message}`);
}

async function logActivity(
  taskId: string,
  fromState: string,
  toState: string,
  reason: string,
  iteration: number,
  metadata?: Record<string, unknown>
) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from('activity_logs')
    .insert({
      task_id: taskId,
      from_state: fromState,
      to_state: toState,
      reason,
      actor: 'system',
      iteration,
      metadata: metadata ?? {},
    });

  if (error) throw new Error(`Failed to log activity: ${error.message}`);
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
