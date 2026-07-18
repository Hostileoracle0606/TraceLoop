// The dashboard's data source: computed LIVE from the engine on load.
// The trace now comes from a REAL Renode run of the Zephyr demo firmware
// (renode/timer2-zephyr.resc → parseRenodeLog → renode-trace.json), fed
// through the same analyze() → toDashboardRun() path the engine tests
// exercise. Substrate is Zephyr per docs/adr/0002 — this is no longer the
// bare-metal ticket-04 build.
import { analyze } from '@engine/analyze';
import { toDashboardRun } from '@engine/serialize';
import { greenLedAssertion } from '@fixtures/timer2-wrong-pin';
import type { TraceEvent } from '@engine/types';
import renodeTrace from './renode-trace.json';

const vm = analyze(renodeTrace as unknown as TraceEvent[], greenLedAssertion);

export const runData = {
  ...toDashboardRun(vm, {
    id: 'RUN-1042',
    commit: '8c47a1d',
    board: 'STM32F4 Discovery (Zephyr)',
    branch: 'agent/timer2-led',
  }),
  rootCauseText: vm.rootCauseText,
};
