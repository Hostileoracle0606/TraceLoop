import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '../../..');

/** Directories whose files MAY reference backboard (adapter + spike + this test). */
const ALLOWLIST = [
  'backend/agent/adapters/backboard',
  'backend/agent/spike',
  'backend/agent/__tests__',
  'backend/agent/runtime-selection.ts', // sole composition point
  'spikes',
];

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (['node_modules', '.git', 'dist', '.claude', '.scratch', 'graphify-out'].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry)) yield full;
  }
}

describe('C2/F7: backboard types never escape the adapter', () => {
  it('no source outside the allowlist mentions backboard imports', () => {
    const violations: string[] = [];
    for (const dir of ['backend', 'src', 'frontend/src']) {
      for (const file of walk(join(ROOT, dir))) {
        const rel = relative(ROOT, file).replace(/\\/g, '/');
        if (ALLOWLIST.some((allowed) => rel.startsWith(allowed))) continue;
        const source = readFileSync(file, 'utf8');
        if (/from\s+['"][^'"]*backboard[^'"]*['"]/i.test(source)) violations.push(rel);
      }
    }
    expect(violations).toEqual([]);
  });
});
