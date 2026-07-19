import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SECRET_PATTERN = /(Bearer\s+)[A-Za-z0-9._-]+|(sk-[A-Za-z0-9._-]+)/g;

function redact(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value).replace(SECRET_PATTERN, '$1[REDACTED]'));
}

export class TranscriptRecorder {
  private steps: Array<{ n: number; label: string; at: string; data: unknown }> = [];

  constructor(private readonly outDir: string, private readonly probe: string) {
    mkdirSync(outDir, { recursive: true });
  }

  step(label: string, data: unknown): void {
    this.steps.push({ n: this.steps.length + 1, label, at: new Date().toISOString(), data: redact(data) });
  }

  flush(): void {
    writeFileSync(
      join(this.outDir, `${this.probe}.json`),
      JSON.stringify({ probe: this.probe, capturedAt: new Date().toISOString(), steps: this.steps }, null, 2),
    );
  }
}
