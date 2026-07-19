import { describe, it, expect, vi } from 'vitest';
import {
  validatePlan,
  validateEditOperations,
  validatePatchProposal,
  validateWithRetry,
  LLMValidationError,
} from './validate';
import type { Plan, PatchProposal } from './functions';
import type { FileOperation } from './apply-file-operations';

describe('validateLLMOutput', () => {
  describe('validatePlan', () => {
    it('accepts a valid plan', () => {
      const plan: Plan = {
        steps: [
          { file: 'src/main.c', action: 'modify', description: 'Add timer init' },
          { file: 'src/led.c', action: 'create', description: 'LED module' },
        ],
        summary: 'Add timer-based LED',
      };
      const result = validatePlan(plan);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects plan with path traversal', () => {
      const plan: Plan = {
        steps: [
          { file: '../etc/passwd', action: 'modify', description: 'hack' },
        ],
        summary: 'malicious',
      };
      const result = validatePlan(plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'steps[0].file' && e.code === 'PATH_TRAVERSAL')).toBe(true);
    });

    it('rejects plan with absolute path', () => {
      const plan: Plan = {
        steps: [
          { file: '/etc/passwd', action: 'modify', description: 'hack' },
        ],
        summary: 'malicious',
      };
      const result = validatePlan(plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'PATH_TRAVERSAL')).toBe(true);
    });

    it('rejects plan with too many steps', () => {
      const plan: Plan = {
        steps: Array.from({ length: 101 }, (_, i) => ({
          file: `src/file${i}.c`,
          action: 'modify' as const,
          description: 'change',
        })),
        summary: 'too many',
      };
      const result = validatePlan(plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'LIMIT_EXCEEDED')).toBe(true);
    });

    it('rejects plan with empty summary', () => {
      const plan = {
        steps: [{ file: 'src/main.c', action: 'modify' as const, description: 'change' }],
        summary: '',
      };
      const result = validatePlan(plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'SCHEMA_VIOLATION')).toBe(true);
    });

    it('rejects plan with empty step description', () => {
      const plan: Plan = {
        steps: [{ file: 'src/main.c', action: 'modify', description: '' }],
        summary: 'valid summary',
      };
      const result = validatePlan(plan);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateEditOperations', () => {
    it('accepts valid edit operations within plan scope', () => {
      const operations: FileOperation[] = [
        { type: 'edit', path: 'src/main.c', search: 'return 0;', replace: 'init(); return 0;' },
      ];
      const planFiles = new Set(['src/main.c', 'src/led.c']);
      const result = validateEditOperations(operations, planFiles);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('accepts valid write operations within plan scope', () => {
      const operations: FileOperation[] = [
        { type: 'write', path: 'src/led.c', content: 'void led_init() {}' },
      ];
      const planFiles = new Set(['src/led.c']);
      const result = validateEditOperations(operations, planFiles);
      expect(result.valid).toBe(true);
    });

    it('rejects operations on files outside plan scope', () => {
      const operations: FileOperation[] = [
        { type: 'edit', path: 'src/unplanned.c', search: 'foo', replace: 'bar' },
      ];
      const planFiles = new Set(['src/main.c']);
      const result = validateEditOperations(operations, planFiles);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'OUT_OF_SCOPE')).toBe(true);
    });

    it('rejects operations on protected test files', () => {
      const operations: FileOperation[] = [
        { type: 'edit', path: 'src/main.test.c', search: 'foo', replace: 'bar' },
      ];
      const planFiles = new Set(['src/main.test.c']);
      const result = validateEditOperations(operations, planFiles);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'PROTECTED_FILE')).toBe(true);
    });

    it('rejects operations on spec files', () => {
      const operations: FileOperation[] = [
        { type: 'write', path: 'tests/spec_helper.c', content: 'weakened test' },
      ];
      const planFiles = new Set(['tests/spec_helper.c']);
      const result = validateEditOperations(operations, planFiles);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'PROTECTED_FILE')).toBe(true);
    });

    it('rejects operations with path traversal', () => {
      const operations: FileOperation[] = [
        { type: 'edit', path: '../secret.c', search: 'foo', replace: 'bar' },
      ];
      const planFiles = new Set(['../secret.c']);
      const result = validateEditOperations(operations, planFiles);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'PATH_TRAVERSAL')).toBe(true);
    });

    it('collects multiple errors', () => {
      const operations: FileOperation[] = [
        { type: 'edit', path: '../secret.c', search: 'foo', replace: 'bar' },
        { type: 'edit', path: 'src/test.c', search: 'x', replace: 'y' },
        { type: 'edit', path: 'src/unplanned.c', search: 'a', replace: 'b' },
      ];
      const planFiles = new Set(['src/main.c']);
      const result = validateEditOperations(operations, planFiles);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('validatePatchProposal', () => {
    it('accepts a valid patch proposal', () => {
      const patch: PatchProposal = {
        file: 'src/main.c',
        before: 'gpio_set(ORANGE)',
        after: 'gpio_set(GREEN)',
        summary: 'Fix LED color',
        confidence: 0.9,
      };
      const result = validatePatchProposal(patch);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects patch on protected file', () => {
      const patch: PatchProposal = {
        file: 'src/main.test.c',
        before: 'assert(x)',
        after: 'assert(true)',
        summary: 'Weaken test',
        confidence: 0.8,
      };
      const result = validatePatchProposal(patch);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'PROTECTED_FILE')).toBe(true);
    });

    it('rejects patch with path traversal', () => {
      const patch: PatchProposal = {
        file: '../config.c',
        before: 'a',
        after: 'b',
        summary: 'hack',
        confidence: 0.5,
      };
      const result = validatePatchProposal(patch);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'PATH_TRAVERSAL')).toBe(true);
    });

    it('rejects patch with confidence out of bounds', () => {
      const patch: PatchProposal = {
        file: 'src/main.c',
        before: 'a',
        after: 'b',
        summary: 'change',
        confidence: 1.5,
      };
      const result = validatePatchProposal(patch);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'SCHEMA_VIOLATION')).toBe(true);
    });

    it('rejects patch with negative confidence', () => {
      const patch: PatchProposal = {
        file: 'src/main.c',
        before: 'a',
        after: 'b',
        summary: 'change',
        confidence: -0.1,
      };
      const result = validatePatchProposal(patch);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'SCHEMA_VIOLATION')).toBe(true);
    });

    it('rejects patch with empty file path', () => {
      const patch: PatchProposal = {
        file: '',
        before: 'a',
        after: 'b',
        summary: 'change',
        confidence: 0.5,
      };
      const result = validatePatchProposal(patch);
      expect(result.valid).toBe(false);
    });
  });
});

