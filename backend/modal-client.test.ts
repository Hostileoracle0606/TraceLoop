import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config before any imports
vi.mock('./config', () => ({
  getModalEndpoint: () => 'https://modal.example.com',
}));

// Mock db (needed by resolveBoardSlug)
vi.mock('./db', () => ({
  db: { query: { boards: { findFirst: vi.fn() } } },
}));

import { modalClient } from './modal-client';

describe('modalClient.runJob', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  it('posts to the root endpoint and returns {build, trace} on success', async () => {
    const jobResult = {
      build: { ok: true, log: 'Built successfully in 42s' },
      trace: { log: 'TIM2_SR.UIF=1\nGPIOG_ODR[13]=1\n' },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(jobResult),
    });

    const result = await modalClient.runJob({
      files: { 'src/main.c': 'int main() {}' },
      board: 'stm32f4_disco',
    });

    expect(result).toEqual(jobResult);

    // Verify it POSTs to the root endpoint (not /build, /simulate, /analyze)
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://modal.example.com');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(options.body);
    expect(body).toEqual({
      files: { 'src/main.c': 'int main() {}' },
      board: 'stm32f4_disco',
    });
  });

  it('returns {build: {ok: false}} without trace when build fails', async () => {
    const jobResult = {
      build: { ok: false, log: "src/main.c:52: error: 'grn_led' undeclared" },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(jobResult),
    });

    const result = await modalClient.runJob({
      files: { 'src/main.c': 'bad code' },
      board: 'stm32f4_disco',
    });

    expect(result.build.ok).toBe(false);
    expect(result.build.log).toContain('undeclared');
    expect(result.trace).toBeUndefined();
  });

  it('throws on HTTP error responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });

    await expect(
      modalClient.runJob({
        files: { 'src/main.c': 'int main() {}' },
        board: 'stm32f4_disco',
      }),
    ).rejects.toThrow('Firmware job failed (500)');
  });

  it('throws when MODAL_ENDPOINT is not configured', async () => {
    // Temporarily override the mock to return undefined
    const { getModalEndpoint } = await import('./config');
    vi.doMock('./config', () => ({
      getModalEndpoint: () => undefined,
    }));

    // Need to re-import to get the new mock
    vi.resetModules();
    vi.stubGlobal('fetch', mockFetch);

    // Re-mock after resetModules
    vi.mock('./config', () => ({
      getModalEndpoint: () => undefined,
    }));
    vi.mock('./db', () => ({
      db: { query: { boards: { findFirst: vi.fn() } } },
    }));

    const { modalClient: freshClient } = await import('./modal-client');

    await expect(
      freshClient.runJob({
        files: { 'src/main.c': 'int main() {}' },
        board: 'stm32f4_disco',
      }),
    ).rejects.toThrow('MODAL_ENDPOINT not configured');
  });
});
