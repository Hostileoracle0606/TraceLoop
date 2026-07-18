/**
 * Apply a sequence of file operations (write/edit) to a files record.
 * Pure function — returns a new record, never mutates the input.
 *
 * Implements the ADR-0007 "apply-or-reflect-and-retry" contract:
 * - write: create or overwrite a file
 * - edit: search/replace within an existing file (throws if search not found)
 */

export type FileOperation =
  | { type: 'write'; path: string; content: string }
  | { type: 'edit'; path: string; search: string; replace: string };

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
