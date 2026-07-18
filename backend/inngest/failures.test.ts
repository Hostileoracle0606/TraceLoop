import { describe, it, expect, vi } from 'vitest';

// Mock config before any imports that depend on it
vi.mock('../config', () => ({
  getEnv: () => ({
    SUPABASE_URL: 'http://localhost',
    SUPABASE_ANON_KEY: 'test',
    SUPABASE_SERVICE_KEY: 'test',
    DATABASE_URL: 'http://localhost',
    MODAL_ENDPOINT: 'http://localhost',
    INNGEST_EVENT_KEY: 'test',
    INNGEST_BASE_URL: 'http://localhost',
    LLM_PROVIDER: 'anthropic',
    ANTHROPIC_API_KEY: 'test',
    PORT: 3000,
    NODE_ENV: 'test',
  }),
  getInngestConfig: () => ({ eventKey: 'test', baseUrl: 'http://localhost' }),
  getModalEndpoint: () => 'http://localhost',
  getPort: () => 3000,
  getNodeEnv: () => 'test',
}));

// Mock supabase
vi.mock('../supabase', () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({ update: () => ({ eq: () => ({}) }), insert: () => ({ values: () => ({}) }) }),
  }),
  getUserFromJwt: () => null,
}));

// Mock db
vi.mock('../db', () => ({
  db: { query: {}, insert: () => ({ values: () => ({}) }) },
}));

// Mock storage
vi.mock('../storage', () => ({
  uploadArtifact: vi.fn(),
}));

// Mock modal-client
vi.mock('../modal-client', () => ({
  modalClient: { firmwareJob: vi.fn() },
  resolveBoardSlug: vi.fn(),
}));

// Mock llm
vi.mock('../llm/functions', () => ({
  proposePatchLLM: vi.fn(),
}));

// Mock inngest client
vi.mock('./client', () => {
  const createFunction = (opts: unknown, handler: unknown) => handler;
  return {
    inngest: { createFunction, send: vi.fn() },
    Events: {
      TASK_RUN_REQUESTED: 'task/run.requested',
      TASK_CANCELLED: 'task/cancelled',
    },
  };
});

import { classifyFailure, type FailureType } from './functions';

describe('classifyFailure', () => {
  describe('firmware-job stage', () => {
    it('classifies network errors as infra-failure', () => {
      expect(classifyFailure(new Error('fetch failed'), 'firmware-job')).toBe('infra-failure');
      expect(classifyFailure(new Error('ECONNREFUSED 127.0.0.1:8080'), 'firmware-job')).toBe('infra-failure');
      expect(classifyFailure(new Error('ETIMEDOUT connecting to Modal'), 'firmware-job')).toBe('infra-failure');
      expect(classifyFailure(new Error('ENOTFOUND modal.example.com'), 'firmware-job')).toBe('infra-failure');
      expect(classifyFailure(new Error('MODAL_ENDPOINT not configured'), 'firmware-job')).toBe('infra-failure');
    });

    it('classifies HTTP errors as infra-failure', () => {
      expect(classifyFailure(new Error('Firmware job failed (500): Internal Server Error'), 'firmware-job')).toBe('infra-failure');
      expect(classifyFailure(new Error('status 502 Bad Gateway'), 'firmware-job')).toBe('infra-failure');
      expect(classifyFailure(new Error('failed to connect to endpoint'), 'firmware-job')).toBe('infra-failure');
    });

    it('classifies compiler errors as build-failure', () => {
      expect(classifyFailure(new Error('build failed: undefined reference to main'), 'firmware-job')).toBe('build-failure');
      expect(classifyFailure(new Error('compiler error: undeclared identifier'), 'firmware-job')).toBe('build-failure');
      expect(classifyFailure(new Error('CMake Error at CMakeLists.txt:10'), 'firmware-job')).toBe('build-failure');
      expect(classifyFailure(new Error('west build failed'), 'firmware-job')).toBe('build-failure');
      expect(classifyFailure(new Error('syntax error in main.c'), 'firmware-job')).toBe('build-failure');
    });

    it('classifies simulation errors as simulation-failure', () => {
      expect(classifyFailure(new Error('Renode crashed during simulation'), 'firmware-job')).toBe('simulation-failure');
      expect(classifyFailure(new Error('trace parse error: invalid JSON'), 'firmware-job')).toBe('simulation-failure');
      expect(classifyFailure(new Error('simulation timeout'), 'firmware-job')).toBe('simulation-failure');
    });

    it('defaults unknown firmware-job errors to infra-failure', () => {
      expect(classifyFailure(new Error('something unexpected'), 'firmware-job')).toBe('infra-failure');
      expect(classifyFailure(new Error('unknown error occurred'), 'firmware-job')).toBe('infra-failure');
    });

    it('handles non-Error objects', () => {
      expect(classifyFailure('fetch failed', 'firmware-job')).toBe('infra-failure');
      expect(classifyFailure(42, 'firmware-job')).toBe('infra-failure');
      expect(classifyFailure(null, 'firmware-job')).toBe('infra-failure');
    });
  });

  describe('analyze-results stage', () => {
    it('classifies trace parse errors as simulation-failure', () => {
      expect(classifyFailure(new Error('JSON parse error in trace log'), 'analyze-results')).toBe('simulation-failure');
      expect(classifyFailure(new Error('trace data is malformed'), 'analyze-results')).toBe('simulation-failure');
    });

    it('classifies engine exceptions as analysis-failure', () => {
      expect(classifyFailure(new Error('analyze threw TypeError'), 'analyze-results')).toBe('analysis-failure');
      expect(classifyFailure(new Error('engine crashed'), 'analyze-results')).toBe('analysis-failure');
      expect(classifyFailure(new Error('unexpected error in analysis'), 'analyze-results')).toBe('analysis-failure');
    });

    it('defaults unknown analyze errors to analysis-failure', () => {
      expect(classifyFailure(new Error('something went wrong'), 'analyze-results')).toBe('analysis-failure');
    });
  });
});

describe('FailureType', () => {
  it('has all expected failure types', () => {
    const types: FailureType[] = [
      'infra-failure',
      'build-failure',
      'simulation-failure',
      'analysis-failure',
      'test-failure',
    ];
    // TypeScript compile-time check: if FailureType changes, this will fail to compile
    expect(types).toHaveLength(5);
    expect(types).toContain('infra-failure');
    expect(types).toContain('build-failure');
    expect(types).toContain('simulation-failure');
    expect(types).toContain('analysis-failure');
    expect(types).toContain('test-failure');
  });
});
