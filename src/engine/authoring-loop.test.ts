import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { proposePatch, runAuthoringLoop } from './authoring-loop';
import { greenLedAssertion } from '../fixtures/timer2-wrong-pin';
import type { FirmwareJobRunner, FirmwareJobRequest, FirmwareJobResult } from './firmware-job';

const zephyrLog = readFileSync(new URL('./__fixtures__/renode-zephyr-sample.log', import.meta.url), 'utf8');
const mainC = readFileSync(
  new URL('../../firmware-zephyr/timer2-wrong-pin/src/main.c', import.meta.url),
  'utf8',
);

// A fake compute plane: builds always succeed; the trace depends on which LED the
// ISR writes — orange (bug, pin 13 = 0x2000) or green (fixed, pin 12 = 0x1000).
function fakeCompute(): FirmwareJobRunner {
  return {
    async run(req: FirmwareJobRequest): Promise<FirmwareJobResult> {
      const src = req.files['src/main.c'] ?? '';
      const writesOrange = /gpio_pin_set_dt\(&orange_led, 1\)/.test(src);
      const log = writesOrange
        ? zephyrLog
        : zephyrLog.replace('BitSet), value 0x2000', 'BitSet), value 0x1000');
      return { build: { ok: true, log: 'built ok' }, trace: { log } };
    },
  };
}

describe('proposePatch', () => {
  it('swaps the wrong-pin LED write for the expected pin', () => {
    const patch = proposePatch(
      { 'src/main.c': 'ISR() { gpio_pin_set_dt(&orange_led, 1); }' },
      'GPIOG_ODR[13]',
      'GPIOG_ODR[12]',
    );

    expect(patch.files['src/main.c']).toContain('gpio_pin_set_dt(&green_led, 1)');
    expect(patch.files['src/main.c']).not.toContain('gpio_pin_set_dt(&orange_led, 1)');
    expect(patch.summary).toMatch(/green|pin 12/i);

    // The exact before/after lines, so the UI can render the diff.
    expect(patch.before).toBe('gpio_pin_set_dt(&orange_led, 1)');
    expect(patch.after).toBe('gpio_pin_set_dt(&green_led, 1)');
  });
});

describe('runAuthoringLoop', () => {
  it('converges: patches the buggy firmware so the rerun passes', async () => {
    const result = await runAuthoringLoop(
      { files: { 'src/main.c': mainC }, assertion: greenLedAssertion, board: 'stm32f4_disco' },
      fakeCompute(),
      { maxIterations: 3 },
    );

    expect(result.status).toBe('passed');
    if (result.status === 'passed') {
      expect(result.iterations).toBe(2); // iter1 fails + patches, iter2 passes
      expect(result.files['src/main.c']).toContain('gpio_pin_set_dt(&green_led, 1)');
    }
  });

  it('surfaces a build failure without analyzing a nonexistent trace', async () => {
    const failing: FirmwareJobRunner = {
      async run() {
        return { build: { ok: false, log: "src/main.c:52: error: 'grn_led' undeclared" } };
      },
    };

    const result = await runAuthoringLoop(
      { files: { 'src/main.c': mainC }, assertion: greenLedAssertion, board: 'stm32f4_disco' },
      failing,
      { maxIterations: 3 },
    );

    expect(result.status).toBe('build-failed');
    if (result.status === 'build-failed') {
      expect(result.buildLog).toContain('undeclared');
    }
  });

  it('gives up after maxIterations if it never converges', async () => {
    // A compute plane that ignores the source and always returns the buggy trace.
    const stuck: FirmwareJobRunner = {
      async run() {
        return { build: { ok: true, log: 'ok' }, trace: { log: zephyrLog } };
      },
    };

    const result = await runAuthoringLoop(
      { files: { 'src/main.c': mainC }, assertion: greenLedAssertion, board: 'stm32f4_disco' },
      stuck,
      { maxIterations: 2 },
    );

    expect(result.status).toBe('gave-up');
    if (result.status === 'gave-up') {
      expect(result.iterations).toBe(2);
    }
  });
});
