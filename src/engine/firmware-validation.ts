import { z } from 'zod';

/**
 * Zod schemas for validating firmware job requests.
 *
 * These run in the control plane before the job is dispatched to the compute
 * plane, catching malformed input early (path traversal, oversized files,
 * missing required files) instead of letting it reach west/Renode and fail
 * opaquely.
 */

const MAX_FILE_SIZE = 1_048_576; // 1 MB per file
const MAX_FILES = 50;
const MAX_PATH_LENGTH = 255;

/** Validates a single file path: relative, no traversal, reasonable length. */
const filePathSchema = z.string().refine(
  (p) => p.length > 0 && p.length <= MAX_PATH_LENGTH,
  { message: `File path must be 1–${MAX_PATH_LENGTH} characters` },
).refine(
  (p) => !p.startsWith('/'),
  { message: 'File path must be relative (no leading /)' },
).refine(
  (p) => !p.includes('..'),
  { message: 'File path must not contain .. segments' },
);

/** Validates the firmware files map. */
export const firmwareFilesSchema = z
  .record(filePathSchema, z.string())
  .refine(
    (files) => Object.keys(files).length <= MAX_FILES,
    { message: `Maximum ${MAX_FILES} files allowed` },
  )
  .refine(
    (files) => Object.keys(files).length > 0,
    { message: 'At least one file is required' },
  )
  .refine(
    (files) => Object.values(files).every((v) => new TextEncoder().encode(v).length <= MAX_FILE_SIZE),
    { message: `Each file must be at most ${MAX_FILE_SIZE} bytes (1 MB)` },
  )
  .refine(
    (files) => Object.keys(files).some((k) => /\.c(pp)?$/.test(k)),
    { message: 'Must contain at least one .c or .cpp file' },
  )
  .refine(
    (files) => 'CMakeLists.txt' in files,
    { message: 'Must contain CMakeLists.txt' },
  );

/** Validates a Zephyr board target string. */
export const boardTargetSchema = z
  .string()
  .min(1, 'Board target is required')
  .max(64, 'Board target must be at most 64 characters')
  .regex(/^[a-z0-9_]+$/, 'Board target must match [a-z0-9_]+ (Zephyr board naming)');

/** Validates a full FirmwareJobRequest. */
export const firmwareJobRequestSchema = z.object({
  files: firmwareFilesSchema,
  board: boardTargetSchema,
});

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: string[] };

/** Validate firmware files map. */
export function validateFirmwareFiles(files: unknown): ValidationResult<Record<string, string>> {
  const result = firmwareFilesSchema.safeParse(files);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error.issues.map((i) => i.message) };
}

/** Validate a board target string. */
export function validateBoardTarget(board: unknown): ValidationResult<string> {
  const result = boardTargetSchema.safeParse(board);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error.issues.map((i) => i.message) };
}

/** Validate a full firmware job request. */
export function validateJobRequest(request: unknown): ValidationResult<{ files: Record<string, string>; board: string }> {
  const result = firmwareJobRequestSchema.safeParse(request);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error.issues.map((i) => i.message) };
}
