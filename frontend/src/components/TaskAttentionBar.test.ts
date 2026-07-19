import { describe, it, expect } from 'vitest';
import {
  formatStateLabel,
  capitalize,
  formatBudget,
  canStopTask,
  deriveActionRequired,
} from './task-attention-helpers';

describe('TaskAttentionBar helpers', () => {
  describe('formatStateLabel', () => {
    it('returns "Analyzing trace" for analyzing state', () => {
      expect(formatStateLabel('analyzing')).toBe('Analyzing trace');
    });

    it('returns "Patch ready" for patching state', () => {
      expect(formatStateLabel('patching')).toBe('Patch ready');
    });

    it('returns "Clarification needed" for clarification-needed state', () => {
      expect(formatStateLabel('clarification-needed')).toBe('Clarification needed');
    });

    it('returns correct labels for all known states', () => {
      expect(formatStateLabel('planning')).toBe('Planning');
      expect(formatStateLabel('editing')).toBe('Editing');
      expect(formatStateLabel('building')).toBe('Building');
      expect(formatStateLabel('simulating')).toBe('Simulating');
      expect(formatStateLabel('rerunning')).toBe('Rerunning');
      expect(formatStateLabel('completed')).toBe('Completed');
      expect(formatStateLabel('blocked')).toBe('Blocked');
      expect(formatStateLabel('stopped')).toBe('Stopped');
    });

    it('capitalizes unknown states as fallback', () => {
      expect(formatStateLabel('custom-state')).toBe('Custom-state');
      expect(formatStateLabel('unknown')).toBe('Unknown');
    });
  });

  describe('capitalize', () => {
    it('capitalizes the first letter of a string', () => {
      expect(capitalize('review')).toBe('Review');
      expect(capitalize('autonomous')).toBe('Autonomous');
      expect(capitalize('guided')).toBe('Guided');
    });

    it('handles empty string', () => {
      expect(capitalize('')).toBe('');
    });

    it('handles already capitalized strings', () => {
      expect(capitalize('Review')).toBe('Review');
    });
  });

  describe('formatBudget', () => {
    it('converts cents to dollars string', () => {
      expect(formatBudget(500)).toBe('$5.00');
      expect(formatBudget(100)).toBe('$1.00');
      expect(formatBudget(1050)).toBe('$10.50');
    });

    it('returns undefined for null/undefined/0', () => {
      expect(formatBudget(null)).toBeUndefined();
      expect(formatBudget(undefined)).toBeUndefined();
      expect(formatBudget(0)).toBeUndefined();
    });
  });

  describe('canStopTask', () => {
    it('returns true for active states', () => {
      expect(canStopTask('building')).toBe(true);
      expect(canStopTask('simulating')).toBe(true);
      expect(canStopTask('analyzing')).toBe(true);
      expect(canStopTask('patching')).toBe(true);
      expect(canStopTask('planning')).toBe(true);
      expect(canStopTask('editing')).toBe(true);
    });

    it('returns false for terminal states', () => {
      expect(canStopTask('completed')).toBe(false);
      expect(canStopTask('stopped')).toBe(false);
    });
  });

  describe('deriveActionRequired', () => {
    it('returns approval action when patching with proposed patch', () => {
      const result = deriveActionRequired('patching', true);
      expect(result).toEqual({
        label: 'Your approval is required',
        ctaText: 'Review patch',
      });
    });

    it('returns undefined when patching without proposed patch', () => {
      expect(deriveActionRequired('patching', false)).toBeUndefined();
    });

    it('returns clarification action when clarification-needed', () => {
      const result = deriveActionRequired('clarification-needed', false);
      expect(result).toEqual({
        label: 'Agent needs clarification',
        ctaText: 'Provide input',
      });
    });

    it('returns undefined for other states', () => {
      expect(deriveActionRequired('building', false)).toBeUndefined();
      expect(deriveActionRequired('completed', false)).toBeUndefined();
      expect(deriveActionRequired('analyzing', true)).toBeUndefined();
    });
  });
});
