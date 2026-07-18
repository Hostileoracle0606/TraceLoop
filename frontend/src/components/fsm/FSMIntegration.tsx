import React from 'react';
import { trpc } from '../../lib/trpc';

interface FSMIntegrationProps {
  taskId: string;
}

export const FSMIntegration: React.FC<FSMIntegrationProps> = ({ taskId }) => {
  // Fetch task data using tRPC
  const { data: task, isLoading, error, refetch } = trpc.tasks.get.useQuery(
    { id: taskId },
    { enabled: !!taskId, refetchInterval: 2000 } // Poll every 2s
  );

  // Fetch activity log separately
  const { data: activityLogs } = trpc.tasks.getActivityLog.useQuery(
    { taskId },
    { enabled: !!taskId, refetchInterval: 2000 }
  );

  // Mutations
  const stopMutation = trpc.tasks.stop.useMutation({
    onSuccess: () => refetch(),
  });

  const handleStop = () => {
    if (!task) return;
    stopMutation.mutate({
      taskId: task.id,
      reason: 'user-stopped',
    });
  };

  if (isLoading) {
    return (
      <div className="panel">
        <p>Loading task state...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel" style={{ borderColor: 'var(--color-red)' }}>
        <div style={{ color: 'var(--color-red)' }}>
          <strong>Error loading task</strong>
          <p>{error.message}</p>
          <button className="button button-secondary" onClick={() => refetch()} style={{ marginTop: '1rem' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="panel">
        <p>Task not found</p>
      </div>
    );
  }

  const stateLabels: Record<string, string> = {
    'clarification-needed': 'Clarification needed',
    'planning': 'Planning',
    'editing': 'Editing',
    'building': 'Building',
    'simulating': 'Simulating',
    'analyzing': 'Analyzing',
    'patching': 'Patching',
    'rerunning': 'Rerunning',
    'completed': 'Completed',
    'blocked': 'Blocked',
    'stopped': 'Stopped',
  };

  const stateTone = (status: string): 'neutral' | 'blue' | 'green' | 'amber' | 'red' => {
    if (status === 'completed') return 'green';
    if (status === 'blocked' || status === 'stopped') return 'red';
    if (status === 'clarification-needed') return 'amber';
    return 'blue';
  };

  const canStop = !['completed', 'stopped', 'blocked'].includes(task.status);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Current State */}
      <div className="panel">
        <header className="panel-head">
          <div>
            <span className="eyebrow">Current state</span>
            <h3>Agent FSM</h3>
          </div>
          <div className="panel-action">
            <span className={`badge badge-${stateTone(task.status)}`}>
              {stateLabels[task.status] || task.status}
            </span>
          </div>
        </header>
        <div style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ flex: 1 }}>
              <small style={{ color: 'var(--color-text-muted)' }}>Task ID</small>
              <div><code>{task.id}</code></div>
            </div>
            <div style={{ flex: 1 }}>
              <small style={{ color: 'var(--color-text-muted)' }}>Iteration</small>
              <div><strong>{task.iteration}</strong></div>
            </div>
            <div style={{ flex: 1 }}>
              <small style={{ color: 'var(--color-text-muted)' }}>Files</small>
              <div><strong>{task.currentFiles ? Object.keys(task.currentFiles).length : 0}</strong></div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
            {canStop && (
              <button
                className="button button-danger"
                onClick={handleStop}
                disabled={stopMutation.isPending}
              >
                {stopMutation.isPending ? 'Stopping...' : 'Stop agent'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Activity Timeline */}
      {activityLogs && activityLogs.length > 0 && (
        <div className="panel">
          <header className="panel-head">
            <h3>State history</h3>
          </header>
          <div style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {activityLogs.slice().reverse().map((log: any, idx: number) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem', borderRadius: '0.25rem', background: 'var(--color-panel-bg)' }}>
                  <div style={{ flex: '0 0 auto', width: '8rem' }}>
                    <small style={{ color: 'var(--color-text-muted)' }}>
                      {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : 'Recent'}
                    </small>
                  </div>
                  <div style={{ flex: 1 }}>
                    {log.fromState && (
                      <>
                        <span className={`badge badge-${stateTone(log.fromState)}`} style={{ fontSize: '0.75rem' }}>
                          {stateLabels[log.fromState] || log.fromState}
                        </span>
                        <span style={{ margin: '0 0.5rem' }}>→</span>
                      </>
                    )}
                    <span className={`badge badge-${stateTone(log.toState)}`}>
                      {stateLabels[log.toState] || log.toState}
                    </span>
                  </div>
                  <div style={{ flex: 2, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                    {log.reason}
                  </div>
                  <div style={{ flex: '0 0 auto' }}>
                    <small style={{ color: 'var(--color-text-muted)' }}>Iteration {log.iteration ?? '?'}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
