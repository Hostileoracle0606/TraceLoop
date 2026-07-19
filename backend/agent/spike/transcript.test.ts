import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TranscriptRecorder } from './transcript';

describe('TranscriptRecorder', () => {
  it('writes numbered steps with redacted auth material to <probe>.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spike-tr-'));
    const t = new TranscriptRecorder(dir, 'P3-tool-loop');
    t.step('create-run', { request: { headers: { authorization: 'Bearer sk-secret' } }, response: { id: 'run_1' } });
    t.flush();
    const written = JSON.parse(readFileSync(join(dir, 'P3-tool-loop.json'), 'utf8'));
    expect(written.probe).toBe('P3-tool-loop');
    expect(written.steps).toHaveLength(1);
    expect(JSON.stringify(written)).not.toContain('sk-secret');
    expect(JSON.stringify(written)).toContain('[REDACTED]');
  });
});
