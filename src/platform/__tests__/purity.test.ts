import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    if (e === '__fixtures__' || e === '__tests__') continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (e.endsWith('.ts') && !e.endsWith('.test.ts')) yield full;
  }
}

describe('C1: src/platform is pure', () => {
  it('no production file imports db/fetch/Date.now/Math.random (crypto hash + Date-free only)', () => {
    const banned = [/from ['"].*\/db['"]/, /\bfetch\s*\(/, /Date\.now\s*\(/, /Math\.random\s*\(/, /new Date\s*\(/];
    const offenders: string[] = [];
    for (const file of walk(ROOT)) {
      const src = readFileSync(file, 'utf8');
      if (banned.some((re) => re.test(src))) offenders.push(file.replace(ROOT, 'src/platform'));
    }
    expect(offenders).toEqual([]);
  });
});
