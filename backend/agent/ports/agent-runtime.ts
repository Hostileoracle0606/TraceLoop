import type { Plan, PatchProposal, AcceptanceCriterion, RootCause } from '../../llm/functions';
import type { FileOperation } from '../../llm/tools';

/**
 * Provider-neutral agent runtime port (spec § Agent runtime ports).
 * The legacy AI SDK and Backboard adapters both implement this; nothing
 * outside backend/agent/ may depend on a specific provider.
 */

export type AgentRuntimeName = 'legacy' | 'backboard';

export type AgentTurnRequest = {
  stage: 'turn';
  taskId: string;
  text: string;
  files: Record<string, string>;
  context: {
    taskStatus: string;
    iteration: number;
    permissionProfile: string;
    latestRootCause?: RootCause;
    latestAssertion?: AcceptanceCriterion;
  };
};

export type AgentStageRequest =
  | { stage: 'clarify'; taskId: string; intent: string; files: Record<string, string> }
  | { stage: 'plan'; taskId: string; intent: string; files: Record<string, string>;
      board: { name: string; mcu: string; architecture: string }; criteria: AcceptanceCriterion[] }
  | { stage: 'edit'; taskId: string; plan: Plan; files: Record<string, string>; rootCause?: RootCause }
  | { stage: 'repair-build'; taskId: string; buildLog: string; files: Record<string, string> }
  | { stage: 'propose-patch'; taskId: string; rootCause: RootCause; files: Record<string, string>;
      assertion: AcceptanceCriterion }
  | AgentTurnRequest;

export type AgentStageResponse =
  | { kind: 'clarification'; questions: string[] | null }
  | { kind: 'plan'; plan: Plan }
  | { kind: 'operations'; operations: FileOperation[]; summary: string }
  | { kind: 'patch'; patch: PatchProposal }
  | { kind: 'turn'; reply: string; action?: 'explain-failure' | 'approval-needed' | 'stop-task' | null }
  | { kind: 'tool-calls-required'; providerRunRef: string;
      toolCalls: Array<{ id: string; name: string; argumentsRaw: unknown }> };

export interface ProjectRuntimeRef { provider: AgentRuntimeName; projectId: string; assistantId?: string }
export interface TaskConversationRef { provider: AgentRuntimeName; taskId: string; threadId?: string }
export interface ConversationView {
  messages: Array<{ id: string; role: 'user' | 'assistant' | 'tool'; text: string; createdAt?: string }>;
}

export interface AgentRuntime {
  readonly name: AgentRuntimeName;
  ensureProjectConversationScope(input: { projectId: string; userId: string }): Promise<ProjectRuntimeRef>;
  ensureTaskConversation(input: { projectId: string; taskId: string; userId: string }): Promise<TaskConversationRef>;
  runStage(request: AgentStageRequest): Promise<AgentStageResponse>;
  submitToolResults(input: {
    taskId: string; providerRunRef: string;
    outputs: Array<{ toolCallId: string; output: unknown }>;
  }): Promise<AgentStageResponse>;
  getConversation(input: { taskId: string }): Promise<ConversationView>;
  cancel(input: { taskId: string; providerRunRef?: string }): Promise<void>;
}
