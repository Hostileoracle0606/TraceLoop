import { Inngest } from 'inngest';
import { getInngestConfig } from '../config';

// Inngest client for sending events and defining functions
export const inngest = new Inngest({
  id: 'traceloop',
  // Event key is only needed when sending events to Inngest Cloud
  eventKey: getInngestConfig().eventKey,
});

// Event type definitions for the firmware pipeline
export const Events = {
  TASK_BUILD_REQUESTED: 'task/build.requested',
  TASK_SIMULATE_REQUESTED: 'task/simulate.requested',
  TASK_ANALYZE_REQUESTED: 'task/analyze.requested',
  TASK_RUN_REQUESTED: 'task/run.requested',
  TASK_CANCELLED: 'task/cancelled',
} as const;

// Shared event data shapes
export interface TaskRunEventData {
  taskId: string;
  runId: string;
  userId: string;
  projectId: string;
  iteration: number;
  files: Record<string, string>;
  boardId: string;
  acceptanceCriteria: Array<{
    name: string;
    register: string;
    expect: string;
    byTime: number;
  }>;
}

export interface TaskCancelledEventData {
  taskId: string;
  runId: string;
  reason: string;
}
