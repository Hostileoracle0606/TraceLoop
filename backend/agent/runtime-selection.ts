import { getAgentRuntimeConfig, __resetEnvForTests } from '../config';
import { AgentProviderError } from './errors';
import { LegacyAiSdkRuntime } from './adapters/legacy-ai-sdk';
import { BackboardAgentRuntime } from './adapters/backboard/runtime';
import type { AgentRuntime, AgentRuntimeName } from './ports/agent-runtime';

let legacySingleton: LegacyAiSdkRuntime | undefined;
let backboardSingleton: BackboardAgentRuntime | undefined;

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
    case 'backboard': {
      if (!isBackboardEnabled()) {
        throw new AgentProviderError('runtime-disabled', 'Backboard runtime is not enabled in this environment');
      }
      const { backboardApiKey, backboardBaseUrl } = getAgentRuntimeConfig();
      if (!backboardApiKey || !backboardBaseUrl) {
        throw new AgentProviderError('runtime-disabled', 'BACKBOARD_API_KEY / BACKBOARD_BASE_URL are not configured');
      }
      return (backboardSingleton ??= new BackboardAgentRuntime({
        enabled: true, apiKey: backboardApiKey, baseUrl: backboardBaseUrl,
      }));
    }
    default:
      throw new AgentProviderError('runtime-unsupported', `Unknown agent runtime: ${task.agentRuntime}`);
  }
}

export function __resetRuntimeSelectionForTests(): void {
  legacySingleton = undefined;
  backboardSingleton = undefined;
  __resetEnvForTests();
}
