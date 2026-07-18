import type { Assertion, RunViewModel } from './types';
import type { FirmwareFiles, FirmwareJobRunner } from './firmware-job';
import { outcomeFromJob } from './firmware-job';
import { analyze } from './analyze';

// The bounded, stateful authoring loop (see docs/user-interaction-flow.md
// "Agent loop behavior"): author → build+simulate (compute plane) → analyze →
// patch → rerun, until the assertion passes or the iteration budget is spent.
// It is deliberately NOT an unbounded while-loop, and it never claims success
// on a build alone — success requires the behavior observed in simulation.

/**
 * Demo-scoped GPIO pin → devicetree LED symbol map, from the stm32f4_disco
 * overlay. A production system derives these from the devicetree, not a constant.
 */
const LED_SYMBOL: Record<number, string> = { 12: 'green_led', 13: 'orange_led' };

function pinOf(register: string): number {
  return Number(register.match(/\[(\d+)\]/)?.[1] ?? -1);
}

export interface Patch {
  file: string;
  summary: string;
  /** the exact source fragment being replaced, and its replacement (for the diff UI) */
  before: string;
  after: string;
  files: FirmwareFiles;
}

/**
 * Propose a source patch from a failed run: write the EXPECTED LED (from the
 * assertion) instead of the wrongly-written one (from the root cause).
 */
export function proposePatch(
  files: FirmwareFiles,
  wrongRegister: string,
  expectedRegister: string,
): Patch {
  const wrongSym = LED_SYMBOL[pinOf(wrongRegister)];
  const expectedSym = LED_SYMBOL[pinOf(expectedRegister)];
  const file = 'src/main.c';
  const src = files[file] ?? '';

  const before = `gpio_pin_set_dt(&${wrongSym}, 1)`;
  const after = `gpio_pin_set_dt(&${expectedSym}, 1)`;
  const patched = wrongSym && expectedSym ? src.replace(before, after) : src;

  return {
    file,
    summary: `Write the expected LED (${expectedSym}, GPIO pin ${pinOf(expectedRegister)}) instead of ${wrongSym} (pin ${pinOf(wrongRegister)}) in the handler.`,
    before,
    after,
    files: { ...files, [file]: patched },
  };
}

export interface AuthoringRequest {
  files: FirmwareFiles;
  assertion: Assertion;
  board: string;
}

export interface AuthoringOptions {
  maxIterations: number;
}

export type LoopResult =
  | { status: 'passed'; vm: RunViewModel; files: FirmwareFiles; iterations: number }
  | { status: 'build-failed'; buildLog: string; iterations: number }
  | { status: 'gave-up'; vm: RunViewModel; files: FirmwareFiles; iterations: number };

export async function runAuthoringLoop(
  req: AuthoringRequest,
  runner: FirmwareJobRunner,
  opts: AuthoringOptions,
): Promise<LoopResult> {
  let files = req.files;
  let iterations = 0;
  let lastVm: RunViewModel | undefined;

  while (iterations < opts.maxIterations) {
    iterations++;

    const outcome = outcomeFromJob(await runner.run({ files, board: req.board }));
    if (outcome.status === 'build-failed') {
      // Never analyze a run that didn't happen — hand the compiler log back.
      return { status: 'build-failed', buildLog: outcome.buildLog, iterations };
    }

    const vm = analyze(outcome.trace, req.assertion);
    lastVm = vm;
    if (vm.status === 'passed') {
      return { status: 'passed', vm, files, iterations };
    }

    // Failed: propose a patch from the root cause and rerun next iteration.
    if (vm.rootCause) {
      files = proposePatch(files, vm.rootCause.register, req.assertion.register).files;
    }
  }

  return { status: 'gave-up', vm: lastVm as RunViewModel, files, iterations };
}
