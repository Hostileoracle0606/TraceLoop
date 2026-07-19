import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { fileOperationSchema } from '../../llm/tools';
import { planSchema, patchProposalSchema } from '../../llm/functions';
import { AgentProviderError } from '../errors';

/**
 * Canonical tool definitions for the Backboard feasibility spike (issue 01).
 * These seed the issue-08 capability registry; Zod is the single source of
 * truth and JSON Schema is generated, never hand-written.
 */

export interface ToolDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  schema: S;
}

const acceptanceCriterionSchema = z.object({
  name: z.string().min(1),
  register: z.string().min(1),
  expect: z.string().min(1),
  byTime: z.number().int().positive(),
});

export const agentStageTools = {
  request_clarification: {
    name: 'request_clarification',
    description: 'Ask the minimum blocking clarification questions.',
    schema: z.object({
      questions: z.array(z.object({
        question: z.string().min(1),
        why: z.string().min(1),
        options: z.array(z.object({
          value: z.string(),
          consequence: z.string(),
        })).optional(),
        recommendedDefault: z.string().optional(),
      })).min(1),
    }),
  },
  submit_task_contract: {
    name: 'submit_task_contract',
    description: 'Submit a draft executable task contract.',
    schema: z.object({
      objective: z.string().min(1),
      boardBuildTarget: z.string().min(1),
      acceptanceCriteria: z.array(acceptanceCriterionSchema).min(1),
      assumptions: z.array(z.string()).default([]),
      ambiguities: z.array(z.string()).default([]),
    }),
  },
  submit_plan: {
    name: 'submit_plan',
    description: 'Submit a structured implementation plan.',
    schema: planSchema,
  },
  submit_file_operations: {
    name: 'submit_file_operations',
    description: 'Submit validated search/replace file operations (ADR-0007).',
    schema: z.object({
      operations: z.array(fileOperationSchema).min(1),
      summary: z.string().min(1),
    }),
  },
  submit_patch: {
    name: 'submit_patch',
    description: 'Submit a minimal patch for the identified root cause.',
    schema: patchProposalSchema,
  },
  report_blocker: {
    name: 'report_blocker',
    description: 'Report that progress is blocked and why.',
    schema: z.object({
      reason: z.string().min(1),
      evidence: z.array(z.string()).default([]),
    }),
  },
} satisfies Record<string, ToolDefinition>;

/**
 * F1: providers deliver tool arguments as objects, JSON strings, or
 * double-encoded JSON strings. Normalize, then validate.
 */
export function parseToolArguments<S extends z.ZodTypeAny>(
  raw: unknown,
  schema: S,
): z.infer<S> {
  let value: unknown = raw;
  for (let i = 0; i < 2 && typeof value === 'string'; i++) {
    try {
      value = JSON.parse(value);
    } catch (e) {
      throw new AgentProviderError('provider-malformed-response', 'tool arguments are not valid JSON', e);
    }
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AgentProviderError('validation-failed', 'tool arguments failed schema validation', parsed.error);
  }
  return parsed.data;
}

export function toJsonSchema(def: ToolDefinition): object {
  return zodToJsonSchema(def.schema, { $refStrategy: 'none' });
}
