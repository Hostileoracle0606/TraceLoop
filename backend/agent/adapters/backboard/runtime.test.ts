import { describe, it, expect, vi } from 'vitest';
import { BackboardAgentRuntime } from './runtime';

describe('C9/F16: skeleton rejects everything before any I/O', () => {
  const fetchSpy = vi.fn();
  const runtime = new BackboardAgentRuntime({
    enabled: false,
    apiKey: 'sk-test',
    baseUrl: 'https://backboard.example/api',
    fetchImpl: fetchSpy as unknown as typeof fetch,
  });

  it('every method throws runtime-disabled when the flag is off', async () => {
    await expect(runtime.ensureProjectConversationScope({ projectId: 'p', userId: 'u' }))
      .rejects.toMatchObject({ errorClass: 'runtime-disabled' });
    await expect(runtime.ensureTaskConversation({ projectId: 'p', taskId: 't', userId: 'u' }))
      .rejects.toMatchObject({ errorClass: 'runtime-disabled' });
    await expect(runtime.runStage({ stage: 'clarify', taskId: 't', intent: 'x', files: {} }))
      .rejects.toMatchObject({ errorClass: 'runtime-disabled' });
    await expect(runtime.submitToolResults({ taskId: 't', providerRunRef: 'r', outputs: [] }))
      .rejects.toMatchObject({ errorClass: 'runtime-disabled' });
    await expect(runtime.getConversation({ taskId: 't' }))
      .rejects.toMatchObject({ errorClass: 'runtime-disabled' });
    await expect(runtime.cancel({ taskId: 't' }))
      .rejects.toMatchObject({ errorClass: 'runtime-disabled' });
  });

  it('performs zero network I/O while rejecting', () => {
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('when enabled, stage methods throw runtime-unsupported (implemented in issue 09) — still no I/O', async () => {
    const enabled = new BackboardAgentRuntime({
      enabled: true, apiKey: 'sk-test', baseUrl: 'https://backboard.example/api',
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });
    await expect(enabled.runStage({ stage: 'clarify', taskId: 't', intent: 'x', files: {} }))
      .rejects.toMatchObject({ errorClass: 'runtime-unsupported' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
