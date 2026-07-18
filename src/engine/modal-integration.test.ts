import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ModalFirmwareJobRunner, outcomeFromJob } from './firmware-job';
import { analyze } from './analyze';
import { greenLedAssertion } from '../fixtures/timer2-wrong-pin';

const ENDPOINT = process.env.MODAL_ENDPOINT ??
  'https://hostileoracle0606--traceloop-firmware-job-firmware-job.modal.run';

// Read the demo firmware files — the same ones the agent would author.
const firmwareFiles = {
  'src/main.c': readFileSync(
    new URL('../../firmware-zephyr/timer2-wrong-pin/src/main.c', import.meta.url),
    'utf8',
  ),
  'CMakeLists.txt': readFileSync(
    new URL('../../firmware-zephyr/timer2-wrong-pin/CMakeLists.txt', import.meta.url),
    'utf8',
  ),
  'prj.conf': readFileSync(
    new URL('../../firmware-zephyr/timer2-wrong-pin/prj.conf', import.meta.url),
    'utf8',
  ),
  'boards/stm32f4_disco.overlay': readFileSync(
    new URL('../../firmware-zephyr/timer2-wrong-pin/boards/stm32f4_disco.overlay', import.meta.url),
    'utf8',
  ),
};

describe('Modal integration', () => {
  it('builds the Zephyr firmware and returns a build log', async () => {
    const runner = new ModalFirmwareJobRunner(ENDPOINT);

    const result = await runner.run({
      files: firmwareFiles,
      board: 'stm32f4_disco',
    });

    // The build should succeed — this is the known-good demo firmware.
    expect(result.build.ok).toBe(true);
    expect(result.build.log).toBeTruthy();
    expect(result.build.log.length).toBeGreaterThan(100);

    // If build succeeded, a trace should be present.
    expect(result.trace).toBeDefined();
    expect(result.trace!.log).toBeTruthy();
  }, 360_000); // 6-minute timeout — Modal builds can be slow on cold start

  it('the full pipeline: Modal build → Renode trace → causal engine → blames pin 13', async () => {
    const runner = new ModalFirmwareJobRunner(ENDPOINT);

    const result = await runner.run({
      files: firmwareFiles,
      board: 'stm32f4_disco',
    });

    expect(result.build.ok).toBe(true);
    expect(result.trace).toBeDefined();

    // Convert the job result into a RunOutcome (the control-plane seam)
    const outcome = outcomeFromJob(result);
    expect(outcome.status).toBe('ran');

    if (outcome.status !== 'ran') return;

    // Run the causal engine on the real Renode trace from Modal
    const vm = analyze(outcome.trace, greenLedAssertion);

    // The engine should blame the pin-13 write — same as the synthetic fixture
    expect(vm.status).toBe('failed');
    expect(vm.rootCause?.register).toBe('GPIOG_ODR[13]');
    expect(vm.rootCauseText).toContain('GPIOG_ODR[13]');
    expect(vm.rootCauseText).toContain('GPIOG_ODR[12]');
  }, 360_000);
});
