import { describe, it, expect, vi } from 'vitest';
import { normalizeRun, driveToolLoop, type NormalizedRun } from './normalize';
import { AgentProviderError } from '../../errors';
import requiresAction from './__fixtures__/run-shapes/requires-action.json';
import completed from './__fixtures__/run-shapes/completed.json';

describe('normalizeRun', () => {
  it('normalizes a REQUIRES_ACTION run with tool calls', () => {
    const run = normalizeRun(requiresAction);
    expect(run.status).toBe('requires_action');
    expect(run.toolCalls.length).toBeGreaterThan(0);
    expect(run.toolCalls[0]).toHaveProperty('id');
    expect(run.toolCalls[0]).toHaveProperty('name');
    expect(run.toolCalls[0]).toHaveProperty('argumentsRaw');
  });

  it('normalizes a completed run with final text', () => {
    const run = normalizeRun(completed);
    expect(run.status).toBe('completed');
    expect(typeof run.finalText).toBe('string');
  });

  it('throws provider-malformed-response on an unrecognizable shape', () => {
    try {
      normalizeRun({ nothing: 'here' });
      expect.unreachable();
    } catch (e) {
      expect((e as AgentProviderError).errorClass).toBe('provider-malformed-response');
    }
  });
});

function makeRun(partial: Partial<NormalizedRun>): NormalizedRun {
  return { id: 'r1', status: 'in_progress', toolCalls: [], raw: {}, ...partial };
}

describe('driveToolLoop', () => {
  it('F2: submits ALL parallel outputs together, including error payloads', async () => {
    const states: NormalizedRun[] = [
      makeRun({
        status: 'requires_action',
        toolCalls: [
          { id: 'c1', name: 'submit_plan', argumentsRaw: '{}' },
          { id: 'c2', name: 'report_blocker', argumentsRaw: '{}' },
        ],
      }),
      makeRun({ status: 'completed', finalText: 'done' }),
    ];
    let i = 0;
    const submitOutputs = vi.fn(async (_outputs: Array<{ toolCallId: string; output: unknown }>) => {});
    const result = await driveToolLoop({
      getRun: async () => states[i++]!,
      submitOutputs,
      executeTool: async (call) => {
        if (call.id === 'c2') throw new Error('tool exploded');
        return { toolCallId: call.id, output: { ok: true } };
      },
      maxRounds: 3,
      sleep: async () => {},
    });
    expect(result.status).toBe('completed');
    expect(submitOutputs).toHaveBeenCalledTimes(1);
    const batch = submitOutputs.mock.calls[0]![0];
    expect(batch).toHaveLength(2);
    expect(batch.find((o) => o.toolCallId === 'c2')?.output).toHaveProperty('error');
  });

  it('F3: throws budget-exceeded after maxRounds', async () => {
    const requiresForever = makeRun({
      status: 'requires_action',
      toolCalls: [{ id: 'c1', name: 'submit_plan', argumentsRaw: '{}' }],
    });
    await expect(
      driveToolLoop({
        getRun: async () => requiresForever,
        submitOutputs: async () => {},
        executeTool: async (c) => ({ toolCallId: c.id, output: {} }),
        maxRounds: 2,
        sleep: async () => {},
      }),
    ).rejects.toMatchObject({ errorClass: 'budget-exceeded' });
  });

  it('F11: stops without submitting when the run is cancelled', async () => {
    const submitOutputs = vi.fn(async () => {});
    const result = await driveToolLoop({
      getRun: async () => makeRun({ status: 'cancelled' }),
      submitOutputs,
      executeTool: async (c) => ({ toolCallId: c.id, output: {} }),
      maxRounds: 3,
      sleep: async () => {},
    });
    expect(result.status).toBe('cancelled');
    expect(submitOutputs).not.toHaveBeenCalled();
  });
});
