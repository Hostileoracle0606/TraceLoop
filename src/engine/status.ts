/**
 * D2: Unified run status enum
 * Single source of truth for run status values used by both frontend and backend.
 * Eliminates the 'pass'/'fail' vs 'passed'/'failed' mismatch.
 */

export type RunStatus = 
  | 'pending'
  | 'building'
  | 'simulating'
  | 'analyzing'
  | 'passed'
  | 'failed'
  | 'error'
  | 'cancelled';

/** Check if a run status indicates completion (terminal state) */
export function isTerminalStatus(status: RunStatus): boolean {
  return ['passed', 'failed', 'error', 'cancelled'].includes(status);
}

/** Check if a run status indicates success */
export function isSuccessStatus(status: RunStatus): boolean {
  return status === 'passed';
}

/** Check if a run status indicates failure */
export function isFailureStatus(status: RunStatus): boolean {
  return status === 'failed';
}

/** Check if a run is still in progress */
export function isInProgressStatus(status: RunStatus): boolean {
  return ['pending', 'building', 'simulating', 'analyzing'].includes(status);
}
