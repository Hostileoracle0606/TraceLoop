import { generateText, generateObject } from 'ai';
import { z } from 'zod';
import { getLLMProvider } from './provider';
import { getSystemPrompt } from './prompts';
import { type FileOperation, fileOperationSchema } from './tools';
import { validatePlan, validateEditOperations, validatePatchProposal, validateWithRetry, LLMValidationError } from './validate';

/**
 * LLM functions for each FSM state that requires LLM capability.
 *
 * The LLM serves the FSM — it does not decide state transitions.
 * Each function is called within its designated state and returns
 * structured output the FSM consumes.
 */

// ── Shared types ───────────────────────────────────────────────────

export interface AcceptanceCriterion {
  name: string;
  register: string;
  expect: string;
  byTime: number;
}

export interface RootCause {
  time: number;
  type: string;
  source: string;
  register: string;
  value: string;
  detail: string;
  label: string;
  lane: string;
}

// ── Exported types ─────────────────────────────────────────────────

export interface PlanStep {
  file: string;
  action: 'create' | 'modify' | 'delete';
  description: string;
}

export interface Plan {
  steps: PlanStep[];
  summary: string;
}

export interface PatchProposal {
  file: string;
  before: string;
  after: string;
  summary: string;
  confidence: number;
}

// ── Zod schemas for LLM output validation ─────────────────────────

const planStepSchema = z.object({
  file: z.string().min(1),
  action: z.enum(['create', 'modify', 'delete']),
  description: z.string().min(1),
});

export const planSchema = z.object({
  steps: z.array(planStepSchema).min(1),
  summary: z.string().min(1),
});

export const patchProposalSchema = z.object({
  file: z.string().min(1),
  before: z.string(),
  after: z.string(),
  summary: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

const editSourceResultSchema = z.object({
  operations: z.array(fileOperationSchema),
  summary: z.string(),
});

// ── clarification-needed state ─────────────────────────────────────

/**
 * Examine the user's intent and source files. Returns clarification
 * questions if the intent is ambiguous, or null if it's clear.
 */
export async function clarifyIntent(
  intent: string,
  files: Record<string, string>
): Promise<{ questions: string[] } | null> {
  const model = getLLMProvider();
  const system = getSystemPrompt('clarification-needed');

  const filesContext = Object.entries(files)
    .map(([path, content]) => `--- ${path} ---\n${content}`)
    .join('\n\n');

  const { text } = await generateText({
    model,
    system,
    prompt: `User intent: ${intent}\n\nCurrent source files:\n${filesContext}`,
  });

  if (text.includes('NO_CLARIFICATION_NEEDED')) {
    return null;
  }

  // Parse questions from the response (one per line, or bullet points)
  const questions = text
    .split('\n')
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter((line) => line.length > 0 && line.endsWith('?'));

  return { questions: questions.length > 0 ? questions : [text.trim()] };
}

// ── planning state ─────────────────────────────────────────────────

/**
 * Generate a structured implementation plan from the confirmed intent.
 */
export async function generatePlan(
  intent: string,
  files: Record<string, string>,
  board: { name: string; mcu: string; architecture: string },
  criteria: AcceptanceCriterion[]
): Promise<Plan> {
  const model = getLLMProvider();
  const system = getSystemPrompt('planning');

  const filesContext = Object.entries(files)
    .map(([path, content]) => `--- ${path} ---\n${content}`)
    .join('\n\n');

  const criteriaContext = criteria
    .map((c) => `- ${c.name}: ${c.register} should be ${c.expect} by ${c.byTime}µs`)
    .join('\n');

  const plan = await validateWithRetry(
    async () => {
      const { object } = await generateObject({
        model,
        schema: planSchema,
        system,
        prompt: `Intent: ${intent}\n\nBoard: ${board.name} (${board.mcu}, ${board.architecture})\n\nAcceptance criteria:\n${criteriaContext}\n\nCurrent source files:\n${filesContext}`,
      });
      return object as unknown as Plan;
    },
    (p) => validatePlan(p),
  );

  return plan;
}

// ── editing state ──────────────────────────────────────────────────

/**
 * Execute an approved plan by modifying source files.
 * Returns the list of file operations to perform.
 */
export async function editSource(
  plan: Plan,
  files: Record<string, string>,
  rootCause?: RootCause
): Promise<{ operations: FileOperation[]; summary: string }> {
  const model = getLLMProvider();
  const system = getSystemPrompt('editing');

  const filesContext = Object.entries(files)
    .map(([path, content]) => `--- ${path} ---\n${content}`)
    .join('\n\n');

  const rootCauseContext = rootCause
    ? `\n\nRoot cause from analysis: ${rootCause.source} wrote ${rootCause.register} (${rootCause.value}) — ${rootCause.detail}`
    : '';

  const planContext = plan.steps
    .map((s) => `- ${s.action} ${s.file}: ${s.description}`)
    .join('\n');

  const planFiles = new Set(plan.steps.map((s) => s.file));

  const generateOps = async () => {
    const { object } = await generateObject({
      model,
      schema: editSourceResultSchema,
      system,
      prompt: `Approved plan:\n${planContext}${rootCauseContext}\n\nCurrent source files:\n${filesContext}`,
    });
    return object;
  };

  // Filter valid operations using the validator (per-operation)
  const filterValid = (ops: z.infer<typeof editSourceResultSchema>['operations']) =>
    ops.filter((op) => validateEditOperations([op], planFiles, files).valid);

  // First attempt
  let result = await generateOps();
  let validOps = filterValid(result.operations);

  // If all operations were invalid (and there were some), retry once
  if (validOps.length === 0 && result.operations.length > 0) {
    result = await generateOps();
    validOps = filterValid(result.operations);

    if (validOps.length === 0) {
      const validation = validateEditOperations(result.operations, planFiles, files);
      throw LLMValidationError.fromErrors(validation.errors);
    }
  }

  return { operations: validOps as FileOperation[], summary: result.summary };
}

// ── patching state ─────────────────────────────────────────────────

/**
 * Propose a source code patch based on the causal engine's root cause.
 * Replaces the hardcoded proposePatch() in authoring-loop.ts.
 */
export async function proposePatchLLM(
  rootCause: RootCause,
  files: Record<string, string>,
  assertion: AcceptanceCriterion
): Promise<PatchProposal> {
  const model = getLLMProvider();
  const system = getSystemPrompt('patching');

  const filesContext = Object.entries(files)
    .map(([path, content]) => `--- ${path} ---\n${content}`)
    .join('\n\n');

  const patch = await validateWithRetry(
    async () => {
      const { object } = await generateObject({
        model,
        schema: patchProposalSchema,
        system,
        prompt: `Root cause: ${rootCause.source} wrote ${rootCause.register} (${rootCause.value}) at time ${rootCause.time}µs. ${rootCause.detail}\n\nExpected: ${assertion.register} should be ${assertion.expect} by ${assertion.byTime}µs (${assertion.name})\n\nCurrent source files:\n${filesContext}\n\nPropose a minimal patch to fix the root cause.`,
      });
      return object as unknown as PatchProposal;
    },
    (p) => validatePatchProposal(p),
  );

  return patch;
}
