import { generateText } from 'ai';
import { getLLMProvider } from './provider';
import { getSystemPrompt } from './prompts';
import { type FileOperation } from './tools';

/**
 * LLM functions for each FSM state that requires LLM capability.
 *
 * The LLM serves the FSM — it does not decide state transitions.
 * Each function is called within its designated state and returns
 * structured output the FSM consumes.
 */

// ── Shared types ───────────────────────────────────────────────────

interface AcceptanceCriterion {
  name: string;
  register: string;
  expect: string;
  byTime: number;
}

interface RootCause {
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

  const { text } = await generateText({
    model,
    system,
    prompt: `Intent: ${intent}\n\nBoard: ${board.name} (${board.mcu}, ${board.architecture})\n\nAcceptance criteria:\n${criteriaContext}\n\nCurrent source files:\n${filesContext}\n\nRespond with a JSON object: {"steps": [{"file": string, "action": "create"|"modify"|"delete", "description": string}], "summary": string}`,
  });

  // Parse the JSON response
  try {
    const parsed = JSON.parse(text);
    return parsed as Plan;
  } catch {
    throw new Error(`Failed to parse plan from LLM response: ${text}`);
  }
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

  const { text } = await generateText({
    model,
    system,
    prompt: `Approved plan:\n${planContext}${rootCauseContext}\n\nCurrent source files:\n${filesContext}\n\nRespond with a JSON object: {"operations": [{"type": "write"|"edit", "path": string, ...}], "summary": string}\nFor write: include "content" field. For edit: include "search" and "replace" fields.`,
  });

  // Parse the JSON response
  try {
    const parsed = JSON.parse(text);
    return {
      operations: parsed.operations || [],
      summary: parsed.summary || text,
    };
  } catch {
    return { operations: [], summary: text };
  }
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

  const { text } = await generateText({
    model,
    system,
    prompt: `Root cause: ${rootCause.source} wrote ${rootCause.register} (${rootCause.value}) at time ${rootCause.time}µs. ${rootCause.detail}\n\nExpected: ${assertion.register} should be ${assertion.expect} by ${assertion.byTime}µs (${assertion.name})\n\nCurrent source files:\n${filesContext}\n\nPropose a minimal patch to fix the root cause. Respond with JSON: {"file": string, "before": string, "after": string, "summary": string, "confidence": number (0-1)}`,
  });

  // Parse the JSON response
  try {
    const parsed = JSON.parse(text);
    return parsed as PatchProposal;
  } catch {
    throw new Error(`Failed to parse patch from LLM response: ${text}`);
  }
}
