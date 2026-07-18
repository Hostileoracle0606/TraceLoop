// The agent state machine: an explicit finite state machine with defined
// entry/exit conditions, allowed actions, and transitions. The LLM serves
// this FSM, not the other way around.
//
// See docs/user-interaction-flow.md "Agent loop behavior" and the plan
// (Phase 3) for the full contract.

/** The 11 explicit agent states. */
export type AgentState =
  | 'clarification-needed'
  | 'planning'
  | 'editing'
  | 'building'
  | 'simulating'
  | 'analyzing'
  | 'patching'
  | 'rerunning'
  | 'completed'
  | 'blocked'
  | 'stopped';

/** Actions the agent can perform. Each state defines which are allowed. */
export type AgentAction =
  | 'read-files'
  | 'ask-question'
  | 'generate-plan'
  | 'write-source'
  | 'build-firmware'
  | 'simulate-firmware'
  | 'analyze-trace'
  | 'propose-patch'
  | 'save-report'
  | 'show-summary';

/** Whether a state is terminal (no further transitions possible). */
export function isTerminal(state: AgentState): boolean {
  return state === 'completed' || state === 'stopped';
}

/** Whether a state requires LLM capability (vs. deterministic/compute-only). */
export function requiresLLM(state: AgentState): boolean {
  return (
    state === 'clarification-needed' ||
    state === 'planning' ||
    state === 'editing' ||
    state === 'patching'
  );
}

/** Whether a state involves Modal compute (build/simulate). */
export function requiresCompute(state: AgentState): boolean {
  return state === 'building' || state === 'simulating';
}

/** The allowed actions for each state. */
const ALLOWED_ACTIONS: Record<AgentState, ReadonlySet<AgentAction>> = {
  'clarification-needed': new Set(['read-files', 'ask-question']),
  'planning': new Set(['read-files', 'generate-plan']),
  'editing': new Set(['read-files', 'write-source']),
  'building': new Set(['read-files', 'build-firmware']),
  'simulating': new Set(['read-files', 'simulate-firmware']),
  'analyzing': new Set(['read-files', 'analyze-trace']),
  'patching': new Set(['read-files', 'propose-patch']),
  'rerunning': new Set(['read-files']),
  'completed': new Set(['read-files', 'save-report']),
  'blocked': new Set(['read-files', 'show-summary']),
  'stopped': new Set(['read-files']),
};

/** Check whether an action is allowed in the given state. */
export function isActionAllowed(state: AgentState, action: AgentAction): boolean {
  return ALLOWED_ACTIONS[state].has(action);
}

/** Get all allowed actions for a state. */
export function allowedActions(state: AgentState): AgentAction[] {
  return [...ALLOWED_ACTIONS[state]];
}

/**
 * Valid state transitions. Each key is a source state; the value is the set
 * of states it can transition to.
 *
 * The FSM is explicit: transitions are function calls, not LLM decisions.
 * Any state can transition to 'blocked' (budget exhausted, infra failure,
 * no progress) or 'stopped' (user cancels).
 */
const VALID_TRANSITIONS: Record<AgentState, ReadonlySet<AgentState>> = {
  'clarification-needed': new Set(['planning', 'stopped']),
  'planning': new Set(['editing', 'clarification-needed', 'stopped']),
  'editing': new Set(['building', 'stopped']),
  'building': new Set(['simulating', 'editing', 'blocked', 'stopped']),
  'simulating': new Set(['analyzing', 'blocked', 'stopped']),
  'analyzing': new Set(['completed', 'patching', 'blocked', 'stopped']),
  'patching': new Set(['rerunning', 'editing', 'stopped']),
  'rerunning': new Set(['building', 'stopped']),
  'completed': new Set([]),
  'blocked': new Set(['stopped']),
  'stopped': new Set([]),
};

/** Check whether a transition from one state to another is valid. */
export function canTransition(from: AgentState, to: AgentState): boolean {
  return VALID_TRANSITIONS[from].has(to);
}

/** Get all valid next states from a given state. */
export function nextStates(from: AgentState): AgentState[] {
  return [...VALID_TRANSITIONS[from]];
}

/**
 * Attempt a state transition. Returns the new state if valid, or throws
 * if the transition is not allowed.
 */
export function transition(from: AgentState, to: AgentState): AgentState {
  if (!canTransition(from, to)) {
    throw new Error(
      `Invalid state transition: ${from} → ${to}. ` +
      `Valid transitions from ${from}: ${nextStates(from).join(', ') || '(none — terminal)'}`
    );
  }
  return to;
}

/**
 * Entry conditions for each state. These describe what must be true
 * before entering the state. Used for validation and UI display.
 */
export const ENTRY_CONDITIONS: Record<AgentState, string> = {
  'clarification-needed': 'Agent cannot determine expected behavior or constraints',
  'planning': 'Intent confirmed, no ambiguities',
  'editing': 'Plan approved, or patch rejected with manual edit request',
  'building': 'Source files ready',
  'simulating': 'Build succeeded',
  'analyzing': 'Trace available',
  'patching': 'Root cause identified',
  'rerunning': 'Patch approved, new iteration starting',
  'completed': 'All assertions pass',
  'blocked': 'Budget exhausted, infra failure, or repeated no-progress',
  'stopped': 'User cancels at any point',
};

/**
 * Exit conditions for each state. These describe what must be true
 * before leaving the state. Used for validation and UI display.
 */
export const EXIT_CONDITIONS: Record<AgentState, string> = {
  'clarification-needed': 'User answers question or cancels',
  'planning': 'Plan approved by user (or auto-approved in autonomous mode)',
  'editing': 'Source files written, ready to build',
  'building': 'Build ok → simulating; build failed → editing or blocked',
  'simulating': 'Sim complete → analyzing; timeout/infra failure → blocked',
  'analyzing': 'Tests pass → completed; failure with root cause → patching',
  'patching': 'Patch approved → rerunning; patch rejected → editing',
  'rerunning': '→ building (next iteration)',
  'completed': 'Terminal state',
  'blocked': 'User intervenes or cancels',
  'stopped': 'Terminal state',
};

/**
 * The reason a state transition occurred. Used for audit logging and
 * UI display. Every transition must have a reason.
 */
export type TransitionReason =
  | 'intent-received'
  | 'clarification-answered'
  | 'plan-approved'
  | 'plan-rejected'
  | 'source-ready'
  | 'build-succeeded'
  | 'build-failed'
  | 'sim-complete'
  | 'sim-timeout'
  | 'sim-infra-failure'
  | 'tests-passed'
  | 'tests-failed'
  | 'patch-approved'
  | 'patch-rejected'
  | 'patch-edited'
  | 'iteration-started'
  | 'budget-exhausted'
  | 'no-progress'
  | 'user-cancelled'
  | 'user-intervention';

/**
 * A state transition event. Recorded in the activity log for auditability.
 */
export interface StateTransition {
  from: AgentState;
  to: AgentState;
  reason: TransitionReason;
  timestamp: string;
  actor: 'user' | 'agent' | 'system';
  iteration?: number;
}

/**
 * Create a state transition event. Validates the transition before creating it.
 */
export function createStateTransition(
  from: AgentState,
  to: AgentState,
  reason: TransitionReason,
  actor: 'user' | 'agent' | 'system',
  iteration?: number,
): StateTransition {
  // Validate the transition
  transition(from, to); // throws if invalid

  return {
    from,
    to,
    reason,
    timestamp: new Date().toISOString(),
    actor,
    iteration,
  };
}
