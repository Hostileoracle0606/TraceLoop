/**
 * Stable provider-error taxonomy (issue 02 acceptance: provider errors map to
 * stable local classes instead of firmware failures).
 */

export const STABLE_ERROR_CLASSES = [
  'provider-timeout',
  'provider-rate-limited',
  'provider-auth',
  'provider-unavailable',
  'provider-malformed-response',
  'provider-resource-missing',
  'validation-failed',
  'budget-exceeded',
  'runtime-disabled',
  'runtime-unsupported',
  'cancelled',
] as const;

export type StableErrorClass = (typeof STABLE_ERROR_CLASSES)[number];

const RETRYABLE: ReadonlySet<StableErrorClass> = new Set([
  'provider-timeout',
  'provider-rate-limited',
  'provider-unavailable',
]);

export class AgentProviderError extends Error {
  readonly errorClass: StableErrorClass;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(errorClass: StableErrorClass, message: string, cause?: unknown) {
    super(message);
    this.name = 'AgentProviderError';
    this.errorClass = errorClass;
    this.retryable = RETRYABLE.has(errorClass);
    this.cause = cause;
  }
}

export class HttpResponseError extends Error {
  constructor(readonly status: number, readonly body: string) {
    super(`HTTP ${status}`);
    this.name = 'HttpResponseError';
  }
}

export function classifyProviderError(error: unknown): AgentProviderError {
  if (error instanceof AgentProviderError) return error;

  if (error instanceof HttpResponseError) {
    if (error.status === 401 || error.status === 403)
      return new AgentProviderError('provider-auth', error.message, error);
    if (error.status === 404)
      return new AgentProviderError('provider-resource-missing', error.message, error);
    if (error.status === 429)
      return new AgentProviderError('provider-rate-limited', error.message, error);
    return new AgentProviderError('provider-unavailable', error.message, error);
  }

  if (error instanceof DOMException && error.name === 'AbortError')
    return new AgentProviderError('cancelled', error.message, error);
  if (error instanceof DOMException && error.name === 'TimeoutError')
    return new AgentProviderError('provider-timeout', error.message, error);
  if (error instanceof SyntaxError)
    return new AgentProviderError('provider-malformed-response', error.message, error);
  // ZodError without importing zod here: duck-type on `issues`
  if (typeof error === 'object' && error !== null && 'issues' in error && Array.isArray((error as { issues: unknown }).issues))
    return new AgentProviderError('validation-failed', 'schema validation failed', error);

  const message = error instanceof Error ? error.message : String(error);
  return new AgentProviderError('provider-unavailable', message, error);
}
