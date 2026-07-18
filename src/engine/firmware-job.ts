import type { TraceEvent } from './types';
import { parseRenodeLog } from './renode-parser';

// The seam between the CONTROL PLANE (this app: engine, dashboard, agent loop)
// and the COMPUTE PLANE (Modal: isolated per-job containers that build firmware
// with the Zephyr toolchain and simulate it in Renode). See docs/adr/0004.
//
// Modal is a *pure toolchain runner*: it takes the agent's source, runs
// `west build` + Renode, and returns the build log + the raw Renode trace log.
// ALL causal analysis stays in the control-plane engine — the compute plane
// never runs the analyzer, so the IP lives in one place and stays testable.

/** The firmware source the agent authored: path (relative to the app root) -> contents. */
export interface FirmwareFiles {
  [path: string]: string;
}

export interface FirmwareJobRequest {
  files: FirmwareFiles;
  /** Zephyr board target, e.g. 'stm32f4_disco' */
  board: string;
}

export interface FirmwareJobResult {
  /** result of `west build` in the isolated container */
  build: { ok: boolean; log: string };
  /** raw Renode trace log — present only when build.ok is true */
  trace?: { log: string };
}

/** The abstract runner; ModalFirmwareJobRunner is the production impl. */
export interface FirmwareJobRunner {
  run(req: FirmwareJobRequest): Promise<FirmwareJobResult>;
}

/** What the control plane resolves a job result into for the agent loop. */
export type RunOutcome =
  | { status: 'build-failed'; buildLog: string }
  | { status: 'ran'; trace: TraceEvent[] };

export function outcomeFromJob(result: FirmwareJobResult): RunOutcome {
  if (!result.build.ok) {
    return { status: 'build-failed', buildLog: result.build.log };
  }
  if (!result.trace) {
    throw new Error('build succeeded but no trace was returned');
  }
  return { status: 'ran', trace: parseRenodeLog(result.trace.log) };
}

/** Production runner: POSTs the job to the deployed Modal web endpoint. */
export class ModalFirmwareJobRunner implements FirmwareJobRunner {
  constructor(private readonly endpoint: string) {}

  async run(req: FirmwareJobRequest): Promise<FirmwareJobResult> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      throw new Error(`Modal firmware job failed: HTTP ${res.status}`);
    }
    return (await res.json()) as FirmwareJobResult;
  }
}
