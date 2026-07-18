import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRateLimiter } from './trpc/middleware/rateLimit';

// ── Rate Limiter Tests ───────────────────────────────────────────────

describe('createRateLimiter', () => {
  it('allows requests within the limit', () => {
    const limiter = createRateLimiter(60_000, 3);

    const r1 = limiter.check('user-1');
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = limiter.check('user-1');
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = limiter.check('user-1');
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it('denies requests after the limit is exceeded', () => {
    const limiter = createRateLimiter(60_000, 2);

    limiter.check('user-1');
    limiter.check('user-1');

    const r3 = limiter.check('user-1');
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it('resets after the window expires', async () => {
    const limiter = createRateLimiter(50, 1); // 50ms window, 1 request

    const r1 = limiter.check('user-1');
    expect(r1.allowed).toBe(true);

    const r2 = limiter.check('user-1');
    expect(r2.allowed).toBe(false);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 60));

    const r3 = limiter.check('user-1');
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it('tracks different keys independently', () => {
    const limiter = createRateLimiter(60_000, 1);

    const r1 = limiter.check('user-1');
    expect(r1.allowed).toBe(true);

    const r2 = limiter.check('user-2');
    expect(r2.allowed).toBe(true);

    const r3 = limiter.check('user-1');
    expect(r3.allowed).toBe(false);
  });

  it('reset removes a specific key', () => {
    const limiter = createRateLimiter(60_000, 1);

    limiter.check('user-1');
    const blocked = limiter.check('user-1');
    expect(blocked.allowed).toBe(false);

    limiter.reset('user-1');
    const afterReset = limiter.check('user-1');
    expect(afterReset.allowed).toBe(true);
  });

  it('clear removes all keys', () => {
    const limiter = createRateLimiter(60_000, 1);

    limiter.check('user-1');
    limiter.check('user-2');

    limiter.clear();

    const r1 = limiter.check('user-1');
    expect(r1.allowed).toBe(true);

    const r2 = limiter.check('user-2');
    expect(r2.allowed).toBe(true);
  });

  it('returns a resetAt date in the future', () => {
    const limiter = createRateLimiter(60_000, 5);
    const before = Date.now();

    const result = limiter.check('user-1');
    expect(result.resetAt.getTime()).toBeGreaterThan(before);
    expect(result.resetAt.getTime()).toBeLessThanOrEqual(before + 60_000 + 10);
  });
});

// ── Health Check Tests (mocked) ──────────────────────────────────────

describe('healthCheck', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns ok when both checks pass', async () => {
    // Mock the db module
    vi.doMock('./db', () => ({
      db: {
        execute: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
      },
    }));

    // Mock the config module
    vi.doMock('./config', () => ({
      getInngestConfig: () => ({ baseUrl: 'http://localhost:3000' }),
    }));

    // Mock fetch for inngest check
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    try {
      const { healthCheck } = await import('./health');
      const result = await healthCheck();

      expect(result.status).toBe('ok');
      expect(result.checks.supabase).toBe('ok');
      expect(result.checks.inngest).toBe('ok');
      expect(result.timestamp).toBeDefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns degraded when supabase is down', async () => {
    vi.doMock('./db', () => ({
      db: {
        execute: vi.fn().mockRejectedValue(new Error('connection refused')),
      },
    }));

    vi.doMock('./config', () => ({
      getInngestConfig: () => ({ baseUrl: 'http://localhost:3000' }),
    }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    try {
      const { healthCheck } = await import('./health');
      const result = await healthCheck();

      expect(result.status).toBe('degraded');
      expect(result.checks.supabase).toBe('error');
      expect(result.checks.inngest).toBe('ok');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns degraded when inngest is down', async () => {
    vi.doMock('./db', () => ({
      db: {
        execute: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
      },
    }));

    vi.doMock('./config', () => ({
      getInngestConfig: () => ({ baseUrl: 'http://localhost:3000' }),
    }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fetch failed'));

    try {
      const { healthCheck } = await import('./health');
      const result = await healthCheck();

      expect(result.status).toBe('degraded');
      expect(result.checks.supabase).toBe('ok');
      expect(result.checks.inngest).toBe('error');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ── Queue Health Tests (mocked) ──────────────────────────────────────

describe('queueHealth', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns pending and running counts', async () => {
    const mockSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ value: 5 }]),
      }),
    });

    vi.doMock('./db', () => ({
      db: {
        select: mockSelect
          // First call: pending count
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ value: 3 }]),
            }),
          })
          // Second call: running count
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ value: 2 }]),
            }),
          }),
      },
    }));

    vi.doMock('./db/schema', () => ({
      runs: { status: 'status', createdAt: 'created_at' },
      tasks: { status: 'status' },
    }));

    vi.doMock('drizzle-orm', async () => {
      const actual = await vi.importActual('drizzle-orm');
      return {
        ...actual,
        count: () => 'count(*)',
        eq: (col: unknown, val: unknown) => ({ eq: true, col, val }),
        sql: (strings: TemplateStringsArray, ...values: unknown[]) => strings.join(''),
      };
    });

    const { queueHealth } = await import('./health');
    const result = await queueHealth();

    expect(result.pendingRuns).toBe(3);
    expect(result.runningRuns).toBe(2);
    expect(result.timestamp).toBeDefined();
  });
});

