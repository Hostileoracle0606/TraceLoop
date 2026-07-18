import { describe, it, expect } from 'vitest';
import {
  validatePlan,
  validateEditOperations,
  validatePatchProposal,
  type LLMValidationError,
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

describe('LLMValidationError type', () => {
  it('has required fields', () => {
    const error: LLMValidationError = {
      field: 'steps[0].file',
      code: 'PATH_TRAVERSAL',
      message: 'Path traversal detected',
    };
    expect(error.field).toBe('steps[0].file');
    expect(error.code).toBe('PATH_TRAVERSAL');
    expect(error.message).toBe('Path traversal detected');
  });
});