describe('LLMValidationError class', () => {
  it('is an instance of Error', () => {
    const error = new LLMValidationError('steps[0].file', 'PATH_TRAVERSAL', 'Path traversal detected');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(LLMValidationError);
  });

  it('has field, code, and message properties', () => {
    const error = new LLMValidationError('steps[0].file', 'PATH_TRAVERSAL', 'Path traversal detected');
    expect(error.field).toBe('steps[0].file');
    expect(error.code).toBe('PATH_TRAVERSAL');
    expect(error.message).toBe('Path traversal detected');
  });

  it('has name set to LLMValidationError', () => {
    const error = new LLMValidationError('file', 'SCHEMA_VIOLATION', 'bad');
    expect(error.name).toBe('LLMValidationError');
  });

  it('aggregates multiple errors into one', () => {
    const errors = [
      { field: 'a', code: 'PATH_TRAVERSAL' as const, message: 'traversal' },
      { field: 'b', code: 'PROTECTED_FILE' as const, message: 'protected' },
    ];
    const error = LLMValidationError.fromErrors(errors);
    expect(error).toBeInstanceOf(LLMValidationError);
    expect(error.errors).toHaveLength(2);
    expect(error.message).toContain('traversal');
    expect(error.message).toContain('protected');
  });
});

describe('validateEditOperations with file content', () => {
  it('rejects edit when search string does not exist in file', () => {
    const operations: FileOperation[] = [
      { type: 'edit', path: 'src/main.c', search: 'nonexistent_code', replace: 'new_code' },
    ];
    const planFiles = new Set(['src/main.c']);
    const files = { 'src/main.c': 'int main() { return 0; }' };
    const result = validateEditOperations(operations, planFiles, files);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'SCHEMA_VIOLATION' && e.field.includes('search'))).toBe(true);
  });

  it('accepts edit when search string exists in file', () => {
    const operations: FileOperation[] = [
      { type: 'edit', path: 'src/main.c', search: 'return 0;', replace: 'init(); return 0;' },
    ];
    const planFiles = new Set(['src/main.c']);
    const files = { 'src/main.c': 'int main() { return 0; }' };
    const result = validateEditOperations(operations, planFiles, files);
    expect(result.valid).toBe(true);
  });

  it('skips search check for write operations', () => {
    const operations: FileOperation[] = [
      { type: 'write', path: 'src/new.c', content: 'void init() {}' },
    ];
    const planFiles = new Set(['src/new.c']);
    const files = {};
    const result = validateEditOperations(operations, planFiles, files);
    expect(result.valid).toBe(true);
  });
});

