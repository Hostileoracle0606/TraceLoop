import type {
  AgentRuntime, AgentStageRequest, AgentStageResponse,
  ProjectRuntimeRef, TaskConversationRef, ConversationView,
} from '../../ports/agent-runtime';
import { AgentProviderError } from '../../errors';
import { BackboardClient } from './client';

export interface BackboardRuntimeConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

/**
 * Issue 02 skeleton: holds config and a client but implements NO behavior.
 * C9/F16: every method rejects before any network I/O. Issue 09 implements
 * the conversational stages after the feasibility gate.
 */
export class BackboardAgentRuntime implements AgentRuntime {
  readonly name = 'backboard' as const;
  private readonly client: BackboardClient;

  constructor(private readonly cfg: BackboardRuntimeConfig) {
    this.client = new BackboardClient({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, fetchImpl: cfg.fetchImpl });
  }

  private guard(): never {
    if (!this.cfg.enabled) {
      throw new AgentProviderError('runtime-disabled', 'Backboard runtime is not enabled');
    }
    throw new AgentProviderError('runtime-unsupported', 'BackboardAgentRuntime stages are implemented in issue 09');
  }

  async ensureProjectConversationScope(_input: { projectId: string; userId: string }): Promise<ProjectRuntimeRef> { this.guard(); }
  async ensureTaskConversation(_input: { projectId: string; taskId: string; userId: string }): Promise<TaskConversationRef> { this.guard(); }
  async runStage(_request: AgentStageRequest): Promise<AgentStageResponse> { this.guard(); }
  async submitToolResults(_input: { taskId: string; providerRunRef: string; outputs: Array<{ toolCallId: string; output: unknown }> }): Promise<AgentStageResponse> { this.guard(); }
  async getConversation(_input: { taskId: string }): Promise<ConversationView> { this.guard(); }
  async cancel(_input: { taskId: string; providerRunRef?: string }): Promise<void> { this.guard(); }
}
