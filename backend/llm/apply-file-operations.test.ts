import { describe, it, expect } from 'vitest';
import { applyFileOperations, applyFileOperationsWithRetry, type FileOperation, type ApplyResult } from './apply-file-operations';

describe('applyFileOperations', () => {
  const initialFiles: Record<string, string> = {
    'src/main.c': '#include <zephyr.h>\nvoid main(void) {\n  gpio_pin_set(dt, 13, 1);\n}\n',
    'CMakeLists.txt': 'cmake_minimum_required(VERSION 3.20)\nproject(timer_led)\n',
  };

  it('applies a write operation (creates a new file)', () => {
    const ops: FileOperation[] = [
      { type: 'write', path: 'src/timer.c', content: 'void timer_init(void) {}' },
    ];

    const result = applyFileOperations(initialFiles, ops);

    expect(result['src/timer.c']).toBe('void timer_init(void) {}');
    // Existing files unchanged
    expect(result['src/main.c']).toBe(initialFiles['src/main.c']);
  });

  it('applies an edit operation (search/replace in existing file)', () => {
    const ops: FileOperation[] = [
      {
        type: 'edit',
        path: 'src/main.c',
        search: 'gpio_pin_set(dt, 13, 1)',
        replace: 'gpio_pin_set(dt, 12, 1)',
      },
    ];

    const result = applyFileOperations(initialFiles, ops);

    expect(result['src/main.c']).toContain('gpio_pin_set(dt, 12, 1)');
    expect(result['src/main.c']).not.toContain('gpio_pin_set(dt, 13, 1)');
  });

  it('throws if edit search string is not found in the file', () => {
    const ops: FileOperation[] = [
      {
        type: 'edit',
        path: 'src/main.c',
        search: 'nonexistent_function()',
        replace: 'replacement()',
      },
    ];

    expect(() => applyFileOperations(initialFiles, ops)).toThrow(
      /Search string not found/,
    );
  });

  it('throws if edit targets a file that does not exist', () => {
    const ops: FileOperation[] = [
      {
        type: 'edit',
        path: 'src/nonexistent.c',
        search: 'foo',
        replace: 'bar',
      },
    ];

    expect(() => applyFileOperations(initialFiles, ops)).toThrow(
      /File not found/,
    );
  });

  it('applies multiple operations in order', () => {
    const ops: FileOperation[] = [
      { type: 'write', path: 'src/timer.c', content: 'void timer_init(void) {}' },
      {
        type: 'edit',
        path: 'src/main.c',
        search: 'gpio_pin_set(dt, 13, 1)',
        replace: 'gpio_pin_set(dt, 12, 1)',
      },
      { type: 'write', path: 'src/led.c', content: 'void led_init(void) {}' },
    ];

    const result = applyFileOperations(initialFiles, ops);

    expect(Object.keys(result)).toHaveLength(4); // 2 original + 2 new
    expect(result['src/timer.c']).toBe('void timer_init(void) {}');
    expect(result['src/led.c']).toBe('void led_init(void) {}');
    expect(result['src/main.c']).toContain('gpio_pin_set(dt, 12, 1)');
  });

  it('does not mutate the original files record', () => {
    const ops: FileOperation[] = [
      { type: 'write', path: 'src/new.c', content: 'new file' },
    ];

    const result = applyFileOperations(initialFiles, ops);

    expect(result).not.toBe(initialFiles);
    expect(initialFiles['src/new.c']).toBeUndefined();
  });
});

