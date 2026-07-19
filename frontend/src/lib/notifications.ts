import type { ActivityLog } from '../../../backend/db/schema';

export type ActivityLogEntry = Pick<
  ActivityLog,
  'id' | 'taskId' | 'fromState' | 'toState' | 'reason' | 'actor' | 'createdAt'
>;

export type NotificationKind = 'decision' | 'blocked' | 'error' | 'info';

export interface Notification {
  taskId: string;
  summary: string;
  detail: string;
  kind: NotificationKind;
  timestamp: Date;
}

/**
 * Derive actionable notifications from a task's activity log.
 *
 * Rules (from productization Task D3):
 * - Group by taskId.
 * - Only surface actionable states that require the user to decide or intervene:
 *   - clarification-needed => "1 decision needed"
 *   - patching with reason awaiting-approval => "1 decision needed"
 *   - blocked => "1 task blocked"
 * - Ignore running/transient states (building, simulating, analyzing, rerunning) and terminal states.
 * - Use the latest relevant log entry per task.
 */
export function deriveNotifications(logs: ActivityLogEntry[] | null | undefined): Notification[] {
  if (!logs || logs.length === 0) return [];

  const latestByTask = new Map<string, ActivityLogEntry>();

  for (const log of logs) {
    if (!log.taskId) continue;
    const existing = latestByTask.get(log.taskId);
    if (!existing || new Date(log.createdAt) > new Date(existing.createdAt)) {
      latestByTask.set(log.taskId, log);
    }
  }

  const notifications: Notification[] = [];

  for (const [taskId, log] of latestByTask) {
    const toState = log.toState;

    if (toState === 'clarification-needed') {
      notifications.push({
        taskId,
        summary: '1 decision needed',
        detail: 'Agent needs clarification before continuing',
        kind: 'decision',
        timestamp: new Date(log.createdAt),
      });
    } else if (toState === 'patching' && log.reason === 'awaiting-approval') {
      notifications.push({
        taskId,
        summary: '1 decision needed',
        detail: 'Review the proposed patch to continue',
        kind: 'decision',
        timestamp: new Date(log.createdAt),
      });
    } else if (toState === 'blocked') {
      notifications.push({
        taskId,
        summary: '1 task blocked',
        detail: 'Task stopped because budget or safety limits were reached',
        kind: 'blocked',
        timestamp: new Date(log.createdAt),
      });
    }
  }

  return notifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

/**
 * Format a notification count for compact UI display (e.g. nav badge).
 */
export function notificationCount(notifications: Notification[]): number {
  return notifications.length;
}
