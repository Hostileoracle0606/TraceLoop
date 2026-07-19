// Deletes every confirmed, undeleted spike resource. Idempotent (F14): 404s count as deleted.
import { BackboardClient } from '../../backend/agent/adapters/backboard/client';
import { ENDPOINTS } from '../../backend/agent/adapters/backboard/endpoints';
import { SpikeLedger } from '../../backend/agent/spike/ledger';
import { AgentProviderError } from '../../backend/agent/errors';

const paths = {
  assistant: ENDPOINTS.assistant,
  thread: ENDPOINTS.thread,
  memory: ENDPOINTS.memory,
  document: ENDPOINTS.document,
} as const;

async function main() {
  const { BACKBOARD_LIVE, BACKBOARD_API_KEY, BACKBOARD_BASE_URL } = process.env;
  if (BACKBOARD_LIVE !== '1' || !BACKBOARD_API_KEY || !BACKBOARD_BASE_URL) {
    console.error('Refusing to run: set BACKBOARD_LIVE=1, BACKBOARD_API_KEY, BACKBOARD_BASE_URL.');
    process.exit(1);
  }
  const client = new BackboardClient({ baseUrl: BACKBOARD_BASE_URL, apiKey: BACKBOARD_API_KEY });
  const ledger = new SpikeLedger('.scratch/backboard-agent-runtime/spike-resources.jsonl');

  for (const record of ledger.pendingDeletions()) {
    const toPath = paths[record.kind as keyof typeof paths];
    if (!toPath || !record.externalId) continue;
    try {
      await client.delete(toPath(record.externalId));
      ledger.markDeleted(record.intentId);
      console.log(`deleted ${record.kind} ${record.externalId}`);
    } catch (e) {
      if (e instanceof AgentProviderError && e.errorClass === 'provider-resource-missing') {
        ledger.markDeleted(record.intentId); // already gone — count as deleted
      } else {
        console.error(`FAILED ${record.kind} ${record.externalId}:`, e);
      }
    }
  }
  const orphans = ledger.orphanCandidates();
  if (orphans.length > 0) {
    console.warn(`⚠ ${orphans.length} unconfirmed intents — reconcile by listing remote resources named 'traceloop-spike-*' (P10).`);
  }
}

main();
