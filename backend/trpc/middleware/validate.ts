import { TRPCError } from '@trpc/server';
import {
  firmwareFilesSchema,
  boardTargetSchema,
} from '../../../src/engine/firmware-validation';

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 1_048_576; // 1 MB per file
const MAX_FILES_COUNT = 50;
const MAX_DESCRIPTION_BYTES = 10_240; // 10 KB per description
const MAX_PLAN_STEPS = 100;

// ── Path traversal detection ─────────────────────────────────────────────────

const PATH_TRAVERSAL_PATTERNS = [
  /\.\./,                // .. segments
  /^\/.+/,              // absolute paths (Unix)
  /^[A-Z]:\\/i,         // absolute paths (Windows)
  /\\\\/,               // backslash separators (potential Windows paths)
];

/** Checks if a string contains path traversal patterns. */
function containsPathTraversal(value: string): boolean {
  return PATH_TRAVERSAL_PATTERNS.some((pattern) => pattern.test(value));
}

// ── Firmware files validation middleware ─────────────────────────────────────

/**
 * Validates firmware files against the firmware schema.
 * Throws TRPCError BAD_REQUEST if validation fails.
 */
export function validateFirmwareFilesInput(files: unknown): void {
  const result = firmwareFilesSchema.safeParse(files);
  if (!result.success) {
    const messages = result.error.issues.map((i) => i.message);
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Firmware file validation failed: ${messages.join('; ')}`,
    });
  }
}

/**
 * Checks file size limits: no file > 1MB, no more than 50 files.
 * Throws TRPCError BAD_REQUEST if limits exceeded.
 */
export function validateFileSizeLimits(files: Record<string, string>): void {
  const entries = Object.entries(files);

  if (entries.length > MAX_FILES_COUNT) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Too many files: ${entries.length} exceeds maximum of ${MAX_FILES_COUNT}`,
    });
  }

  for (const [path, content] of entries) {
    const byteLength = new TextEncoder().encode(content).length;
    if (byteLength > MAX_FILE_SIZE_BYTES) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `File '${path}' is ${byteLength} bytes, exceeds maximum of ${MAX_FILE_SIZE_BYTES} bytes (1 MB)`,
      });
    }
  }
}

// ── Board target validation middleware ───────────────────────────────────────

/**
 * Validates a board target string against the board target schema.
 * Throws TRPCError BAD_REQUEST if validation fails.
 */
export function validateBoardTargetInput(board: unknown): void {
  const result = boardTargetSchema.safeParse(board);
  if (!result.success) {
    const messages = result.error.issues.map((i) => i.message);
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Board target validation failed: ${messages.join('; ')}`,
    });
  }
}

// ── Path sanitization middleware ─────────────────────────────────────────────

/**
 * Checks a single string value for path traversal patterns.
 * Throws TRPCError BAD_REQUEST if suspicious patterns found.
 */
export function sanitizePath(value: string, fieldName: string): void {
  if (containsPathTraversal(value)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Path traversal detected in '${fieldName}': '${value}' contains suspicious patterns`,
    });
  }
}

/**
 * Checks all string values in an object for path traversal patterns.
 * Throws TRPCError BAD_REQUEST if any suspicious patterns found.
 */
export function sanitizeAllPaths(obj: Record<string, unknown>, prefix = ''): void {
  for (const [key, value] of Object.entries(obj)) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      if (containsPathTraversal(value)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Path traversal detected in '${fieldPath}': '${value}'`,
        });
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitizeAllPaths(value as Record<string, unknown>, fieldPath);
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (typeof item === 'string') {
          if (containsPathTraversal(item)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Path traversal detected in '${fieldPath}[${i}]': '${item}'`,
            });
          }
        } else if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          sanitizeAllPaths(item as Record<string, unknown>, `${fieldPath}[${i}]`);
        }
      }
    }
  }
}

// ── Plan input validation ────────────────────────────────────────────────────

/**
 * Validates plan steps: max step count, description size limits.
 * Throws TRPCError BAD_REQUEST if limits exceeded.
 */
export function validatePlanLimits(plan: { steps: Array<{ file: string; description: string }> }): void {
  if (plan.steps.length > MAX_PLAN_STEPS) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Plan has ${plan.steps.length} steps, exceeds maximum of ${MAX_PLAN_STEPS}`,
    });
  }

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i]!;
    const descBytes = new TextEncoder().encode(step.description).length;
    if (descBytes > MAX_DESCRIPTION_BYTES) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Plan step ${i} description is ${descBytes} bytes, exceeds maximum of ${MAX_DESCRIPTION_BYTES} bytes (10 KB)`,
      });
    }
  }
}
