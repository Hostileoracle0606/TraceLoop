import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isBackboardEnabled,
  resolveRuntimeForNewTask,
  resolveAgentRuntime,
  __resetRuntimeSelectionForTests,
} from '../runtime-selection';
import { LegacyAiSdkRuntime } from '../adapters/legacy-ai-sdk';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => { __resetRuntimeSelectionForTests(); });
afterEach(() => { process.env = { ...ORIGINAL_ENV }; __resetRuntimeSelectionForTests(); });

describe('F6: flag parsing has no boolean-coercion footgun', () => {
  it('unset → disabled', () => {
    delete process.env.AGENT_RUNTIME_BACKBOARD_ENABLED;
    expect(isBackboardEnabled()).toBe(false);
  });
  it('the string "false" → disabled (z.coerce.boolean would say true)', () => {
    process.env.AGENT_RUNTIME_BACKBOARD_ENABLED = 'false';
    expect(isBackboardEnabled()).toBe(false);
  });
  it('the string "true" → enabled', () => {
    process.env.AGENT_RUNTIME_BACKBOARD_ENABLED = 'true';
    expect(isBackboardEnabled()).toBe(true);
  });
});

describe('C1: selection for new tasks', () => {
  it('flag off → always legacy regardless of project default', () => {
    process.env.AGENT_RUNTIME_BACKBOARD_ENABLED = 'false';
    expect(resolveRuntimeForNewTask('backboard')).toBe('legacy');
  });
  it('flag on → honors the project default', () => {
    process.env.AGENT_RUNTIME_BACKBOARD_ENABLED = 'true';
    expect(resolveRuntimeForNewTask('backboard')).toBe('backboard');
    expect(resolveRuntimeForNewTask('legacy')).toBe('legacy');
  });
});

describe('C4/F8/F16: resolving a pinned task runtime', () => {
  it('legacy task resolves to LegacyAiSdkRuntime', () => {
    expect(resolveAgentRuntime({ agentRuntime: 'legacy' })).toBeInstanceOf(LegacyAiSdkRuntime);
  });
  it('backboard task with flag off → runtime-disabled (F16)', () => {
    process.env.AGENT_RUNTIME_BACKBOARD_ENABLED = 'false';
    expect(() => resolveAgentRuntime({ agentRuntime: 'backboard' }))
      .toThrowError(expect.objectContaining({ errorClass: 'runtime-disabled' }));
  });
  it('unknown value → runtime-unsupported, never a silent legacy fallback', () => {
    expect(() => resolveAgentRuntime({ agentRuntime: 'surprise' }))
      .toThrowError(expect.objectContaining({ errorClass: 'runtime-unsupported' }));
  });
});
