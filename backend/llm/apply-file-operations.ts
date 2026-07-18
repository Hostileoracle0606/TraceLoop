/**
 * Apply a sequence of file operations (write/edit) to a files record.
 * Pure function — returns a new record, never mutates the input.
 *
 * Implements the ADR-0007 "apply-or-reflect-and-retry" contract:
 * - write: create or overwrite a file
 * - edit: search/replace within an existing file
 *
 * Two modes:
 * - applyFileOperations: throws on failure (legacy, used by tests)
 * - applyFileOperationsWithRetry: returns structured result with reflection
 *   for LLM retry feedback
 */

export type FileOperation =
  | { type: 'write'; path: string; content: string }
  | { type: 'edit'; path: string; search: string; replace: string };

export interface ApplyFailure {
  operationIndex: number;
  error: string;
  reflection: string;
}

export interface ApplyResult {
  success: boolean;
  files?: Record<string, string>;
  failures?: ApplyFailure[];
}

export function applyFileOperations(
  files: Record<string, string>,
  operations: FileOperation[],
): Record<string, string> {
  // Shallow copy — we mutate the copy, not the original
  const result = { ...files };

  for (const op of operations) {
    if (op.type === 'write') {
      result[op.path] = op.content;
    } else if (op.type === 'edit') {
      const existing = result[op.path];
      if (existing === undefined) {
        throw new Error(`File not found: '${op.path}' — cannot apply edit`);
      }
      if (!existing.includes(op.search)) {
        throw new Error(
          `Search string not found in '${op.path}' — edit cannot be applied`,
        );
      }
      result[op.path] = existing.replace(op.search, op.replace);
    }
  }

  return result;
}

/**
 * Apply file operations with structured failure reporting for LLM retry.
 * Instead of throwing, returns a result object with:
 * - success: boolean
 * - files: the updated files (if all succeeded)
 * - failures: array of failure details with reflection hints (if any failed)
 *
 * The reflection field provides actionable feedback for the LLM to correct
 * its operations on retry.
 */
export function applyFileOperationsWithRetry(
  files: Record<string, string>,
  operations: FileOperation[],
): ApplyResult {
  const failures: ApplyFailure[] = [];
  const availableFiles = Object.keys(files);

  // First pass: check all operations without mutating
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i]!;
    if (op.type === 'edit') {
      const existing = files[op.path];
      if (existing === undefined) {
        failures.push({
          operationIndex: i,
          error: `File not found: '${op.path}' — cannot apply edit`,
          reflection: `The file '${op.path}' does not exist. Available files: ${availableFiles.join(', ')}. Use type: 'write' to create new files, or correct the path.`,
        });
      } else if (!existing.includes(op.search)) {
        // Provide context about what's actually in the file
        const excerpt = existing.substring(0, 200);
        failures.push({
          operationIndex: i,
          error: `Search string not found in '${op.path}' — edit cannot be applied`,
          reflection: `The search string '${op.search}' was not found in '${op.path}'. The file starts with: "${excerpt}...". Please verify the exact text to replace.`,
        });
      }
    }
  }

  // If any failures, return them without applying
  if (failures.length > 0) {
    return { success: false, failures };
  }

  // All operations valid — apply them
  try {
    const updatedFiles = applyFileOperations(files, operations);
    return { success: true, files: updatedFiles };
  } catch (error) {
    // Should not happen since we validated, but handle gracefully
    return {
      success: false,
      failures: [{
        operationIndex: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        reflection: 'An unexpected error occurred while applying operations.',
      }],
    };
  }
}
