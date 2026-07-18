// FSM state types matching backend/src/engine/agent-state.ts

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

export interface StateTransition {
  from: AgentState;
  to: AgentState;
  reason: TransitionReason;
  timestamp: string;
  actor: 'user' | 'agent' | 'system';
  iteration?: number;
}

// State metadata for visualization
export const STATE_METADATA: Record<AgentState, {
  label: string;
  description: string;
  category: 'llm' | 'compute' | 'terminal' | 'control';
  color: string;
  icon: string;
}> = {
  'clarification-needed': {
    label: 'Clarification Needed',
    description: 'Agent needs more information from user',
    category: 'llm',
    color: '#f59e0b',
    icon: '?',
  },
  'planning': {
    label: 'Planning',
    description: 'Generating implementation plan',
    category: 'llm',
    color: '#3b82f6',
    icon: '📋',
  },
  'editing': {
    label: 'Editing',
    description: 'Modifying source files',
    category: 'llm',
    color: '#8b5cf6',
    icon: '✏️',
  },
  'building': {
    label: 'Building',
    description: 'Compiling firmware',
    category: 'compute',
    color: '#06b6d4',
    icon: '🔨',
  },
  'simulating': {
    label: 'Simulating',
    description: 'Running Renode simulation',
    category: 'compute',
    color: '#06b6d4',
    icon: '▶️',
  },
  'analyzing': {
    label: 'Analyzing',
    description: 'Analyzing trace with causal engine',
    category: 'compute',
    color: '#10b981',
    icon: '🔍',
  },
  'patching': {
    label: 'Patching',
    description: 'Proposing fix based on root cause',
    category: 'llm',
    color: '#f97316',
    icon: '🔧',
  },
  'rerunning': {
    label: 'Rerunning',
    description: 'Starting next iteration',
    category: 'control',
    color: '#64748b',
    icon: '🔄',
  },
  'completed': {
    label: 'Completed',
    description: 'All assertions passed',
    category: 'terminal',
    color: '#22c55e',
    icon: '✓',
  },
  'blocked': {
    label: 'Blocked',
    description: 'Budget exhausted or no progress',
    category: 'terminal',
    color: '#ef4444',
    icon: '⚠',
  },
  'stopped': {
    label: 'Stopped',
    description: 'User cancelled',
    category: 'terminal',
    color: '#6b7280',
    icon: '⏹',
  },
};

// Valid transitions
export const VALID_TRANSITIONS: Record<AgentState, AgentState[]> = {
  'clarification-needed': ['planning', 'stopped'],
  'planning': ['editing', 'clarification-needed', 'stopped'],
  'editing': ['building', 'stopped'],
  'building': ['simulating', 'editing', 'blocked', 'stopped'],
  'simulating': ['analyzing', 'blocked', 'stopped'],
  'analyzing': ['completed', 'patching', 'blocked', 'stopped'],
  'patching': ['rerunning', 'editing', 'stopped'],
  'rerunning': ['building', 'stopped'],
  'completed': [],
  'blocked': ['stopped'],
  'stopped': [],
};

export function canTransition(from: AgentState, to: AgentState): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function isTerminal(state: AgentState): boolean {
  return state === 'completed' || state === 'stopped';
}

export function requiresLLM(state: AgentState): boolean {
  return ['clarification-needed', 'planning', 'editing', 'patching'].includes(state);
}

export function requiresCompute(state: AgentState): boolean {
  return ['building', 'simulating'].includes(state);
}