describe('validateWithRetry', () => {
  it('returns valid data on first attempt', async () => {
    const validPlan = {
      steps: [{ file: 'src/main.c', action: 'modify' as const, description: 'change' }],
      summary: 'valid',
    };
    const generate = vi.fn().mockResolvedValue(validPlan);
    const result = await validateWithRetry(generate, validatePlan);
    expect(result).toEqual(validPlan);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('retries once on validation failure then succeeds', async () => {
    const badPlan = { steps: [], summary: '' };
    const goodPlan = {
      steps: [{ file: 'src/main.c', action: 'modify' as const, description: 'change' }],
      summary: 'valid',
    };
    const generate = vi.fn()
      .mockResolvedValueOnce(badPlan)
      .mockResolvedValueOnce(goodPlan);
    const result = await validateWithRetry(generate, validatePlan);
    expect(result).toEqual(goodPlan);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('throws LLMValidationError after retry budget exhausted', async () => {
    const badPlan = { steps: [], summary: '' };
    const generate = vi.fn().mockResolvedValue(badPlan);
    await expect(validateWithRetry(generate, validatePlan))
      .rejects.toThrow(LLMValidationError);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('thrown error contains validation details', async () => {
    const badPlan = {
      steps: [{ file: '../etc/passwd', action: 'modify' as const, description: 'hack' }],
      summary: 'malicious',
    };
    const generate = vi.fn().mockResolvedValue(badPlan);
    try {
      await validateWithRetry(generate, validatePlan);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(LLMValidationError);
      const err = e as LLMValidationError;
      expect(err.errors.some(er => er.code === 'PATH_TRAVERSAL')).toBe(true);
    }
  });
});

describe('malformed input handling', () => {
  it('rejects malformed plan (not an object)', () => {
    const result = validatePlan('not a plan');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'SCHEMA_VIOLATION')).toBe(true);
  });

  it('rejects null plan', () => {
    const result = validatePlan(null);
    expect(result.valid).toBe(false);
  });

  it('rejects malformed patch (missing required fields)', () => {
    const result = validatePatchProposal({ file: 'src/main.c' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'SCHEMA_VIOLATION')).toBe(true);
  });

  it('rejects patch with wrong type for confidence', () => {
    const result = validatePatchProposal({
      file: 'src/main.c',
      before: 'a',
      after: 'b',
      summary: 'change',
      confidence: 'high',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'SCHEMA_VIOLATION')).toBe(true);
  });
});
