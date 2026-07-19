import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateExecuteState,
  EXECUTABLE_STATES,
  ACTIVE_TASK_STATES,
  isActiveTask,
  centsToUsd,
  usdToCents,
} from './execute-helpers';
import type { TaskStatus } from '../../db/schema';

describe('validateExecuteState', () => {
  it('allows execution from planning state', () => {
    expect(() => validateExecuteState('planning')).not.toThrow();
  });

  it('allows execution from editing state', () => {
    expect(() => validateExecuteState('editing')).not.toThrow();
  });

  it('allows execution from blocked state', () => {
    expect(() => validateExecuteState('blocked')).not.toThrow();
  });

  it('throws from completed state', () => {
    expect(() => validateExecuteState('completed')).toThrow(/Cannot execute/);
  });

  it('throws from stopped state', () => {
    expect(() => validateExecuteState('stopped')).toThrow(/Cannot execute/);
  });

  it('throws from building state', () => {
    expect(() => validateExecuteState('building')).toThrow(/Cannot execute/);
  });

  it('throws from simulating state (pipeline active)', () => {
    expect(() => validateExecuteState('simulating')).toThrow(/Cannot execute/);
  });

  it('throws from analyzing state (pipeline active)', () => {
    expect(() => validateExecuteState('analyzing')).toThrow(/Cannot execute/);
  });

  it('throws from patching state (pipeline active)', () => {
    expect(() => validateExecuteState('patching')).toThrow(/Cannot execute/);
  });

  it('throws from rerunning state (pipeline active)', () => {
    expect(() => validateExecuteState('rerunning')).toThrow(/Cannot execute/);
  });

  it('error message lists the valid states', () => {
    try {
      validateExecuteState('completed');
      expect.fail('Should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('planning');
      expect((e as Error).message).toContain('editing');
      expect((e as Error).message).toContain('blocked');
    }
  });
});

describe('EXECUTABLE_STATES', () => {
  it('contains exactly planning, editing, blocked', () => {
    expect(EXECUTABLE_STATES).toEqual(['planning', 'editing', 'blocked']);
  });
});

describe('isActiveTask', () => {
  it('returns true for non-terminal states', () => {
    const activeStates: TaskStatus[] = [
      'clarification-needed',
      'planning',
      'editing',
      'building',
      'simulating',
      'analyzing',
      'patching',
      'rerunning',
    ];
    activeStates.forEach((status) => {
      expect(isActiveTask(status)).toBe(true);
    });
  });

  it('returns false for terminal states', () => {
    const terminalStates: TaskStatus[] = ['completed', 'blocked', 'stopped'];
    terminalStates.forEach((status) => {
      expect(isActiveTask(status)).toBe(false);
    });
  });
});

describe('ACTIVE_TASK_STATES', () => {
  it('contains exactly the non-terminal states', () => {
    expect(ACTIVE_TASK_STATES).toEqual([
      'clarification-needed',
      'planning',
      'editing',
      'building',
      'simulating',
      'analyzing',
      'patching',
      'rerunning',
    ]);
  });
});

describe('cost conversion (cents ↔ dollars)', () => {
  it('centsToUsd converts cents to dollars', () => {
    expect(centsToUsd(500)).toBe(5);
    expect(centsToUsd(100)).toBe(1);
    expect(centsToUsd(1)).toBe(0.01);
    expect(centsToUsd(0)).toBe(0);
  });

  it('usdToCents converts dollars to cents', () => {
    expect(usdToCents(5)).toBe(500);
    expect(usdToCents(1)).toBe(100);
    expect(usdToCents(0.01)).toBe(1);
    expect(usdToCents(0)).toBe(0);
  });

  it('round-trips without precision loss', () => {
    expect(usdToCents(centsToUsd(500))).toBe(500);
    expect(centsToUsd(usdToCents(3.5))).toBeCloseTo(3.5, 10);
  });
});
