import { describe, expect, it } from 'vitest';
import { checkPipelineBudget, materializePatch } from './pipeline-guard';

const task = {
  iteration: 0,
  maxIterations: 3,
  maxTimeMs: 60_000,
  maxCostUsd: 500,
  startedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('checkPipelineBudget', () => {
  it('enforces iteration, time, and cent-denominated cost limits', () => {
    const now = new Date('2026-01-01T00:00:30.000Z').getTime();
    expect(checkPipelineBudget(task, 2, 499, now)).toBeNull();
    expect(checkPipelineBudget(task, 3, 0, now)?.kind).toBe('iterations');
    expect(checkPipelineBudget(task, 0, 500, now)?.kind).toBe('cost');
    expect(checkPipelineBudget(task, 0, 0, now + 30_000)?.kind).toBe('time');
  });
});

describe('materializePatch', () => {
  const proposal = {
    file: 'src/main.c',
    before: 'return 0;',
    after: 'return 1;',
    summary: 'Fix return value',
    confidence: 0.9,
  };

  it('applies one exact validated replacement', () => {
    expect(materializePatch({ 'src/main.c': 'int main(void) { return 0; }' }, proposal))
      .toEqual({ 'src/main.c': 'int main(void) { return 1; }' });
  });

  it('rejects missing, empty, ambiguous, and protected targets', () => {
    expect(() => materializePatch({}, proposal)).toThrow('does not exist');
    expect(() => materializePatch({ 'src/main.c': 'return 0; return 0;' }, proposal)).toThrow('ambiguous');
    expect(() => materializePatch({ 'src/main.c': 'return 0;' }, { ...proposal, before: '' })).toThrow('non-empty');
    expect(() => materializePatch({ 'tests/main.test.c': 'return 0;' }, { ...proposal, file: 'tests/main.test.c' })).toThrow('protected');
  });
});
