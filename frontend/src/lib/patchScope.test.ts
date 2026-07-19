import { describe, it, expect } from 'vitest';
import { computePatchScope } from './patchScope';

describe('computePatchScope', () => {
  it('computes scope for a single-file, single-line change', () => {
    const patch = {
      file: 'src/main.c',
      before: 'gpio_pin_set_dt(&orange_led, 1);',
      after: 'gpio_pin_set_dt(&green_led, 1);',
    };
    const result = computePatchScope(patch);
    expect(result.filesChanged).toBe(1);
    expect(result.linesChanged).toBe(2); // 1 removed + 1 added
    expect(result.testsUnchanged).toBe(true);
  });

  it('counts multiple lines changed', () => {
    const patch = {
      file: 'src/main.c',
      before: 'line1\nline2\nline3',
      after: 'line1\nmodified\nline3\nnewline4',
    };
    const result = computePatchScope(patch);
    expect(result.filesChanged).toBe(1);
    expect(result.linesChanged).toBe(7); // 3 before + 4 after
    expect(result.testsUnchanged).toBe(true);
  });

  it('detects test file changes', () => {
    const patch = {
      file: 'tests/test_main.c',
      before: 'assert(1)',
      after: 'assert(2)',
    };
    const result = computePatchScope(patch);
    expect(result.filesChanged).toBe(1);
    expect(result.linesChanged).toBe(2);
    expect(result.testsUnchanged).toBe(false);
  });

  it('detects test file with .robot extension', () => {
    const patch = {
      file: 'green_led.robot',
      before: 'old',
      after: 'new',
    };
    const result = computePatchScope(patch);
    expect(result.testsUnchanged).toBe(false);
  });

  it('handles empty before/after gracefully', () => {
    const patch = {
      file: 'src/main.c',
      before: '',
      after: '',
    };
    const result = computePatchScope(patch);
    expect(result.filesChanged).toBe(1);
    expect(result.linesChanged).toBe(0);
    expect(result.testsUnchanged).toBe(true);
  });

  it('formats scope string correctly', () => {
    const patch = {
      file: 'src/main.c',
      before: 'old',
      after: 'new',
    };
    const result = computePatchScope(patch);
    expect(result.scopeString).toBe('1 file · 2 lines · tests unchanged');
  });

  it('formats scope string with test changes', () => {
    const patch = {
      file: 'tests/test.robot',
      before: 'old',
      after: 'new',
    };
    const result = computePatchScope(patch);
    expect(result.scopeString).toBe('1 file · 2 lines · tests modified');
  });

  it('pluralizes files correctly', () => {
    const patch = {
      file: 'src/main.c',
      before: 'line1\nline2',
      after: 'line1\nline2',
    };
    const result = computePatchScope(patch);
    expect(result.scopeString).toBe('1 file · 4 lines · tests unchanged');
  });
});
