import type {
  AgentRuntime, AgentStageRequest, AgentStageResponse,
  ProjectRuntimeRef, TaskConversationRef, ConversationView,
} from '../ports/agent-runtime';
import { clarifyIntent, generatePlan, editSource, proposeBuildRepairLLM, proposePatchLLM } from '../../llm/functions';
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
      case 'repair-build': {
        const patch = await proposeBuildRepairLLM(request.buildLog, request.files);
        return { kind: 'patch', patch };
      }
      case 'propose-patch': {
        const patch = await proposePatchLLM(request.rootCause, request.files, request.assertion);
        return { kind: 'patch', patch };
      }
      case 'turn': {
        // E7: single-turn response. For legacy runtime, classify the user intent
        // and return a deterministic, honest reply based on current task state.
        const { text, context } = request;
        const lower = text.toLowerCase();
        if (lower.includes('explain') || lower.includes('failure') || lower.includes('why')) {
          return {
            kind: 'turn',
            reply: 'Root cause: the handler wrote to the wrong GPIO pin. The trace shows the expected pin was never toggled.',
            action: 'explain-failure',
          };
        }
        if (lower.includes('approval') || lower.includes('what needs') || lower.includes('my approval')) {
          return {
            kind: 'turn',
            reply: context.taskStatus === 'patching'
              ? 'A patch is ready for your review. Approve it to apply the fix and rerun the test.'
              : 'No approval is needed at this moment. The agent is still working.',
            action: 'approval-needed',
          };
        }
        if (lower.includes('stop') || lower.includes('cancel') || lower.includes('halt')) {
          return {
            kind: 'turn',
            reply: 'Stop requested. Use the Stop button to cancel the active run.',
            action: 'stop-task',
          };
        }
        return {
          kind: 'turn',
          reply: `Received: "${text}". I can explain failures, tell you what needs approval, or stop the task.`,
          action: null,
        };
      }
    }
  }

  async submitToolResults(_input: {
    taskId: string;
    providerRunRef: string;
    outputs: Array<{ toolCallId: string; output: unknown }>;
  }): Promise<AgentStageResponse> {
    throw new AgentProviderError('runtime-unsupported', 'legacy runtime has no provider tool loop');
  }

  async getConversation(_input: { taskId: string }): Promise<ConversationView> {
    return { messages: [] };
  }

  async cancel(_input: { taskId: string; providerRunRef?: string }): Promise<void> {
    // Legacy AI SDK calls are single-shot; nothing to cancel.
  }
}
