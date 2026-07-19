import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SpikeLedger } from './ledger';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'spike-ledger-'));
});

describe('SpikeLedger', () => {
  it('F4: recordIntent persists BEFORE any id is known (write-ahead)', () => {
    const ledger = new SpikeLedger(join(dir, 'ledger.jsonl'));
    const intent = ledger.recordIntent({ kind: 'assistant', probe: 'P1', name: 'traceloop-spike-a1' });
    const onDisk = readFileSync(join(dir, 'ledger.jsonl'), 'utf8');
    expect(onDisk).toContain('traceloop-spike-a1');
    expect(onDisk).toContain('"externalId":null');
    ledger.confirm(intent.intentId, 'asst_123');
    expect(ledger.pendingDeletions()).toHaveLength(1);
    expect(ledger.pendingDeletions()[0]!.externalId).toBe('asst_123');
  });

  it('an unconfirmed intent still appears as an orphan candidate', () => {
    const ledger = new SpikeLedger(join(dir, 'ledger.jsonl'));
    ledger.recordIntent({ kind: 'thread', probe: 'P2', name: 'traceloop-spike-t1' });
    expect(ledger.orphanCandidates()).toHaveLength(1);
  });

  it('F14: markDeleted is idempotent and removes from pendingDeletions', () => {
    const ledger = new SpikeLedger(join(dir, 'ledger.jsonl'));
    const i = ledger.recordIntent({ kind: 'assistant', probe: 'P1', name: 'traceloop-spike-a2' });
    ledger.confirm(i.intentId, 'asst_9');
    ledger.markDeleted(i.intentId);
    ledger.markDeleted(i.intentId); // second call must not throw
    expect(ledger.pendingDeletions()).toHaveLength(0);
  });

  it('reloads state from disk (crash recovery)', () => {
    const path = join(dir, 'ledger.jsonl');
    const a = new SpikeLedger(path);
    const i = a.recordIntent({ kind: 'memory', probe: 'P8', name: 'traceloop-spike-m1' });
    a.confirm(i.intentId, 'mem_1');
    const b = new SpikeLedger(path); // fresh instance, same file
    expect(b.pendingDeletions().map((r) => r.externalId)).toEqual(['mem_1']);
  });
});
