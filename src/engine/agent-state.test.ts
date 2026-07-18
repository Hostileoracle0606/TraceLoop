import { describe, it, expect } from 'vitest';
import {
  isTerminal,
  requiresLLM,
  requiresCompute,
  isActionAllowed,
  allowedActions,
  canTransition,
  nextStates,
  transition,
  createStateTransition,
  type AgentState,
} from './agent-state';

describe('agent state machine', () => {
  describe('isTerminal', () => {
    it('completed and stopped are terminal', () => {
      expect(isTerminal('completed')).toBe(true);
      expect(isTerminal('stopped')).toBe(true);
    });

    it('all other states are non-terminal', () => {
      const nonTerminal: AgentState[] = [
        'clarification-needed',
        'planning',
        'editing',
        'building',
        'simulating',
        'analyzing',
        'patching',
        'rerunning',
        'blocked',
      ];
      for (const state of nonTerminal) {
        expect(isTerminal(state)).toBe(false);
      }
    });
  });

  describe('requiresLLM', () => {
    it('clarification-needed, planning, editing, patching require LLM', () => {
      expect(requiresLLM('clarification-needed')).toBe(true);
      expect(requiresLLM('planning')).toBe(true);
      expect(requiresLLM('editing')).toBe(true);
      expect(requiresLLM('patching')).toBe(true);
    });

    it('building, simulating, analyzing, rerunning, completed, blocked, stopped do not require LLM', () => {
      expect(requiresLLM('building')).toBe(false);
      expect(requiresLLM('simulating')).toBe(false);
      expect(requiresLLM('analyzing')).toBe(false);
      expect(requiresLLM('rerunning')).toBe(false);
      expect(requiresLLM('completed')).toBe(false);
      expect(requiresLLM('blocked')).toBe(false);
      expect(requiresLLM('stopped')).toBe(false);
    });
  });

  describe('requiresCompute', () => {
    it('building and simulating require compute', () => {
      expect(requiresCompute('building')).toBe(true);
      expect(requiresCompute('simulating')).toBe(true);
    });

    it('all other states do not require compute', () => {
      const nonCompute: AgentState[] = [
        'clarification-needed',
        'planning',
        'editing',
        'analyzing',
        'patching',
        'rerunning',
        'completed',
        'blocked',
        'stopped',
      ];
      for (const state of nonCompute) {
        expect(requiresCompute(state)).toBe(false);
      }
    });
  });

  describe('allowed actions', () => {
    it('clarification-needed allows read-files and ask-question', () => {
      expect(isActionAllowed('clarification-needed', 'read-files')).toBe(true);
      expect(isActionAllowed('clarification-needed', 'ask-question')).toBe(true);
      expect(isActionAllowed('clarification-needed', 'write-source')).toBe(false);
      expect(isActionAllowed('clarification-needed', 'build-firmware')).toBe(false);
    });

    it('editing allows read-files and write-source', () => {
      expect(isActionAllowed('editing', 'read-files')).toBe(true);
      expect(isActionAllowed('editing', 'write-source')).toBe(true);
      expect(isActionAllowed('editing', 'build-firmware')).toBe(false);
    });

    it('building allows read-files and build-firmware', () => {
      expect(isActionAllowed('building', 'read-files')).toBe(true);
      expect(isActionAllowed('building', 'build-firmware')).toBe(true);
      expect(isActionAllowed('building', 'simulate-firmware')).toBe(false);
    });

    it('analyzing allows read-files and analyze-trace', () => {
      expect(isActionAllowed('analyzing', 'read-files')).toBe(true);
      expect(isActionAllowed('analyzing', 'analyze-trace')).toBe(true);
      expect(isActionAllowed('analyzing', 'propose-patch')).toBe(false);
    });

    it('completed allows read-files and save-report', () => {
      expect(isActionAllowed('completed', 'read-files')).toBe(true);
      expect(isActionAllowed('completed', 'save-report')).toBe(true);
      expect(isActionAllowed('completed', 'write-source')).toBe(false);
    });

    it('blocked allows read-files and show-summary', () => {
      expect(isActionAllowed('blocked', 'read-files')).toBe(true);
      expect(isActionAllowed('blocked', 'show-summary')).toBe(true);
      expect(isActionAllowed('blocked', 'build-firmware')).toBe(false);
    });

    it('allowedActions returns all actions for a state', () => {
      const actions = allowedActions('editing');
      expect(actions).toContain('read-files');
      expect(actions).toContain('write-source');
      expect(actions).toHaveLength(2);
    });
  });

  describe('valid transitions', () => {
    it('happy path: clarification → planning → editing → building → simulating → analyzing → patching → rerunning → building', () => {
      expect(canTransition('clarification-needed', 'planning')).toBe(true);
      expect(canTransition('planning', 'editing')).toBe(true);
      expect(canTransition('editing', 'building')).toBe(true);
      expect(canTransition('building', 'simulating')).toBe(true);
      expect(canTransition('simulating', 'analyzing')).toBe(true);
      expect(canTransition('analyzing', 'patching')).toBe(true);
      expect(canTransition('patching', 'rerunning')).toBe(true);
      expect(canTransition('rerunning', 'building')).toBe(true);
    });

    it('analyzing → completed when tests pass', () => {
      expect(canTransition('analyzing', 'completed')).toBe(true);
    });

    it('building → editing when build fails', () => {
      expect(canTransition('building', 'editing')).toBe(true);
    });

    it('building → blocked on budget/infra failure', () => {
      expect(canTransition('building', 'blocked')).toBe(true);
    });

    it('patching → editing when patch rejected', () => {
      expect(canTransition('patching', 'editing')).toBe(true);
    });

    it('planning → clarification-needed when new ambiguity found', () => {
      expect(canTransition('planning', 'clarification-needed')).toBe(true);
    });

    it('any non-terminal state can transition to stopped', () => {
      const cancellable: AgentState[] = [
        'clarification-needed',
        'planning',
        'editing',
        'building',
        'simulating',
        'analyzing',
        'patching',
        'rerunning',
        'blocked',
      ];
      for (const state of cancellable) {
        expect(canTransition(state, 'stopped')).toBe(true);
      }
    });

    it('terminal states have no valid transitions', () => {
      expect(nextStates('completed')).toEqual([]);
      expect(nextStates('stopped')).toEqual([]);
    });

    it('invalid transitions are rejected', () => {
      expect(canTransition('completed', 'editing')).toBe(false);
      expect(canTransition('stopped', 'building')).toBe(false);
      expect(canTransition('clarification-needed', 'building')).toBe(false);
      expect(canTransition('editing', 'analyzing')).toBe(false);
      expect(canTransition('building', 'patching')).toBe(false);
    });
  });

  describe('transition function', () => {
    it('returns the new state for valid transitions', () => {
      expect(transition('planning', 'editing')).toBe('editing');
      expect(transition('building', 'simulating')).toBe('simulating');
      expect(transition('analyzing', 'completed')).toBe('completed');
    });

    it('throws for invalid transitions', () => {
      expect(() => transition('completed', 'editing')).toThrow('Invalid state transition');
      expect(() => transition('stopped', 'building')).toThrow('Invalid state transition');
      expect(() => transition('clarification-needed', 'building')).toThrow('Invalid state transition');
    });
  });

  describe('createStateTransition', () => {
    it('creates a valid transition event', () => {
      const event = createStateTransition('planning', 'editing', 'plan-approved', 'user', 1);
      expect(event.from).toBe('planning');
      expect(event.to).toBe('editing');
      expect(event.reason).toBe('plan-approved');
      expect(event.actor).toBe('user');
      expect(event.iteration).toBe(1);
      expect(event.timestamp).toBeTruthy();
    });

    it('throws for invalid transitions', () => {
      expect(() =>
        createStateTransition('completed', 'editing', 'plan-approved', 'user'),
      ).toThrow('Invalid state transition');
    });
  });

  describe('full loop scenario', () => {
    it('simulates a complete authoring loop: intent → build → fail → patch → rerun → pass', () => {
      let state: AgentState = 'planning';

      // Plan approved → editing
      state = transition(state, 'editing');
      expect(state).toBe('editing');

      // Source ready → building
      state = transition(state, 'building');
      expect(state).toBe('building');

      // Build ok → simulating
      state = transition(state, 'simulating');
      expect(state).toBe('simulating');

      // Sim complete → analyzing
      state = transition(state, 'analyzing');
      expect(state).toBe('analyzing');

      // Tests failed → patching
      state = transition(state, 'patching');
      expect(state).toBe('patching');

      // Patch approved → rerunning
      state = transition(state, 'rerunning');
      expect(state).toBe('rerunning');

      // Rerun → building (iteration 2)
      state = transition(state, 'building');
      expect(state).toBe('building');

      // Build ok → simulating
      state = transition(state, 'simulating');
      expect(state).toBe('simulating');

      // Sim complete → analyzing
      state = transition(state, 'analyzing');
      expect(state).toBe('analyzing');

      // Tests passed → completed
      state = transition(state, 'completed');
      expect(state).toBe('completed');
      expect(isTerminal(state)).toBe(true);
    });

    it('simulates a blocked scenario: build → blocked → stopped', () => {
      let state: AgentState = 'building';

      // Budget exhausted → blocked
      state = transition(state, 'blocked');
      expect(state).toBe('blocked');

      // User cancels → stopped
      state = transition(state, 'stopped');
      expect(state).toBe('stopped');
      expect(isTerminal(state)).toBe(true);
    });
  });
});
