import type { TaskStatus } from '../../db/schema';
import type { ResourceControls } from '../../../src/engine/permissions';

/**
 * States from which a user may manually trigger `tasks.execute`.
 * All other states (completed, stopped, building, simulating, analyzing,
 * patching, rerunning, clarification-needed) are rejected.
 */
export const EXECUTABLE_STATES: readonly TaskStatus[] = [
  'planning',
  'editing',
  'blocked',
];

/**
 * Guard: throw if the task status does not allow manual execution.
 * Called at the top of the `execute` mutation before any side effects.
 */
export function validateExecuteState(status: TaskStatus): void {
  if (!EXECUTABLE_STATES.includes(status)) {
    throw new Error(
      `Cannot execute from state '${status}'. Must be one of: ${EXECUTABLE_STATES.join(', ')}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Cost conversion: DB stores cents (integer), engine uses dollars (float).
// ---------------------------------------------------------------------------

/** Convert cents (integer, DB representation) to USD (float, engine). */
export function centsToUsd(cents: number): number {
  return cents / 100;
}

/** Convert USD (float, engine) to cents (integer, DB representation). */
export function usdToCents(usd: number): number {
  return Math.round(usd * 100);
}

// ---------------------------------------------------------------------------
// Resource controls builder: derive from task DB columns
// ---------------------------------------------------------------------------

/**
 * Build a ResourceControls object from the task's DB columns.
 * Converts cost from cents (DB) to dollars (engine).
 */
export function buildResourceControls(task: {
  maxIterations: number;
  maxTimeMs: number;
  maxCostUsd: number; // cents in DB
}): ResourceControls {
  return {
    maxIterations: task.maxIterations,
    maxTimeMs: task.maxTimeMs,
    maxCostUsd: centsToUsd(task.maxCostUsd),
  };
}
