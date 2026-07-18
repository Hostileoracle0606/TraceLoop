import { TRPCError } from '@trpc/server';
import type { AnyMiddlewareFunction } from '@trpc/server/unstable-core-do-not-import';

// ── Rate Limiter ─────────────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
  reset(key: string): void;
  clear(): void;
}

/**
 * Factory for creating an in-memory rate limiter.
 * No external dependencies — uses a simple Map.
 */
export function createRateLimiter(windowMs: number = 60_000, max: number = 100): RateLimiter {
  const store = new Map<string, RateLimitEntry>();

  function check(key: string): RateLimitResult {
    const now = Date.now();
    const entry = store.get(key);

    // No entry or window expired — start a new window
    if (!entry || now >= entry.resetTime) {
      const resetTime = now + windowMs;
      store.set(key, { count: 1, resetTime });
      return {
        allowed: true,
        remaining: max - 1,
        resetAt: new Date(resetTime),
      };
    }

    // Within window — increment count
    entry.count += 1;

    if (entry.count > max) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(entry.resetTime),
      };
    }

    return {
      allowed: true,
      remaining: max - entry.count,
      resetAt: new Date(entry.resetTime),
    };
  }

  function reset(key: string): void {
    store.delete(key);
  }

  function clear(): void {
    store.clear();
  }

  return { check, reset, clear };
}

// ── Default limiter instance ─────────────────────────────────────────

const defaultLimiter = createRateLimiter(60_000, 100);

// ── tRPC Middleware ──────────────────────────────────────────────────

/**
 * tRPC middleware that enforces per-user rate limiting.
 * Uses userId as the rate limit key.
 * Throws TOO_MANY_REQUESTS when the limit is exceeded.
 */
export function rateLimitMiddleware({ limiter = defaultLimiter }: { limiter?: RateLimiter } = {}): AnyMiddlewareFunction {
  return async ({ ctx, next }) => {
    const key = (ctx as { user?: { id: string } | null })?.user?.id ?? 'anonymous';
    const result = limiter.check(key);

    if (!result.allowed) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Rate limit exceeded. Please try again later.',
      });
    }

    return next({ ctx });
  };
}

// Export the default limiter for testing and manual reset
export { defaultLimiter };