// ── Metrics Tests (mocked) ───────────────────────────────────────────

describe('metrics', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('calculates success rate and metrics', async () => {
    let callIndex = 0;
    const mockResults = [
      [{ value: 10 }], // total runs
      [{ value: 7 }],  // passed runs
      [{ value: '1500' }], // avg duration
      [{ value: 3 }],  // active tasks
    ];

    const buildChain = () => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          const result = mockResults[callIndex] ?? [{ value: 0 }];
          callIndex++;
          return Promise.resolve(result);
        }),
      }),
    });

    vi.doMock('./db', () => ({
      db: {
        select: vi.fn().mockImplementation(() => buildChain()),
      },
    }));

    vi.doMock('./db/schema', () => ({
      runs: { status: 'status', createdAt: 'created_at', elapsedMs: 'elapsed_ms' },
      tasks: { status: 'status' },
    }));

    vi.doMock('drizzle-orm', async () => {
      const actual = await vi.importActual('drizzle-orm');
      return {
        ...actual,
        count: () => 'count(*)',
        avg: (col: unknown) => ({ avg: true, col }),
        eq: (col: unknown, val: unknown) => ({ eq: true, col, val }),
        and: (...args: unknown[]) => ({ and: true, args }),
        gte: (col: unknown, val: unknown) => ({ gte: true, col, val }),
        sql: (strings: TemplateStringsArray, ...values: unknown[]) => strings.join(''),
      };
    });

    const { metrics } = await import('./health');
    const result = await metrics();

    expect(result.runs24h).toBe(10);
    expect(result.successRate).toBe(70);
    expect(result.avgDurationMs).toBe(1500);
    expect(result.activeTasks).toBe(3);
    expect(result.timestamp).toBeDefined();
  });

  it('returns 0 success rate when no runs exist', async () => {
    let callIndex = 0;
    const mockResults = [
      [{ value: 0 }], // total runs
      [{ value: 0 }], // passed runs
      [{ value: '0' }], // avg duration
      [{ value: 0 }],  // active tasks
    ];

    const buildChain = () => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          const result = mockResults[callIndex] ?? [{ value: 0 }];
          callIndex++;
          return Promise.resolve(result);
        }),
      }),
    });

    vi.doMock('./db', () => ({
      db: {
        select: vi.fn().mockImplementation(() => buildChain()),
      },
    }));

    vi.doMock('./db/schema', () => ({
      runs: { status: 'status', createdAt: 'created_at', elapsedMs: 'elapsed_ms' },
      tasks: { status: 'status' },
    }));

    vi.doMock('drizzle-orm', async () => {
      const actual = await vi.importActual('drizzle-orm');
      return {
        ...actual,
        count: () => 'count(*)',
        avg: (col: unknown) => ({ avg: true, col }),
        eq: (col: unknown, val: unknown) => ({ eq: true, col, val }),
        and: (...args: unknown[]) => ({ and: true, args }),
        gte: (col: unknown, val: unknown) => ({ gte: true, col, val }),
        sql: (strings: TemplateStringsArray, ...values: unknown[]) => strings.join(''),
      };
    });

    const { metrics } = await import('./health');
    const result = await metrics();

    expect(result.runs24h).toBe(0);
    expect(result.successRate).toBe(0);
    expect(result.avgDurationMs).toBe(0);
    expect(result.activeTasks).toBe(0);
  });
});
