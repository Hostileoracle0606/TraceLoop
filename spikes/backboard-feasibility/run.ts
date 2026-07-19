// Usage: BACKBOARD_LIVE=1 BACKBOARD_API_KEY=... BACKBOARD_BASE_URL=... \
//          npx tsx spikes/backboard-feasibility/run.ts --probe <name> | --all
import { BackboardClient } from '../../backend/agent/adapters/backboard/client';
import { SpikeLedger } from '../../backend/agent/spike/ledger';
import { TranscriptRecorder } from '../../backend/agent/spike/transcript';
import { probes } from './probes';

const RESULTS_DIR = '.scratch/backboard-agent-runtime/spike-results';
const LEDGER_PATH = '.scratch/backboard-agent-runtime/spike-resources.jsonl';

async function main() {
  const { BACKBOARD_LIVE, BACKBOARD_API_KEY, BACKBOARD_BASE_URL } = process.env;
  if (BACKBOARD_LIVE !== '1' || !BACKBOARD_API_KEY || !BACKBOARD_BASE_URL) {
    console.error('Refusing to run: set BACKBOARD_LIVE=1, BACKBOARD_API_KEY, BACKBOARD_BASE_URL. (C7: never runs in CI.)');
    process.exit(1);
  }

  const argIndex = process.argv.indexOf('--probe');
  const selected = process.argv.includes('--all')
    ? Object.keys(probes)
    : argIndex !== -1 ? [process.argv[argIndex + 1]!] : [];
  if (selected.length === 0) {
    console.error(`Usage: --probe <${Object.keys(probes).join('|')}> | --all`);
    process.exit(1);
  }

  const client = new BackboardClient({ baseUrl: BACKBOARD_BASE_URL, apiKey: BACKBOARD_API_KEY });
  const ledger = new SpikeLedger(LEDGER_PATH);

  for (const name of selected) {
    const probe = probes[name];
    if (!probe) { console.error(`Unknown probe: ${name}`); process.exit(1); }
    const recorder = new TranscriptRecorder(RESULTS_DIR, name);
    console.log(`▶ ${name}`);
    try {
      await probe({ client, ledger, recorder });
      console.log(`✓ ${name}`);
    } catch (e) {
      recorder.step('probe-error', { error: e instanceof Error ? { name: e.name, message: e.message } : String(e) });
      console.error(`✗ ${name}:`, e);
    } finally {
      recorder.flush();
    }
  }
  console.log(`Pending deletions: ${ledger.pendingDeletions().length} (run cleanup.ts)`);
}

main();
