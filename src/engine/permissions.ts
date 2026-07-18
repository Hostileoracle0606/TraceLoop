// The permission contract: defines what the agent can do without user
// approval, based on the selected permission profile. Enforced at every
// action boundary — the agent cannot escalate its own permissions.
//
// See docs/user-interaction-flow.md "Permission profiles" and the plan
// (Phase 3) for the full contract.

import { isActionAllowed } from './agent-state';
import type { AgentAction, AgentState } from './agent-state';

/** The three permission profiles. */
export type PermissionProfile = 'review' | 'guided' | 'autonomous';

/**
 * Actions that require user approval. The permission profile determines
 * when approval is required:
 * - review: ask for every change
 * - guided: ask at checkpoints
 * - autonomous: auto-allow within isolated workspace (with exceptions)
 *
 * Note: 'apply-patch', 'modify-tests', and 'commit-push-deploy' are
 * higher-level operations that wrap one or more AgentActions. They are
 * checked at the API/middleware layer, not at the state-machine layer.
 */
export type ApprovalRequiredAction =
  | 'write-source'
  | 'apply-patch'
  | 'modify-tests'
  | 'commit-push-deploy';

/**
 * The result of a permission check. Either the action is allowed, or
 * it is denied with a reason and whether it requires approval.
 */
export type PermissionCheckResult =
  | { allowed: true }
  | { allowed: false; reason: string; requiresApproval: boolean };

/**
 * Check whether an action requires user approval in the given profile.
 * This is the core permission enforcement function.
 */
export function checkPermission(
  profile: PermissionProfile,
  action: ApprovalRequiredAction,
): PermissionCheckResult {
  switch (profile) {
    case 'review':
      // Review mode: ask for every change
      return {
        allowed: false,
        reason: `Review mode requires approval for ${action}`,
        requiresApproval: true,
      };

    case 'guided':
      // Guided mode: ask at checkpoints
      switch (action) {
        case 'write-source':
          return {
            allowed: false,
            reason: 'Guided mode requires approval at source edit checkpoints',
            requiresApproval: true,
          };
        case 'apply-patch':
          return {
            allowed: false,
            reason: 'Guided mode requires approval at patch checkpoint',
            requiresApproval: true,
          };
        case 'modify-tests':
          return {
            allowed: false,
            reason: 'Guided mode requires approval for test modifications',
            requiresApproval: true,
          };
        case 'commit-push-deploy':
          return {
            allowed: false,
            reason: 'Guided mode requires approval for commit/push/deploy',
            requiresApproval: true,
          };
      }
      break;

    case 'autonomous':
      // Autonomous mode: auto-allow within isolated workspace, with exceptions
      switch (action) {
        case 'write-source':
          // Auto-allow within isolated workspace
          return { allowed: true };
        case 'apply-patch':
          // Auto-allow if pre-authorized
          return { allowed: true };
        case 'modify-tests':
          // Never silently modify tests — requires explicit policy
          return {
            allowed: false,
            reason: 'Tests are protected inputs. Autonomous mode cannot silently modify tests.',
            requiresApproval: true,
          };
        case 'commit-push-deploy':
          // Separate permission; never implied by autonomous coding
          return {
            allowed: false,
            reason: 'Commit/push/deploy requires separate permission, not implied by autonomous coding.',
            requiresApproval: true,
          };
      }
      break;
  }

  // Unreachable, but TypeScript needs it
  return { allowed: true };
}

/**
 * Check whether an action is allowed in the given state and profile.
 * Combines state machine constraints with permission profile.
 */
export function isActionPermitted(
  state: AgentState,
  profile: PermissionProfile,
  action: AgentAction,
): PermissionCheckResult {
  // First check if the action is allowed in this state
  if (!isActionAllowed(state, action)) {
    return {
      allowed: false,
      reason: `Action ${action} is not allowed in state ${state}`,
      requiresApproval: false,
    };
  }

  // Then check if the action requires approval in this profile
  if (isAgentActionApprovalRequired(action)) {
    return checkPermission(profile, action as ApprovalRequiredAction);
  }

  // Action is allowed in state and doesn't require approval
  return { allowed: true };
}

/**
 * Check whether an AgentAction is one that requires approval (vs. always allowed).
 */
