import { describe, it, expect } from 'vitest';
import {
  AgentProviderError,
  HttpResponseError,
  classifyProviderError,
} from '../errors';
import { classifyFailure } from '../../inngest/functions';
import { ZodError, z } from 'zod';

describe('classifyProviderError', () => {
  it('passes through an existing AgentProviderError unchanged', () => {
    const e = new AgentProviderError('provider-timeout', 'slow');
    expect(classifyProviderError(e)).toBe(e);
  });

  it('classifies HTTP statuses to stable classes', () => {
    expect(classifyProviderError(new HttpResponseError(401, 'no')).errorClass).toBe('provider-auth');
    expect(classifyProviderError(new HttpResponseError(403, 'no')).errorClass).toBe('provider-auth');
    expect(classifyProviderError(new HttpResponseError(404, 'gone')).errorClass).toBe('provider-resource-missing');
    expect(classifyProviderError(new HttpResponseError(429, 'later')).errorClass).toBe('provider-rate-limited');
    expect(classifyProviderError(new HttpResponseError(503, 'down')).errorClass).toBe('provider-unavailable');
  });

  it('marks retryable classes correctly', () => {
    expect(classifyProviderError(new HttpResponseError(429, '')).retryable).toBe(true);
    expect(classifyProviderError(new HttpResponseError(503, '')).retryable).toBe(true);
    expect(classifyProviderError(new HttpResponseError(401, '')).retryable).toBe(false);
    expect(classifyProviderError(new HttpResponseError(404, '')).retryable).toBe(false);
  });

  it('classifies aborts as cancelled', () => {
    const abort = new DOMException('aborted', 'AbortError');
    expect(classifyProviderError(abort).errorClass).toBe('cancelled');
  });

  it('classifies timeouts', () => {
    const t = new DOMException('timed out', 'TimeoutError');
    expect(classifyProviderError(t).errorClass).toBe('provider-timeout');
  });

  it('classifies JSON syntax errors as malformed responses', () => {
    let syntaxErr: unknown;
    try { JSON.parse('{nope'); } catch (e) { syntaxErr = e; }
    expect(classifyProviderError(syntaxErr).errorClass).toBe('provider-malformed-response');
  });

  it('classifies ZodErrors as validation-failed', () => {
    const r = z.object({ a: z.string() }).safeParse({ a: 1 });
    expect(r.success).toBe(false);
    expect(classifyProviderError((r as { error: ZodError }).error).errorClass).toBe('validation-failed');
  });

  it('classifies unknown network failures as provider-unavailable', () => {
    expect(classifyProviderError(new TypeError('fetch failed')).errorClass).toBe('provider-unavailable');
  });
});

describe('provider errors never become firmware failures (F5)', () => {
  it('classifyFailure treats AgentProviderError as infrastructure, not build/criteria', () => {
    const e = new AgentProviderError('provider-timeout', 'backboard timed out');
    const cls = classifyFailure(e, 'firmware-job');
    expect(cls).toBe('infra-failure');
  });
});
