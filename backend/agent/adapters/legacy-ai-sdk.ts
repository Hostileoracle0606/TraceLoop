import type {
  AgentRuntime, AgentStageRequest, AgentStageResponse,
  ProjectRuntimeRef, TaskConversationRef, ConversationView,
} from '../ports/agent-runtime';
import { clarifyIntent, generatePlan, editSource, proposePatchLLM } from '../../llm/functions';
import { AgentProviderError } from '../errors';

/**
 * Wraps the existing Vercel AI SDK functions behind the AgentRuntime port.
 * C3: transparent — no prompt changes, no error rewrapping, no added logic.
 * Domain/policy errors thrown by the wrapped functions pass through as-is.
 */
export class LegacyAiSdkRuntime implements AgentRuntime {
  readonly name = 'legacy' as const;

  async ensureProjectConversationScope(input: { projectId: string; userId: string }): Promise<ProjectRuntimeRef> {
    return { provider: 'legacy', projectId: input.projectId };
  }

  async ensureTaskConversation(input: { projectId: string; taskId: string; userId: string }): Promise<TaskConversationRef> {
    return { provider: 'legacy', taskId: input.taskId };
  }

  async runStage(request: AgentStageRequest): Promise<AgentStageResponse> {
    switch (request.stage) {
      case 'clarify': {
        const result = await clarifyIntent(request.intent, request.files);
        return { kind: 'clarification', questions: result === null ? null : result.questions };
      }
      case 'plan': {
        const plan = await generatePlan(request.intent, request.files, request.board, request.criteria);
        return { kind: 'plan', plan };
      }
      case 'edit': {
        const result = await editSource(request.plan, request.files, request.rootCause);
        return { kind: 'operations', operations: result.operations, summary: result.summary };
      }
      case 'propose-patch': {
        const patch = await proposePatchLLM(request.rootCause, request.files, request.assertion);
        return { kind: 'patch', patch };
      }
    }
  }

  async submitToolResults(): Promise<AgentStageResponse> {
    throw new AgentProviderError('runtime-unsupported', 'legacy runtime has no provider tool loop');
  }

  async getConversation(): Promise<ConversationView> {
    return { messages: [] };
  }

  async cancel(): Promise<void> {
    // Legacy AI SDK calls are single-shot; nothing to cancel.
  }
}
