/**
 * Format task status into human-readable label
 */
export function formatStateLabel(status: string): string {
  const labels: Record<string, string> = {
    'clarification-needed': 'Clarification needed',
    'planning': 'Planning',
    'editing': 'Editing',
    'building': 'Building',
    'simulating': 'Simulating',
    'analyzing': 'Analyzing trace',
    'patching': 'Patch ready',
    'rerunning': 'Rerunning',
    'completed': 'Completed',
    'blocked': 'Blocked',
    'stopped': 'Stopped',
  };
  return labels[status] || capitalize(status);
}

/**
 * Capitalize first letter
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Format budget from cents to dollars string
 */
export function formatBudget(maxCostUsd: number | undefined | null): string | undefined {
  if (!maxCostUsd) return undefined;
  return `$${(maxCostUsd / 100).toFixed(2)}`;
}

/**
 * Determine if a task status allows stopping
 */
export function canStopTask(status: string): boolean {
  return !['completed', 'stopped'].includes(status);
}

/**
 * Derive action-required state from task + patch data
 */
export function deriveActionRequired(
  taskStatus: string,
  hasProposedPatch: boolean,
): { label: string; ctaText: string } | undefined {
  if (taskStatus === 'patching' && hasProposedPatch) {
    return {
      label: 'Your approval is required',
      ctaText: 'Review patch',
    };
  }
  if (taskStatus === 'clarification-needed') {
    return {
      label: 'Agent needs clarification',
      ctaText: 'Provide input',
    };
  }
  return undefined;
}
