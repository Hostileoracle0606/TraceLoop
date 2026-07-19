import { AgentProviderError, HttpResponseError, classifyProviderError } from '../../errors';

export interface BackboardClientConfig {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retryBaseMs?: number;
}

const MAX_ATTEMPTS = 3;

export class BackboardClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retryBaseMs: number;
  private readonly baseUrl: string;

  constructor(private readonly cfg: BackboardClientConfig) {
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.timeoutMs = cfg.timeoutMs ?? 30_000;
    this.retryBaseMs = cfg.retryBaseMs ?? 500;
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, '');
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  delete<T = unknown>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method,
          headers: {
            'X-API-Key': this.cfg.apiKey,
            'content-type': 'application/json',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!response.ok) {
          const err = new HttpResponseError(response.status, await response.text());
          const retryable = response.status === 429 || response.status >= 500;
          if (retryable && attempt < MAX_ATTEMPTS) {
            lastError = err;
            const retryAfterHeader = response.headers.get('retry-after');
            const retryAfterMs = retryAfterHeader !== null
              ? Number(retryAfterHeader) * 1000
              : this.retryBaseMs * 2 ** (attempt - 1);
            await new Promise((res) => setTimeout(res, retryAfterMs));
            continue;
          }
          throw err;
        }

        const text = await response.text();
        try {
          return (text === '' ? undefined : JSON.parse(text)) as T;
        } catch (e) {
          throw new AgentProviderError('provider-malformed-response', 'response body is not JSON', e);
        }
      } catch (e) {
        if (e instanceof AgentProviderError) throw e;
        if (e instanceof HttpResponseError) throw classifyProviderError(e);
        // AbortError / network errors are terminal for this attempt chain
        throw classifyProviderError(e);
      }
    }
    throw classifyProviderError(lastError);
  }
}
