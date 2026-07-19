import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export type SpikeResourceKind = 'assistant' | 'thread' | 'message' | 'memory' | 'document';

interface LedgerEvent {
  event: 'intent' | 'confirm' | 'deleted';
  intentId: string;
  kind?: SpikeResourceKind;
  probe?: string;
  name?: string;
  externalId?: string | null;
  at: string;
}

export interface LedgerRecord {
  intentId: string;
  kind: SpikeResourceKind;
  probe: string;
  name: string;
  externalId: string | null;
  deleted: boolean;
}

/**
 * Write-ahead JSONL ledger for spike resources (F4/F14): the intent to create
 * is durable BEFORE the network call, so a crash between request and response
 * still leaves a searchable orphan candidate.
 */
export class SpikeLedger {
  private records = new Map<string, LedgerRecord>();

  constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
    if (existsSync(path)) {
      for (const line of readFileSync(path, 'utf8').split('\n').filter(Boolean)) {
        this.apply(JSON.parse(line) as LedgerEvent);
      }
    }
  }

  recordIntent(input: { kind: SpikeResourceKind; probe: string; name: string }): LedgerRecord {
    const event: LedgerEvent = {
      event: 'intent',
      intentId: randomUUID(),
      ...input,
      externalId: null,
      at: new Date().toISOString(),
    };
    this.write(event);
    return this.records.get(event.intentId)!;
  }

  confirm(intentId: string, externalId: string): void {
    this.write({ event: 'confirm', intentId, externalId, at: new Date().toISOString() });
  }

  markDeleted(intentId: string): void {
    if (this.records.get(intentId)?.deleted) return;
    this.write({ event: 'deleted', intentId, at: new Date().toISOString() });
  }

  /** Confirmed, not-yet-deleted resources — the cleanup work list. */
  pendingDeletions(): LedgerRecord[] {
    return [...this.records.values()].filter((r) => r.externalId !== null && !r.deleted);
  }

  /** Intents that never confirmed — candidates for remote-listing reconciliation. */
  orphanCandidates(): LedgerRecord[] {
    return [...this.records.values()].filter((r) => r.externalId === null && !r.deleted);
  }

  private write(event: LedgerEvent): void {
    appendFileSync(this.path, JSON.stringify(event) + '\n');
    this.apply(event);
  }

  private apply(event: LedgerEvent): void {
    if (event.event === 'intent') {
      this.records.set(event.intentId, {
        intentId: event.intentId,
        kind: event.kind!,
        probe: event.probe!,
        name: event.name!,
        externalId: null,
        deleted: false,
      });
    } else {
      const record = this.records.get(event.intentId);
      if (!record) return;
      if (event.event === 'confirm') record.externalId = event.externalId ?? null;
      if (event.event === 'deleted') record.deleted = true;
    }
  }
}