function isAgentActionApprovalRequired(action: AgentAction): boolean {
  const approvalActions: readonly AgentAction[] = ['write-source'];
  return approvalActions.includes(action);
}

/**
 * Security contract: defines what the agent cannot do, regardless of profile.
 * These are hard constraints, not configurable.
 */
export const SECURITY_CONSTRAINTS = {
  /** Modal containers never receive API keys, tokens, or credentials from the host. */
  noHostSecrets: 'Modal containers never receive host secrets. Firmware source is the only input.',

  /** Firmware files are written to a temp workspace inside Modal. The agent cannot read/write outside the project workspace. */
  noArbitraryHostPaths: 'Agent cannot read/write outside the project workspace.',

  /** The agent cannot run arbitrary commands. It invokes defined tools only. */
  noUnrestrictedShell: 'Agent cannot run arbitrary shell commands. Only defined tools (build, simulate, analyze) are allowed.',

  /** Modal containers are ephemeral, isolated, and have no network access beyond what Modal allows. */
  sandboxedCompute: 'Compute is sandboxed: ephemeral, isolated, no arbitrary network access.',
} as const;

/**
 * Resource controls: configurable caps enforced by the system.
 */
export interface ResourceControls {
  /** Max iterations per task (default: 5) */
  maxIterations: number;
  /** Max wall-clock time per task in milliseconds (default: 30 min) */
  maxTimeMs: number;
  /** Max Modal compute cost per task in USD (default: $5) */
  maxCostUsd: number;
}

/** Default resource controls. */
export const DEFAULT_RESOURCE_CONTROLS: ResourceControls = {
  maxIterations: 5,
  maxTimeMs: 30 * 60 * 1000, // 30 minutes
  maxCostUsd: 5,
};

/**
 * Check whether resource limits have been exceeded.
 */
export function checkResourceLimits(
  controls: ResourceControls,
  current: {
    iterations: number;
    elapsedMs: number;
    costUsd: number;
  },
): { exceeded: boolean; reason?: string } {
  if (current.iterations >= controls.maxIterations) {
    return {
      exceeded: true,
      reason: `Iteration limit exceeded: ${current.iterations} / ${controls.maxIterations}`,
    };
  }
  if (current.elapsedMs >= controls.maxTimeMs) {
    return {
      exceeded: true,
      reason: `Time limit exceeded: ${Math.round(current.elapsedMs / 1000)}s / ${Math.round(controls.maxTimeMs / 1000)}s`,
    };
  }
  if (current.costUsd >= controls.maxCostUsd) {
    return {
      exceeded: true,
      reason: `Cost limit exceeded: $${current.costUsd.toFixed(2)} / $${controls.maxCostUsd.toFixed(2)}`,
    };
  }
  return { exceeded: false };
}

/**
 * Protected inputs: these cannot be modified by the agent without explicit
 * user approval, regardless of permission profile.
 */
export const PROTECTED_INPUTS = {
  /** Tests cannot be silently weakened, removed, or skipped. */
  tests: 'Tests are protected. Any modification requires explicit approval.',

  /** User-approved assertions are immutable inputs to the analysis engine. */
  acceptanceCriteria: 'Acceptance criteria are protected. Agent can only change firmware, not what the test asserts.',

  /** Selected board and its capabilities cannot be changed mid-task without explicit user action. */
  boardConfiguration: 'Board configuration is protected. Cannot be changed mid-task without explicit user action.',
} as const;

/**
 * Check whether a file path is a protected input (test file).
 * Used to enforce test protection regardless of permission profile.
 */
export function isProtectedFile(path: string): boolean {
  // Test files are protected
  const testPatterns = [
    /test/i,
    /spec/i,
    /\.test\./,
    /\.spec\./,
    /tests\//,
    /__tests__\//,
  ];
  return testPatterns.some(pattern => pattern.test(path));
}

/**
 * Audit log entry: records every permission decision for auditability.
 */
export interface PermissionAuditEntry {
  timestamp: string;
  profile: PermissionProfile;
  action: AgentAction;
  state: AgentState;
  result: PermissionCheckResult;
  actor: 'user' | 'agent';
  iteration?: number;
}
