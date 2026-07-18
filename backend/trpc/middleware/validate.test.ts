import { describe, it, expect } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  validateFirmwareFilesInput,
  validateFileSizeLimits,
  validateBoardTargetInput,
  sanitizePath,
  sanitizeAllPaths,
  validatePlanLimits,
} from './validate';

describe('validateFirmwareFilesInput', () => {
  it('accepts valid firmware files', () => {
    expect(() =>
      validateFirmwareFilesInput({
        'CMakeLists.txt': 'cmake_minimum_required(VERSION 3.20)',
        'src/main.c': 'int main() { return 0; }',
      })
    ).not.toThrow();
  });

  it('rejects empty files map', () => {
    expect(() => validateFirmwareFilesInput({})).toThrow(TRPCError);
  });

  it('rejects files without CMakeLists.txt', () => {
    expect(() =>
      validateFirmwareFilesInput({ 'src/main.c': 'int main() {}' })
    ).toThrow(/CMakeLists\.txt/);
  });

  it('rejects files without .c or .cpp file', () => {
    expect(() =>
      validateFirmwareFilesInput({ 'CMakeLists.txt': 'cmake', 'README.md': 'hello' })
    ).toThrow(/\.c or \.cpp/);
  });

  it('rejects paths with .. traversal', () => {
    expect(() =>
      validateFirmwareFilesInput({
        'CMakeLists.txt': 'cmake',
        '../etc/passwd': 'root:x:0:0',
      })
    ).toThrow(/\.\./);
  });

  it('rejects absolute paths', () => {
    expect(() =>
      validateFirmwareFilesInput({
        'CMakeLists.txt': 'cmake',
        '/etc/passwd': 'root:x:0:0',
      })
    ).toThrow(/relative/);
  });

  it('rejects non-object input', () => {
    expect(() => validateFirmwareFilesInput('not-an-object')).toThrow(TRPCError);
    expect(() => validateFirmwareFilesInput(null)).toThrow(TRPCError);
    expect(() => validateFirmwareFilesInput(42)).toThrow(TRPCError);
  });
});

describe('validateFileSizeLimits', () => {
  it('accepts files within limits', () => {
    expect(() =>
      validateFileSizeLimits({ 'main.c': 'int main() {}' })
    ).not.toThrow();
  });

  it('rejects file exceeding 1MB', () => {
    const largeContent = 'x'.repeat(1_048_577); // 1 byte over 1MB
    expect(() =>
      validateFileSizeLimits({ 'big.c': largeContent })
    ).toThrow(/exceeds maximum/);
  });

  it('rejects more than 50 files', () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 51; i++) {
      files[`file${i}.c`] = 'int x;';
    }
    expect(() => validateFileSizeLimits(files)).toThrow(/Too many files/);
  });

  it('accepts exactly 50 files', () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 50; i++) {
      files[`file${i}.c`] = 'int x;';
    }
    expect(() => validateFileSizeLimits(files)).not.toThrow();
  });
});

describe('validateBoardTargetInput', () => {
  it('accepts valid board target', () => {
    expect(() => validateBoardTargetInput('stm32f4_disco')).not.toThrow();
    expect(() => validateBoardTargetInput('nrf52840dk')).not.toThrow();
  });

  it('rejects empty board target', () => {
    expect(() => validateBoardTargetInput('')).toThrow(TRPCError);
  });

  it('rejects board target with invalid characters', () => {
    expect(() => validateBoardTargetInput('STM32-DISCO')).toThrow(TRPCError);
    expect(() => validateBoardTargetInput('board target')).toThrow(TRPCError);
  });

  it('rejects board target exceeding 64 chars', () => {
    expect(() => validateBoardTargetInput('a'.repeat(65))).toThrow(TRPCError);
  });

  it('rejects non-string input', () => {
    expect(() => validateBoardTargetInput(123)).toThrow(TRPCError);
    expect(() => validateBoardTargetInput(null)).toThrow(TRPCError);
  });
});

describe('sanitizePath', () => {
  it('accepts valid relative paths', () => {
    expect(() => sanitizePath('src/main.c', 'file')).not.toThrow();
    expect(() => sanitizePath('lib/utils.c', 'file')).not.toThrow();
  });

  it('rejects path with .. traversal', () => {
    expect(() => sanitizePath('../etc/passwd', 'file')).toThrow(/Path traversal/);
    expect(() => sanitizePath('src/../../etc/passwd', 'file')).toThrow(/Path traversal/);
  });

  it('rejects absolute Unix paths', () => {
    expect(() => sanitizePath('/etc/passwd', 'file')).toThrow(/Path traversal/);
  });

  it('rejects absolute Windows paths', () => {
    expect(() => sanitizePath('C:\\Windows\\System32', 'file')).toThrow(/Path traversal/);
  });

  it('includes field name in error message', () => {
    try {
      sanitizePath('../bad', 'myField');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      expect((e as TRPCError).message).toContain('myField');
    }
  });
});

describe('sanitizeAllPaths', () => {
  it('accepts clean objects', () => {
    expect(() =>
      sanitizeAllPaths({ file: 'src/main.c', name: 'test' })
    ).not.toThrow();
  });

  it('detects traversal in nested string values', () => {
    expect(() =>
      sanitizeAllPaths({
        step: { file: '../etc/passwd', action: 'create' },
      })
    ).toThrow(/Path traversal/);
  });

  it('detects traversal in arrays', () => {
    expect(() =>
      sanitizeAllPaths({
        files: ['src/main.c', '../secret.txt'],
      })
    ).toThrow(/Path traversal/);
  });

  it('detects traversal in deeply nested structures', () => {
    expect(() =>
      sanitizeAllPaths({
        plan: {
          steps: [
            { file: 'ok.c', description: 'fine' },
            { file: '/etc/shadow', description: 'bad' },
          ],
        },
      })
    ).toThrow(/Path traversal/);
  });
});

describe('validatePlanLimits', () => {
  it('accepts plan within limits', () => {
    expect(() =>
      validatePlanLimits({
        steps: [{ file: 'main.c', description: 'Add timer' }],
      })
    ).not.toThrow();
  });

  it('rejects plan with more than 100 steps', () => {
    const steps = Array.from({ length: 101 }, (_, i) => ({
      file: `file${i}.c`,
      description: 'step',
    }));
    expect(() => validatePlanLimits({ steps })).toThrow(/exceeds maximum of 100/);
  });

  it('rejects step description exceeding 10KB', () => {
    const bigDescription = 'x'.repeat(10_241);
    expect(() =>
      validatePlanLimits({
        steps: [{ file: 'main.c', description: bigDescription }],
      })
    ).toThrow(/exceeds maximum of 10240 bytes/);
  });

  it('accepts plan with exactly 100 steps', () => {
    const steps = Array.from({ length: 100 }, (_, i) => ({
      file: `file${i}.c`,
      description: 'step',
    }));
    expect(() => validatePlanLimits({ steps })).not.toThrow();
  });
});
