import { describe, it, expect } from 'vitest';
import { deriveNotifications, type ActivityLogEntry } from './notifications';

describe('deriveNotifications', () => {
  it('returns empty array when no activity logs', () => {
    const result = deriveNotifications([]);
    expect(result).toEqual([]);
  });

  it('returns empty array for undefined/null input', () => {
    expect(deriveNotifications(undefined as any)).toEqual([]);
    expect(deriveNotifications(null as any)).toEqual([]);
  });

  it('groups activity logs by taskId', () => {
    const logs: ActivityLogEntry[] = [
      { id: '1', taskId: 'task-a', fromState: 'planning', toState: 'building', reason: 'plan-approved', actor: 'user', createdAt: new Date('2026-01-01') },
      { id: '2', taskId: 'task-b', fromState: 'planning', toState: 'building', reason: 'plan-approved', actor: 'user', createdAt: new Date('2026-01-01') },
    ];
    const result = deriveNotifications(logs);
    // Should produce at most one notification per task (the latest actionable one)
    const taskIds = result.map(n => n.taskId);
    expect(new Set(taskIds).size).toBe(result.length);
  });

  it('summarizes clarification-needed as "1 decision needed"', () => {
    const logs: ActivityLogEntry[] = [
      { id: '1', taskId: 'task-a', fromState: 'planning', toState: 'clarification-needed', reason: 'ambiguous-intent', actor: 'agent', createdAt: new Date('2026-01-01') },
    ];
    const result = deriveNotifications(logs);
    expect(result).toHaveLength(1);
    expect(result[0].summary).toBe('1 decision needed');
    expect(result[0].kind).toBe('decision');
    expect(result[0].taskId).toBe('task-a');
  });

  it('summarizes awaiting-approval patching as "1 decision needed"', () => {
    const logs: ActivityLogEntry[] = [
      { id: '1', taskId: 'task-a', fromState: 'analyzing', toState: 'patching', reason: 'awaiting-approval', actor: 'system', createdAt: new Date('2026-01-01') },
    ];
    const result = deriveNotifications(logs);
    expect(result).toHaveLength(1);
    expect(result[0].summary).toBe('1 decision needed');
    expect(result[0].kind).toBe('decision');
  });

  it('summarizes blocked state as "1 task blocked"', () => {
    const logs: ActivityLogEntry[] = [
      { id: '1', taskId: 'task-a', fromState: 'building', toState: 'blocked', reason: 'budget-exhausted', actor: 'system', createdAt: new Date('2026-01-01') },
    ];
    const result = deriveNotifications(logs);
    expect(result).toHaveLength(1);
    expect(result[0].summary).toBe('1 task blocked');
    expect(result[0].kind).toBe('blocked');
  });

  it('ignores non-actionable states (building, simulating, analyzing, completed, etc.)', () => {
    const logs: ActivityLogEntry[] = [
      { id: '1', taskId: 'task-a', fromState: 'editing', toState: 'building', reason: 'source-ready', actor: 'system', createdAt: new Date('2026-01-01') },
      { id: '2', taskId: 'task-a', fromState: 'building', toState: 'simulating', reason: 'build-succeeded', actor: 'system', createdAt: new Date('2026-01-02') },
      { id: '3', taskId: 'task-a', fromState: 'simulating', toState: 'analyzing', reason: 'sim-complete', actor: 'system', createdAt: new Date('2026-01-03') },
      { id: '4', taskId: 'task-a', fromState: 'analyzing', toState: 'completed', reason: 'tests-passed', actor: 'system', createdAt: new Date('2026-01-04') },
    ];
    const result = deriveNotifications(logs);
    expect(result).toEqual([]);
  });

  it('uses the latest actionable log entry per task', () => {
    const logs: ActivityLogEntry[] = [
      { id: '1', taskId: 'task-a', fromState: 'planning', toState: 'clarification-needed', reason: 'ambiguous-intent', actor: 'agent', createdAt: new Date('2026-01-01') },
      { id: '2', taskId: 'task-a', fromState: 'clarification-needed', toState: 'planning', reason: 'clarification-answered', actor: 'user', createdAt: new Date('2026-01-02') },
    ];
    const result = deriveNotifications(logs);
    // The latest state is 'planning' which is not actionable, so no notification
    expect(result).toEqual([]);
  });

  it('reports multiple tasks with decisions separately', () => {
    const logs: ActivityLogEntry[] = [
      { id: '1', taskId: 'task-a', fromState: 'analyzing', toState: 'patching', reason: 'awaiting-approval', actor: 'system', createdAt: new Date('2026-01-01') },
      { id: '2', taskId: 'task-b', fromState: 'planning', toState: 'clarification-needed', reason: 'ambiguous-intent', actor: 'agent', createdAt: new Date('2026-01-02') },
    ];
    const result = deriveNotifications(logs);
    expect(result).toHaveLength(2);
    // Notifications are sorted by timestamp descending, so task-b (later) comes first
    expect(result[0].taskId).toBe('task-b');
    expect(result[1].taskId).toBe('task-a');
  });

  it('includes the latest log timestamp for sorting', () => {
    const now = new Date('2026-07-19T00:00:00Z');
    const logs: ActivityLogEntry[] = [
      { id: '1', taskId: 'task-a', fromState: 'analyzing', toState: 'patching', reason: 'awaiting-approval', actor: 'system', createdAt: now },
    ];
    const result = deriveNotifications(logs);
    expect(result[0].timestamp).toEqual(now);
  });

  it('ignores stopped/completed terminal states', () => {
    const logs: ActivityLogEntry[] = [
      { id: '1', taskId: 'task-a', fromState: 'building', toState: 'stopped', reason: 'user-cancelled', actor: 'user', createdAt: new Date('2026-01-01') },
      { id: '2', taskId: 'task-b', fromState: 'analyzing', toState: 'completed', reason: 'tests-passed', actor: 'system', createdAt: new Date('2026-01-02') },
    ];
    const result = deriveNotifications(logs);
    expect(result).toEqual([]);
  });

  it('patching without awaiting-approval reason is not actionable', () => {
    const logs: ActivityLogEntry[] = [
      { id: '1', taskId: 'task-a', fromState: 'analyzing', toState: 'patching', reason: 'tests-failed', actor: 'system', createdAt: new Date('2026-01-01') },
    ];
    const result = deriveNotifications(logs);
    // patching with tests-failed is the agent working, not a user decision
    expect(result).toEqual([]);
  });
});
