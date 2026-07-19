import { CircleAlert, Square } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import type { WorkspaceController } from './use-workspace-controller';

const terminalStates = new Set(['completed', 'blocked', 'stopped']);

export function TaskAttentionBar({ controller }: { controller: WorkspaceController }) {
  const task = controller.task;
  if (!task) return null;

  const needsApproval = task.status === 'patching' && controller.currentPatch?.status === 'proposed';
  return (
    <section className={`task-attention${needsApproval ? ' task-attention--action' : ''}`} aria-live="polite">
      <div>
        {needsApproval && <CircleAlert size={15} />}
        <strong>{needsApproval ? 'Patch ready · Your approval is required' : task.status.replaceAll('-', ' ')}</strong>
        <span>Iteration {Math.min(task.iteration + 1, task.maxIterations)}/{task.maxIterations}</span>
        <Badge tone="neutral">{task.permissionProfile}</Badge>
        <span>Budget ${(task.maxCostUsd / 100).toFixed(2)} · {Math.round(task.maxTimeMs / 60_000)} min</span>
      </div>
      {!terminalStates.has(task.status) && (
        <Button variant="ghost" size="sm" onClick={controller.stop} disabled={controller.stopPending}>
          <Square size={12} /> {controller.stopPending ? 'Stopping…' : 'Stop'}
        </Button>
      )}
    </section>
  );
}
