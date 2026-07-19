import { describe, it, expect } from 'vitest';
import {
  agentStageTools,
  parseToolArguments,
  toJsonSchema,
} from './schemas';
import { AgentProviderError } from '../errors';

describe('agentStageTools', () => {
  it('defines exactly the six issue-01 tools', () => {
    expect(Object.keys(agentStageTools).sort()).toEqual([
      'report_blocker',
      'request_clarification',
      'submit_file_operations',
      'submit_patch',
      'submit_plan',
      'submit_task_contract',
    ]);
  });

  it('submit_plan accepts a valid plan and rejects an empty steps array', () => {
    const valid = { steps: [{ file: 'src/main.c', action: 'modify', description: 'fix pin' }], summary: 's' };
    expect(agentStageTools.submit_plan.schema.safeParse(valid).success).toBe(true);
    expect(agentStageTools.submit_plan.schema.safeParse({ steps: [], summary: 's' }).success).toBe(false);
  });

  it('submit_patch rejects confidence outside [0,1]', () => {
    const bad = { file: 'src/main.c', before: 'a', after: 'b', summary: 's', confidence: 1.5 };
    expect(agentStageTools.submit_patch.schema.safeParse(bad).success).toBe(false);
  });

  it('submit_task_contract requires at least one acceptance criterion', () => {
    const bad = { objective: 'blink LED', boardBuildTarget: 'stm32f4_disco', acceptanceCriteria: [] };
    expect(agentStageTools.submit_task_contract.schema.safeParse(bad).success).toBe(false);
  });
});

describe('parseToolArguments (F1)', () => {
  const schema = agentStageTools.submit_plan.schema;
  const plan = { steps: [{ file: 'src/main.c', action: 'modify', description: 'd' }], summary: 's' };

  it('accepts an already-parsed object', () => {
    expect(parseToolArguments(plan, schema)).toEqual(plan);
  });

  it('accepts single-encoded JSON string', () => {
    expect(parseToolArguments(JSON.stringify(plan), schema)).toEqual(plan);
  });

  it('accepts double-encoded JSON string', () => {
    expect(parseToolArguments(JSON.stringify(JSON.stringify(plan)), schema)).toEqual(plan);
  });

  it('throws provider-malformed-response on unparseable JSON', () => {
    try {
      parseToolArguments('{nope', schema);
      expect.unreachable();
    } catch (e) {
      expect((e as AgentProviderError).errorClass).toBe('provider-malformed-response');
    }
  });

  it('throws validation-failed on parseable but schema-invalid args', () => {
    try {
      parseToolArguments({ steps: [], summary: 's' }, schema);
      expect.unreachable();
    } catch (e) {
      expect((e as AgentProviderError).errorClass).toBe('validation-failed');
    }
  });
});

describe('toJsonSchema', () => {
  it('produces an object schema with required fields for submit_patch', () => {
    const js = toJsonSchema(agentStageTools.submit_patch) as { type: string; required?: string[] };
    expect(js.type).toBe('object');
    expect(js.required).toEqual(expect.arrayContaining(['file', 'before', 'after', 'summary', 'confidence']));
  });
});
