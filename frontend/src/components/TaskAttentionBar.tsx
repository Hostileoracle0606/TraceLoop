import { trpc } from '../lib/trpc';
import {
  formatStateLabel,
  capitalize,
  formatBudget,
  canStopTask,
  deriveActionRequired,
} from './task-attention-helpers';

export interface TaskAttention {
  state: string;
  iteration: number;
  maxIterations: number;
  profile: 'review' | 'guided' | 'autonomous';
  budget?: string;
  actionRequired?: {
    label: string;
    cta: {
      text: string;
      onClick: () => void;
    };
  };
  onStop: () => void;
}

/**
 * TaskAttentionBar - Persistent status bar showing live task state
 * 
 * Displays: `state · iteration x/y · profile · budget · Stop`
 * Or: `Patch ready · approval required · Review`
 * 
 * Data sourced from tasks.get + getActivityLog
 * Stop action calls tasks.stop
 * 
 * Mount across Agent/Build/Analysis/Patch screens.
 */
export function TaskAttentionBar({ taskId, onNavigate }: { taskId: string | null; onNavigate?: (view: string) => void }) {
  // Poll task data every 2 seconds
  const { data: task, isLoading } = trpc.tasks.get.useQuery(
    { id: taskId! },
    { 
      enabled: !!taskId,
      refetchInterval: 2000,
    }
  );

  // Load activity log for context
  const { data: activityLog } = trpc.tasks.getActivityLog.useQuery(
    { taskId: taskId! },
    { enabled: !!taskId }
  );

  // Stop mutation
  const stopMutation = trpc.tasks.stop.useMutation();

  // Check for proposed patches (approval required state)
  const { data: patches } = trpc.patches.listByTask.useQuery(
    { taskId: taskId! },
    { enabled: !!taskId }
  );

  const hasProposedPatch = patches && patches.length > 0 && patches.some(p => p.status === 'proposed');

  if (!taskId || isLoading || !task) {
    return null;
  }

  // Derive action required state
  const actionData = deriveActionRequired(task.status, !!hasProposedPatch);
  const actionRequired = actionData ? {
    label: actionData.label,
    cta: {
      text: actionData.ctaText,
      onClick: () => {
        if (onNavigate) {
          onNavigate(task.status === 'patching' ? 'patch' : 'agent');
        }
      },
    },
  } : undefined;

  const budgetDisplay = formatBudget(task.maxCostUsd);
  const canStop = canStopTask(task.status);
  const stateLabel = formatStateLabel(task.status);

  return (
    <div className="task-attention-bar" data-testid="task-attention-bar">
      <span className="task-attention-state" data-testid="task-state">
        {stateLabel}
      </span>
      <span className="task-attention-separator">·</span>
      <span className="task-attention-iteration" data-testid="task-iteration">
        Iteration {task.iteration}/{task.maxIterations}
      </span>
      <span className="task-attention-separator">·</span>
      <span className="task-attention-profile" data-testid="task-profile">
        {capitalize(task.permissionProfile)}
      </span>
      {budgetDisplay && (
        <>
          <span className="task-attention-separator">·</span>
          <span className="task-attention-budget" data-testid="task-budget">
            {budgetDisplay}
          </span>
        </>
      )}
      {actionRequired ? (
        <>
          <span className="task-attention-separator">·</span>
          <span className="task-attention-action-label" data-testid="task-action-label">
            {actionRequired.label}
          </span>
          <button
            className="task-attention-cta"
            onClick={actionRequired.cta.onClick}
            data-testid="task-action-cta"
          >
            {actionRequired.cta.text}
          </button>
        </>
      ) : (
        <>
          <span className="task-attention-separator">·</span>
          <span className="task-attention-status" data-testid="task-status">
            No action needed
          </span>
        </>
      )}
      {canStop && (
        <button
          className="task-attention-stop"
          onClick={() => stopMutation.mutate({ taskId })}
          disabled={stopMutation.isPending}
          data-testid="task-stop-button"
        >
          {stopMutation.isPending ? 'Stopping...' : 'Stop'}
        </button>
      )}
    </div>
  );
}
