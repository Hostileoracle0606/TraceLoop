import { z } from 'zod';
import { isProtectedFile } from '../../src/engine/permissions';

// Error codes for structured validation failures
export type ValidationErrorCode =
  | 'PATH_TRAVERSAL'
  | 'PROTECTED_FILE'
  | 'OUT_OF_SCOPE'
  | 'SCHEMA_VIOLATION'
  | 'LIMIT_EXCEEDED';

export class LLMValidationError extends Error {
  readonly field: string;
  readonly code: ValidationErrorCode;
  readonly errors: ReadonlyArray<LLMValidationErrorDetail>;

  constructor(field: string, code: ValidationErrorCode, message: string, errors?: LLMValidationErrorDetail[]) {
    super(message);
    this.name = 'LLMValidationError';
    this.field = field;
    this.code = code;
    this.errors = errors ?? [{ field, code, message }];
  }

  static fromErrors(errors: LLMValidationErrorDetail[]): LLMValidationError {
    const first = errors[0]!;
    const combined = errors.map(e => `${e.code}: ${e.message}`).join('; ');
    return new LLMValidationError(first.field, first.code, combined, errors);
  }
}

export interface LLMValidationErrorDetail {
  field: string;
  code: ValidationErrorCode;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: LLMValidationErrorDetail[];
}

// Path traversal detection patterns
const PATH_TRAVERSAL_PATTERNS = [
  /\.\./,                // .. segments
  /^\/.+/,              // absolute paths (Unix)
  /^[A-Z]:\\/i,         // absolute paths (Windows)
  /\\\\/,               // backslash separators
];

function containsPathTraversal(value: string): boolean {
  return PATH_TRAVERSAL_PATTERNS.some(pattern => pattern.test(value));
}

// Zod schemas for LLM output validation
const planStepSchema = z.object({
  file: z.string().min(1, 'File path cannot be empty'),
  action: z.enum(['create', 'modify', 'delete']),
  description: z.string().min(1, 'Description cannot be empty'),
});

const planSchema = z.object({
  steps: z.array(planStepSchema).min(1, 'Plan must have at least one step'),
  summary: z.string().min(1, 'Summary cannot be empty'),
});

const patchProposalSchema = z.object({
  file: z.string().min(1, 'File path cannot be empty'),
  before: z.string(),
  after: z.string(),
  summary: z.string().min(1, 'Summary cannot be empty'),
  confidence: z.number().min(0, 'Confidence must be >= 0').max(1, 'Confidence must be <= 1'),
});

// Constants
const MAX_PLAN_STEPS = 100;
const MAX_DESCRIPTION_BYTES = 10240; // 10 KB

/**
 * Validate a plan against ADR-0007 requirements:
 * - Schema validation (Zod)
 * - Path traversal detection
 * - Plan limits (step count, description size)
 */