describe('applyFileOperationsWithRetry', () => {
  const initialFiles: Record<string, string> = {
    'src/main.c': '#include <zephyr.h>\nvoid main(void) {\n  gpio_pin_set(dt, 13, 1);\n}\n',
    'CMakeLists.txt': 'cmake_minimum_required(VERSION 3.20)\nproject(timer_led)\n',
  };

  it('returns success when all operations apply cleanly', () => {
    const ops: FileOperation[] = [
      {
        type: 'edit',
        path: 'src/main.c',
        search: 'gpio_pin_set(dt, 13, 1)',
        replace: 'gpio_pin_set(dt, 12, 1)',
      },
    ];

    const result: ApplyResult = applyFileOperationsWithRetry(initialFiles, ops);

    expect(result.success).toBe(true);
    expect(result.files).toBeDefined();
    expect(result.files!['src/main.c']).toContain('gpio_pin_set(dt, 12, 1)');
    expect(result.failures).toBeUndefined();
  });

  it('returns failure with reflection when search string not found', () => {
    const ops: FileOperation[] = [
      {
        type: 'edit',
        path: 'src/main.c',
        search: 'nonexistent_function()',
        replace: 'replacement()',
      },
    ];

    const result: ApplyResult = applyFileOperationsWithRetry(initialFiles, ops);

    expect(result.success).toBe(false);
    expect(result.failures).toBeDefined();
    expect(result.failures).toHaveLength(1);
    expect(result.failures![0]!.operationIndex).toBe(0);
    expect(result.failures![0]!.error).toContain('Search string not found');
    expect(result.failures![0]!.reflection).toContain('The search string');
    expect(result.failures![0]!.reflection).toContain('nonexistent_function()');
    expect(result.files).toBeUndefined();
  });

  it('returns failure with reflection when file not found', () => {
    const ops: FileOperation[] = [
      {
        type: 'edit',
        path: 'src/nonexistent.c',
        search: 'foo',
        replace: 'bar',
      },
    ];

    const result: ApplyResult = applyFileOperationsWithRetry(initialFiles, ops);

    expect(result.success).toBe(false);
    expect(result.failures).toBeDefined();
    expect(result.failures).toHaveLength(1);
    expect(result.failures![0]!.error).toContain('File not found');
    expect(result.failures![0]!.reflection).toContain('does not exist');
  });

  it('collects multiple failures', () => {
    const ops: FileOperation[] = [
      {
        type: 'edit',
        path: 'src/main.c',
        search: 'nonexistent_1()',
        replace: 'replacement_1()',
      },
      {
        type: 'edit',
        path: 'src/missing.c',
        search: 'foo',
        replace: 'bar',
      },
    ];

    const result: ApplyResult = applyFileOperationsWithRetry(initialFiles, ops);

    expect(result.success).toBe(false);
    expect(result.failures).toHaveLength(2);
    expect(result.failures![0]!.operationIndex).toBe(0);
    expect(result.failures![1]!.operationIndex).toBe(1);
  });

  it('reflection includes available files for file-not-found errors', () => {
    const ops: FileOperation[] = [
      {
        type: 'edit',
        path: 'src/wrong.c',
        search: 'foo',
        replace: 'bar',
      },
    ];

    const result: ApplyResult = applyFileOperationsWithRetry(initialFiles, ops);

    expect(result.success).toBe(false);
    expect(result.failures![0]!.reflection).toContain('src/main.c');
    expect(result.failures![0]!.reflection).toContain('CMakeLists.txt');
  });

  it('applies successful operations before encountering a failure', () => {
    // First op succeeds, second fails
    const ops: FileOperation[] = [
      { type: 'write', path: 'src/new.c', content: 'new content' },
      {
        type: 'edit',
        path: 'src/main.c',
        search: 'nonexistent()',
        replace: 'replacement()',
      },
    ];

    const result: ApplyResult = applyFileOperationsWithRetry(initialFiles, ops);

    // Should fail overall
    expect(result.success).toBe(false);
    // But should report which op failed
    expect(result.failures![0]!.operationIndex).toBe(1);
  });

  it('handles empty operations array', () => {
    const result: ApplyResult = applyFileOperationsWithRetry(initialFiles, []);

    expect(result.success).toBe(true);
    expect(result.files).toBeDefined();
    expect(Object.keys(result.files!)).toHaveLength(2);
  });
});
