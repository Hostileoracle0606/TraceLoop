import { z } from 'zod';

/**
 * Tool definitions for the editing state.
 *
 * These schemas define the structure of file operations the LLM can request.
 * In AI SDK v7, tool use is handled via ToolLoopAgent or structured output.
 * For now, we define the schemas and handle operations via structured output.
 */

/**
 * Schema for a write_file operation.
 */
export const writeFileSchema = z.object({
  type: z.literal('write'),
  path: z.string().describe('The file path (relative to project root)'),
  content: z.string().describe('The complete file content'),
});

/**
 * Schema for an edit_file operation.
 */
export const editFileSchema = z.object({
  type: z.literal('edit'),
  path: z.string().describe('The file path (relative to project root)'),
  search: z.string().describe('The exact string to find in the file'),
  replace: z.string().describe('The string to replace it with'),
});

/**
 * Union schema for any file operation.
 */
export const fileOperationSchema = z.discriminatedUnion('type', [
  writeFileSchema,
  editFileSchema,
]);

/**
 * Result of a file operation.
 */
export type FileOperation =
  | { type: 'write'; path: string; content: string }
  | { type: 'edit'; path: string; search: string; replace: string };
