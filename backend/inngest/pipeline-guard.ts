import type { PatchProposal } from '../llm/functions';
import { validatePatchProposal } from '../llm/validate';

export interface PipelineBudgetTask {
  iteration: number;
  maxIterations: number;
  maxTimeMs: number;
  maxCostUsd: number;
  startedAt: Date | string | null;
}

export type BudgetFailure = {
  kind: 'iterations' | 'time' | 'cost';
  reason: string;
};

/**
 * Resource values persisted by the database use cents for cost. Keeping this
 * check at the database boundary avoids the old cents/dollars ambiguity.
 */
export function checkPipelineBudget(
  task: PipelineBudgetTask,
  requestedIteration: number,
  accumulatedCostCents: number,
  nowMs = Date.now(),
): BudgetFailure | null {
  if (requestedIteration >= task.maxIterations) {
    return {
      kind: 'iterations',
      reason: `Iteration budget exhausted (${requestedIteration}/${task.maxIterations})`,
    };
  }

  if (task.startedAt) {
    const elapsedMs = nowMs - new Date(task.startedAt).getTime();
    if (elapsedMs >= task.maxTimeMs) {
      return {
        kind: 'time',
        reason: `Time budget exhausted (${elapsedMs}ms/${task.maxTimeMs}ms)`,
      };
    }
  }

  if (accumulatedCostCents >= task.maxCostUsd) {
    return {
      kind: 'cost',
      reason: `Cost budget exhausted (${accumulatedCostCents}¢/${task.maxCostUsd}¢)`,
    };
  }

  return null;
}

/**
 * Validate and apply a model-produced patch without permitting implicit file
 * creation, no-op edits, ambiguous replacements, or protected paths.
 */
export function materializePatch(
  files: Record<string, string>,
  proposal: PatchProposal,
): Record<string, string> {
  const validation = validatePatchProposal(proposal);
  if (!validation.valid) {
    throw new Error(`Patch validation failed: ${validation.errors.map((error) => error.message).join('; ')}`);
  }

  const source = files[proposal.file];
  if (source === undefined) {
    throw new Error(`Patch target does not exist: ${proposal.file}`);
  }
  if (!proposal.before) {
    throw new Error('Patch must identify a non-empty source fragment');
  }

  const occurrences = source.split(proposal.before).length - 1;
  if (occurrences === 0) {
    throw new Error(`Patch source fragment was not found in ${proposal.file}`);
  }
  if (occurrences > 1) {
    throw new Error(`Patch source fragment is ambiguous in ${proposal.file}`);
  }

  const updated = source.replace(proposal.before, proposal.after);
  if (updated === source) {
    throw new Error('Patch does not change the source');
  }

  return { ...files, [proposal.file]: updated };
}
