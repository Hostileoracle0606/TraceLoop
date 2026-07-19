import { getAgentRuntimeConfig, __resetEnvForTests } from '../config';
import { AgentProviderError } from './errors';
import { LegacyAiSdkRuntime } from './adapters/legacy-ai-sdk';
import type { AgentRuntime, AgentRuntimeName } from './ports/agent-runtime';

let legacySingleton: LegacyAiSdkRuntime | undefined;

export function isBackboardEnabled(): boolean {
  return getAgentRuntimeConfig().backboardEnabled;
}

/** C1: what runtime a NEW task gets, given the project default. */
export function resolveRuntimeForNewTask(projectDefault: string): AgentRuntimeName {
  if (!isBackboardEnabled()) return 'legacy';
  return projectDefault === 'backboard' ? 'backboard' : 'legacy';
}

/** C4: tasks carry a pinned runtime; resolution never falls back silently. */
export function resolveAgentRuntime(task: { agentRuntime: string }): AgentRuntime {
  switch (task.agentRuntime) {
    case 'legacy':
      return (legacySingleton ??= new LegacyAiSdkRuntime());
    case 'backboard':
      if (!isBackboardEnabled()) {
        throw new AgentProviderError('runtime-disabled', 'Backboard runtime is not enabled in this environment');
      }
      throw new AgentProviderError('runtime-unsupported', 'BackboardAgentRuntime is not implemented (issue 09)');
    default:
      throw new AgentProviderError('runtime-unsupported', `Unknown agent runtime: ${task.agentRuntime}`);
  }
}

export function __resetRuntimeSelectionForTests(): void {
  legacySingleton = undefined;
  __resetEnvForTests();
}
