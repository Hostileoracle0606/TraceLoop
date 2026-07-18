import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { outcomeFromJob, type FirmwareJobResult } from './firmware-job';
import { analyze } from './analyze';
import { greenLedAssertion } from '../fixtures/timer2-wrong-pin';

const zephyrLog = readFileSync(new URL('./__fixtures__/renode-zephyr-sample.log', import.meta.url), 'utf8');

describe('outcomeFromJob', () => {
  it('surfaces the compiler log (not a trace) when the isolated build fails', () => {
    // When the agent authors firmware that doesn't compile, the Modal job returns
    // the build log and no trace. The control plane must hand that back so the
    // agent can fix it — not attempt to analyze a run that never happened.
    const result: FirmwareJobResult = {
      build: { ok: false, log: "src/main.c:52: error: 'grn_led' undeclared" },
    };

    const outcome = outcomeFromJob(result);

    expect(outcome.status).toBe('build-failed');
    if (outcome.status === 'build-failed') {
      expect(outcome.buildLog).toContain('undeclared');
    }
  });

  it('parses the Renode trace into a causal chain when the isolated run succeeds', () => {
    const result: FirmwareJobResult = {
      build: { ok: true, log: 'Memory region ... 100%' },
      trace: { log: zephyrLog },
    };

    const outcome = outcomeFromJob(result);

    expect(outcome.status).toBe('ran');
    if (outcome.status === 'ran') {
      const vm = analyze(outcome.trace, greenLedAssertion);
      expect(vm.status).toBe('failed');
      expect(vm.rootCause.register).toBe('GPIOG_ODR[13]');
    }
  });
});