export function validatePlan(plan: unknown): ValidationResult {
  const errors: LLMValidationErrorDetail[] = [];

  // Schema validation
  const schemaResult = planSchema.safeParse(plan);
  if (!schemaResult.success) {
    for (const issue of schemaResult.error.issues) {
      errors.push({
        field: issue.path.join('.'),
        code: 'SCHEMA_VIOLATION',
        message: issue.message,
      });
    }
    return { valid: false, errors };
  }

  const validPlan = schemaResult.data;

  // Limit checks
  if (validPlan.steps.length > MAX_PLAN_STEPS) {
    errors.push({
      field: 'steps',
      code: 'LIMIT_EXCEEDED',
      message: `Plan has ${validPlan.steps.length} steps, exceeds maximum of ${MAX_PLAN_STEPS}`,
    });
  }

  // Path traversal and description size checks
  for (let i = 0; i < validPlan.steps.length; i++) {
    const step = validPlan.steps[i]!;

    if (containsPathTraversal(step.file)) {
      errors.push({
        field: `steps[${i}].file`,
        code: 'PATH_TRAVERSAL',
        message: `Path traversal detected in '${step.file}'`,
      });
    }

    const descBytes = new TextEncoder().encode(step.description).length;
    if (descBytes > MAX_DESCRIPTION_BYTES) {
      errors.push({
        field: `steps[${i}].description`,
        code: 'LIMIT_EXCEEDED',
        message: `Description is ${descBytes} bytes, exceeds maximum of ${MAX_DESCRIPTION_BYTES}`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate edit operations against ADR-0007 requirements:
 * - Path traversal detection
 * - Protected file check (test files)
 * - Plan scope enforcement (only edit files in the plan)
 */
export function validateEditOperations(
  operations: unknown[],
  planFiles: Set<string>,
  files?: Record<string, string>,
): ValidationResult {
  const errors: LLMValidationErrorDetail[] = [];

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    if (!op || typeof op !== 'object') {
      errors.push({
        field: `operations[${i}]`,
        code: 'SCHEMA_VIOLATION',
        message: 'Operation must be an object',
      });
      continue;
    }

    const typedOp = op as Record<string, unknown>;
    const path = typedOp.path;
    if (typeof path !== 'string') {
      errors.push({
        field: `operations[${i}].path`,
        code: 'SCHEMA_VIOLATION',
        message: 'Operation path must be a string',
      });
      continue;
    }

    // Path traversal check
    if (containsPathTraversal(path)) {
      errors.push({
        field: `operations[${i}].path`,
        code: 'PATH_TRAVERSAL',
        message: `Path traversal detected in '${path}'`,
      });
      continue; // Skip further checks for this operation
    }

    // Protected file check
    if (isProtectedFile(path)) {
      errors.push({
        field: `operations[${i}].path`,
        code: 'PROTECTED_FILE',
        message: `Cannot modify protected file '${path}' (test/spec file)`,
      });
    }

    // Plan scope check
    if (!planFiles.has(path)) {
      errors.push({
        field: `operations[${i}].path`,
        code: 'OUT_OF_SCOPE',
        message: `File '${path}' is not in the approved plan`,
      });
    }

    // Search-exists-in-file check for edit operations
    if (files && typedOp.type === 'edit' && typeof typedOp.search === 'string') {
      const fileContent = files[path];
      if (fileContent !== undefined && !fileContent.includes(typedOp.search)) {
        errors.push({
          field: `operations[${i}].search`,
          code: 'SCHEMA_VIOLATION',
          message: `Search string not found in '${path}'`,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a patch proposal against ADR-0007 requirements:
 * - Schema validation (Zod)
 * - Path traversal detection
 * - Protected file check
 * - Confidence bounds [0, 1]
 */
export function validatePatchProposal(patch: unknown): ValidationResult {
  const errors: LLMValidationErrorDetail[] = [];

  // Schema validation
  const schemaResult = patchProposalSchema.safeParse(patch);
  if (!schemaResult.success) {
    for (const issue of schemaResult.error.issues) {
      errors.push({
        field: issue.path.join('.'),
        code: 'SCHEMA_VIOLATION',
        message: issue.message,
      });
    }
    return { valid: false, errors };
  }

  const validPatch = schemaResult.data;

  // Path traversal check
  if (containsPathTraversal(validPatch.file)) {
    errors.push({
      field: 'file',
      code: 'PATH_TRAVERSAL',
      message: `Path traversal detected in '${validPatch.file}'`,
    });
  }

  // Protected file check
  if (isProtectedFile(validPatch.file)) {
    errors.push({
      field: 'file',
      code: 'PROTECTED_FILE',
      message: `Cannot modify protected file '${validPatch.file}' (test/spec file)`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate with retry: calls generate(), validates the result, and if invalid,
 * retries once. If still invalid after retry, throws a typed LLMValidationError.
 */
export async function validateWithRetry<T>(
  generate: () => Promise<T>,
  validate: (data: T) => ValidationResult,
): Promise<T> {
  // First attempt
  const first = await generate();
  const firstResult = validate(first);
  if (firstResult.valid) {
    return first;
  }

  // Retry once
  const second = await generate();
  const secondResult = validate(second);
  if (secondResult.valid) {
    return second;
  }

  // Budget exhausted — throw with the latest errors
  throw LLMValidationError.fromErrors(secondResult.errors);
}
