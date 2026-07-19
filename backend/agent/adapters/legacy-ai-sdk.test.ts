import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('ai', () => ({ generateText: vi.fn(), generateObject: vi.fn() }));
vi.mock('../../llm/provider', () => ({ getLLMProvider: vi.fn(() => ({ modelId: 'test-model' })) }));

import { generateText, generateObject } from 'ai';
import { clarifyIntent, generatePlan, editSource, proposePatchLLM } from '../../llm/functions';
import { LegacyAiSdkRuntime } from './legacy-ai-sdk';

const mockGenerateText = vi.mocked(generateText);
const mockGenerateObject = vi.mocked(generateObject);

const runtime = new LegacyAiSdkRuntime();
const files = { 'src/main.c': 'int main() { return 0; }' };
const board = { name: 'STM32F4 Discovery', mcu: 'STM32F407VG', architecture: 'ARM Cortex-M4' };
const criteria = [{ name: 'led_on', register: 'GPIOD_ODR', expect: '1', byTime: 2000 }];
const rootCause = { time: 100, type: 'write', source: 'src/main.c', register: 'GPIOD_ODR',
  value: '0x2000', detail: 'wrote pin 13 not 12', label: 'GPIO write', lane: 'gpio' };

beforeEach(() => { vi.clearAllMocks(); });

describe('C3/F9: LegacyAiSdkRuntime parity with direct functions', () => {
  it('clarify: identical result and identical generateText args', async () => {
    mockGenerateText.mockResolvedValue({ text: '- Which LED?\n- What frequency?' } as never);
    const direct = await clarifyIntent('blink it', files);
    const directArgs = JSON.parse(JSON.stringify(mockGenerateText.mock.calls[0]));
    vi.clearAllMocks();
    mockGenerateText.mockResolvedValue({ text: '- Which LED?\n- What frequency?' } as never);
    const viaRuntime = await runtime.runStage({ stage: 'clarify', taskId: 't1', intent: 'blink it', files });
    expect(viaRuntime).toEqual({ kind: 'clarification', questions: direct!.questions });
    expect(JSON.parse(JSON.stringify(mockGenerateText.mock.calls[0]))).toEqual(directArgs);
  });

  it('clarify: NO_CLARIFICATION_NEEDED maps to questions: null', async () => {
    mockGenerateText.mockResolvedValue({ text: 'NO_CLARIFICATION_NEEDED' } as never);
    const viaRuntime = await runtime.runStage({ stage: 'clarify', taskId: 't1', intent: 'clear', files });
    expect(viaRuntime).toEqual({ kind: 'clarification', questions: null });
  });

  it('plan: identical result and identical generateObject args', async () => {
    const planObj = { steps: [{ file: 'src/main.c', action: 'modify' as const, description: 'd' }], summary: 's' };
    mockGenerateObject.mockResolvedValue({ object: planObj } as never);
    const direct = await generatePlan('intent', files, board, criteria);
    const directArgs = JSON.parse(JSON.stringify(mockGenerateObject.mock.calls[0]));
    vi.clearAllMocks();
    mockGenerateObject.mockResolvedValue({ object: planObj } as never);
    const viaRuntime = await runtime.runStage({ stage: 'plan', taskId: 't1', intent: 'intent', files, board, criteria });
    expect(viaRuntime).toEqual({ kind: 'plan', plan: direct });
    expect(JSON.parse(JSON.stringify(mockGenerateObject.mock.calls[0]))).toEqual(directArgs);
  });

  it('edit: identical operations/summary and identical args (including policy filtering)', async () => {
    const plan = { steps: [{ file: 'src/main.c', action: 'modify' as const, description: 'd' }], summary: 's' };
    const editResult = {
      operations: [
        { type: 'edit' as const, path: 'src/main.c', search: 'a', replace: 'b' },
        { type: 'edit' as const, path: '../escape.c', search: 'a', replace: 'b' }, // must be filtered by policy
      ],
      summary: 'edited',
    };
    mockGenerateObject.mockResolvedValue({ object: editResult } as never);
    const direct = await editSource(plan, files);
    const directArgs = JSON.parse(JSON.stringify(mockGenerateObject.mock.calls[0]));
    vi.clearAllMocks();
    mockGenerateObject.mockResolvedValue({ object: editResult } as never);
    const viaRuntime = await runtime.runStage({ stage: 'edit', taskId: 't1', plan, files });
    expect(viaRuntime).toEqual({ kind: 'operations', operations: direct.operations, summary: direct.summary });
    expect((viaRuntime as { operations: unknown[] }).operations).toHaveLength(1); // traversal filtered
    expect(JSON.parse(JSON.stringify(mockGenerateObject.mock.calls[0]))).toEqual(directArgs);
  });

  it('propose-patch: identical result; protected-file error passes through unwrapped', async () => {
    const patch = { file: 'src/main.c', before: 'a', after: 'b', summary: 's', confidence: 0.9 };
    mockGenerateObject.mockResolvedValue({ object: patch } as never);
    const direct = await proposePatchLLM(rootCause, files, criteria[0]!);
    const directArgs = JSON.parse(JSON.stringify(mockGenerateObject.mock.calls[0]));
    vi.clearAllMocks();
    mockGenerateObject.mockResolvedValue({ object: patch } as never);
    const viaRuntime = await runtime.runStage({ stage: 'propose-patch', taskId: 't1', rootCause, files, assertion: criteria[0]! });
    expect(viaRuntime).toEqual({ kind: 'patch', patch: direct });
    expect(JSON.parse(JSON.stringify(mockGenerateObject.mock.calls[0]))).toEqual(directArgs);

    // C3: errors must NOT be rewrapped — same message as the direct call
    vi.clearAllMocks();
    mockGenerateObject.mockResolvedValue({ object: { ...patch, file: 'tests/protected.test.c' } } as never);
    await expect(
      runtime.runStage({ stage: 'propose-patch', taskId: 't1', rootCause, files, assertion: criteria[0]! }),
    ).rejects.toThrow(/protected file/i);
  });
});

describe('unsupported operations fail with stable classes', () => {
  it('submitToolResults throws runtime-unsupported', async () => {
    await expect(
      runtime.submitToolResults({ taskId: 't1', providerRunRef: 'r', outputs: [] }),
    ).rejects.toMatchObject({ errorClass: 'runtime-unsupported' });
  });

  it('getConversation returns an empty view; cancel is a no-op', async () => {
    expect(await runtime.getConversation({ taskId: 't1' })).toEqual({ messages: [] });
    await expect(runtime.cancel({ taskId: 't1' })).resolves.toBeUndefined();
  });
});
