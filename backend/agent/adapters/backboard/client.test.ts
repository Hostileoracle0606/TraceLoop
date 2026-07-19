import { describe, it, expect, vi } from 'vitest';
import { BackboardClient } from './client';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function makeClient(fetchImpl: typeof fetch) {
  return new BackboardClient({
    baseUrl: 'https://backboard.example/api',
    apiKey: 'sk-spike-test',
    fetchImpl,
    retryBaseMs: 0, // no real waiting in tests
  });
}

describe('BackboardClient mechanics', () => {
  it('sends the API key header and parses JSON', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://backboard.example/api/threads');
      expect(new Headers(init?.headers).get('x-api-key')).toBe('sk-spike-test');
      return jsonResponse(200, { id: 'th_1' });
    });
    const client = makeClient(fetchImpl as unknown as typeof fetch);
    const out = await client.post<{ id: string }>('/threads', { name: 'traceloop-spike-t' });
    expect(out.id).toBe('th_1');
  });

  it('F13: retries 429 honoring Retry-After, then succeeds', async () => {
    const calls: number[] = [];
    const fetchImpl = vi.fn(async () => {
      calls.push(Date.now());
      return calls.length < 3
        ? jsonResponse(429, { error: 'rate' }, { 'retry-after': '0' })
        : jsonResponse(200, { ok: true });
    });
    const client = makeClient(fetchImpl as unknown as typeof fetch);
    const out = await client.post<{ ok: boolean }>('/threads', {});
    expect(out.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('F13: gives up after 3 attempts with provider-rate-limited', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(429, {}, { 'retry-after': '0' }));
    const client = makeClient(fetchImpl as unknown as typeof fetch);
    await expect(client.post('/threads', {})).rejects.toMatchObject({ errorClass: 'provider-rate-limited' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry non-429 4xx', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, {}));
    const client = makeClient(fetchImpl as unknown as typeof fetch);
    await expect(client.post('/threads', {})).rejects.toMatchObject({ errorClass: 'provider-auth' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries 5xx then classifies as provider-unavailable when exhausted', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(503, {}));
    const client = makeClient(fetchImpl as unknown as typeof fetch);
    await expect(client.post('/threads', {})).rejects.toMatchObject({ errorClass: 'provider-unavailable' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('classifies invalid JSON bodies as provider-malformed-response', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>oops</html>', { status: 200 }));
    const client = makeClient(fetchImpl as unknown as typeof fetch);
    await expect(client.get('/threads/t1')).rejects.toMatchObject({ errorClass: 'provider-malformed-response' });
  });
});
