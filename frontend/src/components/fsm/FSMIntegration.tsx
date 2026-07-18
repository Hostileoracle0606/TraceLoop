import React, { useState, useEffect } from 'react';
import { AgentState, StateTransition } from './types';
import { StateIndicator } from './StateIndicator';
import { StateProgressBar } from './StateProgressBar';
import { StateActionPanel } from './StateActionPanel';
import { StateTransitionTimeline } from './StateTransitionTimeline';

interface FSMIntegrationProps {
  taskId: string;
  initialStatus?: AgentState;
}

interface TaskData {
  id: string;
  status: AgentState;
  iteration: number;
  currentFiles?: Record<string, string>;
  activityLogs: StateTransition[];
}

export const FSMIntegration: React.FC<FSMIntegrationProps> = ({ 
  taskId,
  initialStatus = 'planning'
}) => {
  const [task, setTask] = useState<TaskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  // Fetch task data
  const fetchTask = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`http://localhost:3000/tasks.get`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: taskId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch task: ${response.statusText}`);
      }

      const data = await response.json();
      setTask({
        id: data.id,
        status: data.status as AgentState,
        iteration: data.iteration,
        currentFiles: data.currentFiles,
        activityLogs: data.activityLogs || [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // Transition task state
  const transitionState = async (toState: AgentState, reason: string) => {
    if (!task) return;

    try {
      setTransitioning(true);
      
      const response = await fetch(`http://localhost:3000/tasks.transition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskId: task.id,
          toState,
          reason,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to transition: ${response.statusText}`);
      }

      // Refresh task data
      await fetchTask();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transition failed');
    } finally {
      setTransitioning(false);
    }
  };

  // Stop task
  const stopTask = async () => {
    if (!task) return;

    try {
      setTransitioning(true);
      
      const response = await fetch(`http://localhost:3000/tasks.stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskId: task.id,
          reason: 'user-cancelled',
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to stop task: ${response.statusText}`);
      }

      // Refresh task data
      await fetchTask();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stop failed');
    } finally {
      setTransitioning(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchTask();
  }, [taskId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-400">Loading task state...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900 bg-opacity-20 border border-red-900 rounded-lg p-6">
        <div className="text-red-400 font-semibold mb-2">Error</div>
        <div className="text-red-300 text-sm">{error}</div>
        <button
          onClick={fetchTask}
          className="mt-4 px-4 py-2 bg-red-900 bg-opacity-30 hover:bg-opacity-50 text-red-400 rounded transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="bg-gray-900 rounded-lg p-6 text-center text-gray-400">
        Task not found
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress Bar */}
      <StateProgressBar 
        currentState={task.status}
        onStateClick={(state) => console.log('State clicked:', state)}
      />

      {/* Current State and Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Action Panel */}
        <StateActionPanel
          currentState={task.status}
          onTransition={transitionState}
          onStop={stopTask}
          disabled={transitioning}
        />

        {/* Right: Timeline */}
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <StateTransitionTimeline
            transitions={task.activityLogs}
            currentState={task.status}
          />
        </div>
      </div>

      {/* Task Info */}
      <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <span className="text-gray-400">Task ID:</span>
            <span className="font-mono text-white">{task.id}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-400">Iteration:</span>
            <span className="font-mono text-white">{task.iteration}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-400">Files:</span>
            <span className="font-mono text-white">
              {task.currentFiles ? Object.keys(task.currentFiles).length : 0}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
