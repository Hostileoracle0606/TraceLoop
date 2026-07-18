import { inngest, Events, type TaskRunEventData } from './client';
import { modalClient } from '../modal-client';
import { uploadArtifact, getArtifactUrl } from '../storage';
import { createSupabaseAdminClient } from '../supabase';
import { db } from '../db';
import { runs, tasks, activityLogs } from '../db/schema';
import { eq } from 'drizzle-orm';

// Timeout constants (in milliseconds)
const BUILD_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const SIM_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const ANALYZE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

// Retry configuration
const MAX_RETRIES = 2;

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
  },
  async ({ event, step }) => {
    const data = event.data as TaskRunEventData;
    const startTime = Date.now();

    // ── Step 1: Build ──────────────────────────────────────────────
    const buildResult = await step.run('build-firmware', async () => {
      // Update run status to building
      await updateRunStatus(data.runId, 'building');

      const result = await modalClient.build({
        files: data.files,
        boardId: data.boardId,
      });

      // Upload build log to storage
      if (result.log) {
        await uploadArtifact(
          data.taskId,
          data.runId,
          'build.log',
          result.log,
          'text/plain'
        );
      }

      // Upload ELF binary if build succeeded
      if (result.success && result.elfPath) {
        await uploadArtifact(
          data.taskId,
          data.runId,
          'firmware.elf',
          result.elfPath,
          'application/octet-stream'
        );
      }

      return result;
    });

    if (!buildResult.success) {
      // Build failed — update run and task, then stop
      await step.run('handle-build-failure', async () => {
        await updateRunStatus(data.runId, 'failed');
        await updateTaskStatus(data.taskId, 'blocked');
        await logActivity(data.taskId, 'building', 'blocked', 'build-failed', data.iteration);
      });

      return {
        status: 'failed',
        stage: 'build',
        buildLog: buildResult.log,
        elapsedMs: Date.now() - startTime,
      };
    }

    // ── Step 2: Simulate ───────────────────────────────────────────
    const simResult = await step.run('simulate-firmware', async () => {
      await updateRunStatus(data.runId, 'simulating');
      await updateTaskStatus(data.taskId, 'simulating');

      const result = await modalClient.simulate({
        elfPath: buildResult.elfPath!,
        boardId: data.boardId,
        acceptanceCriteria: data.acceptanceCriteria,
        timeoutMs: SIM_TIMEOUT_MS,
      });

      // Upload trace log
      if (result.traceLog) {
        await uploadArtifact(
          data.taskId,
          data.runId,
          'trace.log',
          result.traceLog,
          'text/plain'
        );
      }

      return result;
    });

    // ── Step 3: Analyze ────────────────────────────────────────────
    const analyzeResult = await step.run('analyze-results', async () => {
      await updateRunStatus(data.runId, 'analyzing');
      await updateTaskStatus(data.taskId, 'analyzing');

      const result = await modalClient.analyze({
        traceLog: simResult.traceLog,
        acceptanceCriteria: data.acceptanceCriteria,
      });

      return result;
    });

    // ── Step 4: Finalize ───────────────────────────────────────────
    await step.run('finalize-run', async () => {
      const finalStatus = analyzeResult.status === 'passed' ? 'passed' : 'failed';
      const taskStatus = analyzeResult.status === 'passed' ? 'completed' : 'patching';

      // Update run with full results
      const supabase = createSupabaseAdminClient();
      const { error } = await supabase
        .from('runs')
        .update({
          status: finalStatus,
          build_ok: buildResult.success,
          build_log: buildResult.log,
          trace_log: simResult.traceLog,
          analysis_result: analyzeResult,
          elapsed_ms: Date.now() - startTime,
          analysis_completed_at: new Date().toISOString(),
        })
        .eq('id', data.runId);

      if (error) throw new Error(`Failed to update run: ${error.message}`);

      // Update task state
      await updateTaskStatus(data.taskId, taskStatus);
      await logActivity(
        data.taskId,
        'analyzing',
        taskStatus,
        analyzeResult.status === 'passed' ? 'all-criteria-met' : 'criteria-failed',
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
      await updateRunStatus(runId, 'error');
      await updateTaskStatus(taskId, 'stopped');
      await logActivity(taskId, 'building', 'stopped', 'user-cancelled', 0, { reason });
    });

    return { cancelled: true, runId };
  }
);

// ── Helper functions ───────────────────────────────────────────────

async function updateRunStatus(
  runId: string,
  status: 'building' | 'simulating' | 'analyzing' | 'passed' | 'failed' | 'error'
) {
  const supabase = createSupabaseAdminClient();
  const updateData: Record<string, unknown> = { status };

  if (status === 'building') updateData.build_started_at = new Date().toISOString();
  if (status === 'simulating') updateData.build_completed_at = new Date().toISOString();
  if (status === 'analyzing') updateData.sim_completed_at = new Date().toISOString();
  if (['passed', 'failed', 'error'].includes(status)) {
    updateData.analysis_completed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('runs')
    .update(updateData)
    .eq('id', runId);

  if (error) throw new Error(`Failed to update run status: ${error.message}`);
}

async function updateTaskStatus(
  taskId: string,
  status: string
) {
  const supabase = createSupabaseAdminClient();
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

// Export all functions for Inngest to serve
export const functions = [firmwareRunPipeline, cancelFirmwareRun];
