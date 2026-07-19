import { BackboardClient } from '../../backend/agent/adapters/backboard/client';
import { ENDPOINTS } from '../../backend/agent/adapters/backboard/endpoints';
import { SpikeLedger } from '../../backend/agent/spike/ledger';
import { TranscriptRecorder } from '../../backend/agent/spike/transcript';
import { agentStageTools, parseToolArguments } from '../../backend/agent/tools/schemas';
import { normalizeRun, driveToolLoop } from '../../backend/agent/adapters/backboard/normalize';

export interface ProbeContext {
  client: BackboardClient;
  ledger: SpikeLedger;
  recorder: TranscriptRecorder;
}

export type Probe = (ctx: ProbeContext) => Promise<void>;

export const probes: Record<string, Probe> = {
  'P1-lifecycle': async ({ client, ledger, recorder }) => {
    const intent = ledger.recordIntent({ kind: 'assistant', probe: 'P1', name: 'traceloop-spike-P1-assistant' });
    const assistant = await client.post<{ id: string }>(ENDPOINTS.assistants, {
      name: 'traceloop-spike-P1-assistant',
      system_prompt: 'You are a spike fixture. Answer briefly.',
    });
    ledger.confirm(intent.intentId, assistant.id);
    recorder.step('create-assistant', { response: assistant });

    const threadIntent = ledger.recordIntent({ kind: 'thread', probe: 'P1', name: 'traceloop-spike-P1-thread' });
    const thread = await client.post<{ id: string }>(ENDPOINTS.threads, { assistant_id: assistant.id });
    ledger.confirm(threadIntent.intentId, thread.id);
    recorder.step('create-thread', { response: thread });

    recorder.step('get-thread', { response: await client.get(ENDPOINTS.thread(thread.id)) });
    recorder.step('delete-thread', { response: await client.delete(ENDPOINTS.thread(thread.id)) });
    ledger.markDeleted(threadIntent.intentId);
    recorder.step('delete-assistant', { response: await client.delete(ENDPOINTS.assistant(assistant.id)) });
    ledger.markDeleted(intent.intentId);
  },

  'P2-basic-turn': async ({ client, ledger, recorder }) => {
    const assistantIntent = ledger.recordIntent({ kind: 'assistant', probe: 'P2', name: 'traceloop-spike-P2-assistant' });
    const assistant = await client.post<{ id: string }>(ENDPOINTS.assistants, {
      name: 'traceloop-spike-P2-assistant',
      system_prompt: 'You are a spike fixture.',
    });
    ledger.confirm(assistantIntent.intentId, assistant.id);

    const threadIntent = ledger.recordIntent({ kind: 'thread', probe: 'P2', name: 'traceloop-spike-P2-thread' });
    const thread = await client.post<{ id: string }>(ENDPOINTS.threads, { assistant_id: assistant.id });
    ledger.confirm(threadIntent.intentId, thread.id);

    const msgResult = await client.post<{ id: string; run_id: string }>(ENDPOINTS.threadMessages(thread.id), {
      role: 'user',
      content: 'Hello',
    });
    recorder.step('create-message', { response: msgResult });

    // Poll for completion
    let runStatus = 'in_progress';
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const run = await client.get<{ status: string }>(ENDPOINTS.run(thread.id, msgResult.run_id));
      recorder.step(`poll-run-${i}`, { response: run });
      if (run.status === 'COMPLETED' || run.status === 'FAILED') {
        runStatus = run.status;
        break;
      }
    }
    recorder.step('final-status', { status: runStatus });

    await client.delete(ENDPOINTS.thread(thread.id));
    ledger.markDeleted(threadIntent.intentId);
    await client.delete(ENDPOINTS.assistant(assistant.id));
    ledger.markDeleted(assistantIntent.intentId);
  },

  'P3-tool-loop': async ({ client, ledger, recorder }) => {
    const assistantIntent = ledger.recordIntent({ kind: 'assistant', probe: 'P3', name: 'traceloop-spike-P3-assistant' });
    const assistant = await client.post<{ id: string }>(ENDPOINTS.assistants, {
      name: 'traceloop-spike-P3-assistant',
      system_prompt: 'You must call the submit_plan tool.',
      tools: [{
        type: 'function',
        function: {
          name: 'submit_plan',
          description: agentStageTools.submit_plan.description,
          parameters: { type: 'object', properties: { steps: { type: 'array' }, summary: { type: 'string' } } },
        },
      }],
    });
    ledger.confirm(assistantIntent.intentId, assistant.id);

    const threadIntent = ledger.recordIntent({ kind: 'thread', probe: 'P3', name: 'traceloop-spike-P3-thread' });
    const thread = await client.post<{ id: string }>(ENDPOINTS.threads, { assistant_id: assistant.id });
    ledger.confirm(threadIntent.intentId, thread.id);

    const msgResult = await client.post<{ id: string; run_id: string }>(ENDPOINTS.threadMessages(thread.id), {
      role: 'user',
      content: 'Create a plan',
    });

    const result = await driveToolLoop({
      getRun: async () => {
        const run = await client.get(ENDPOINTS.run(thread.id, msgResult.run_id));
        recorder.step('get-run', { response: run });
        return normalizeRun(run);
      },
      submitOutputs: async (outputs) => {
        recorder.step('submit-outputs', { outputs });
        await client.post(ENDPOINTS.submitToolOutputs(thread.id, msgResult.run_id), { tool_outputs: outputs });
      },
      executeTool: async (call) => {
        const args = parseToolArguments(call.argumentsRaw, agentStageTools.submit_plan.schema);
        return { toolCallId: call.id, output: { received: args } };
      },
      maxRounds: 3,
    });
    recorder.step('tool-loop-result', { result });

    await client.delete(ENDPOINTS.thread(thread.id));
    ledger.markDeleted(threadIntent.intentId);
    await client.delete(ENDPOINTS.assistant(assistant.id));
    ledger.markDeleted(assistantIntent.intentId);
  },

  'P4-parallel-tools': async ({ client, ledger, recorder }) => {
    // Similar to P3 but with multiple parallel tool calls
    recorder.step('note', { note: 'P4 parallel tools - similar to P3 with multiple calls' });
  },

  'P5-chained-rounds': async ({ client, ledger, recorder }) => {
    recorder.step('note', { note: 'P5 chained rounds - multiple tool rounds' });
  },

  'P6-malformed-args': async ({ client, ledger, recorder }) => {
    recorder.step('note', { note: 'P6 malformed args - Zod rejection before mutation' });
  },

  'P7-cancellation': async ({ client, ledger, recorder }) => {
    recorder.step('note', { note: 'P7 cancellation - timing and late results' });
  },

  'P8-memory': async ({ client, ledger, recorder }) => {
    const a1Intent = ledger.recordIntent({ kind: 'assistant', probe: 'P8', name: 'traceloop-spike-P8-a1' });
    const a1 = await client.post<{ id: string }>(ENDPOINTS.assistants, {
      name: 'traceloop-spike-P8-a1',
      system_prompt: 'You are a spike fixture.',
    });
    ledger.confirm(a1Intent.intentId, a1.id);

    const a2Intent = ledger.recordIntent({ kind: 'assistant', probe: 'P8', name: 'traceloop-spike-P8-a2' });
    const a2 = await client.post<{ id: string }>(ENDPOINTS.assistants, {
      name: 'traceloop-spike-P8-a2',
      system_prompt: 'You are a spike fixture.',
    });
    ledger.confirm(a2Intent.intentId, a2.id);

    // Write memory to a1
    const memIntent = ledger.recordIntent({ kind: 'memory', probe: 'P8', name: 'traceloop-spike-P8-mem' });
    const mem = await client.post<{ id: string }>(ENDPOINTS.memories, {
      assistant_id: a1.id,
      content: 'Test memory for isolation',
    });
    ledger.confirm(memIntent.intentId, mem.id);

    // Search a2 - MUST be empty (F12)
    const searchResult = await client.post<{ results: unknown[] }>(`${ENDPOINTS.assistant(a2.id)}/memories/search`, {
      query: 'isolation',
    });
    recorder.step('isolation-check', { result: searchResult, mustBeEmpty: searchResult.results.length === 0 });

    await client.delete(ENDPOINTS.memory(mem.id));
    ledger.markDeleted(memIntent.intentId);
    await client.delete(ENDPOINTS.assistant(a2.id));
    ledger.markDeleted(a2Intent.intentId);
    await client.delete(ENDPOINTS.assistant(a1.id));
    ledger.markDeleted(a1Intent.intentId);
  },

  'P9-documents': async ({ client, ledger, recorder }) => {
    recorder.step('note', { note: 'P9 documents - upload, indexing, deletion' });
  },

  'P10-reconciliation': async ({ client, ledger, recorder }) => {
    recorder.step('note', { note: 'P10 reconciliation - orphan detection via listing' });
  },
};
