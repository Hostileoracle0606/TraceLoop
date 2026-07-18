import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRateLimiter } from '../../middleware/rateLimit';

describe('rate limiter contracts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Basic rate limiting ────────────────────────────────────────────

  describe('basic rate limiting', () => {
    it('allows requests under the limit', () => {
      const limiter = createRateLimiter(60_000, 5);

      for (let i = 0; i < 5; i++) {
        const result = limiter.check('user-1');
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(5 - i - 1);
      }
    });

    it('blocks requests over the limit', () => {
      const limiter = createRateLimiter(60_000, 3);

      // Use up the limit
      limiter.check('user-1');
      limiter.check('user-1');
      limiter.check('user-1');

      // Next request should be blocked
      const result = limiter.check('user-1');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('first request in window returns correct remaining count', () => {
      const limiter = createRateLimiter(60_000, 10);
      const result = limiter.check('user-1');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it('remaining count decrements correctly', () => {
      const limiter = createRateLimiter(60_000, 5);

      const r1 = limiter.check('user-1');
      expect(r1.remaining).toBe(4);

      const r2 = limiter.check('user-1');
      expect(r2.remaining).toBe(3);

      const r3 = limiter.check('user-1');
      expect(r3.remaining).toBe(2);
    });
  });

  // ── Window reset ───────────────────────────────────────────────────

  describe('window reset', () => {
    it('resets after window expires', () => {
      const limiter = createRateLimiter(60_000, 2);

      // Use up the limit
      limiter.check('user-1');
      limiter.check('user-1');

      // Blocked
      expect(limiter.check('user-1').allowed).toBe(false);

      // Advance time past the window
      vi.advanceTimersByTime(60_001);

      // Should be allowed again
      const result = limiter.check('user-1');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
    });

    it('does not reset before window expires', () => {
      const limiter = createRateLimiter(60_000, 2);

      limiter.check('user-1');
      limiter.check('user-1');

      // Advance time but not past the window
      vi.advanceTimersByTime(59_999);

      // Still blocked
      expect(limiter.check('user-1').allowed).toBe(false);
    });

    it('resetAt is in the future', () => {
      const limiter = createRateLimiter(60_000, 5);
      const now = Date.now();
      const result = limiter.check('user-1');

      expect(result.resetAt.getTime()).toBeGreaterThan(now);
      expect(result.resetAt.getTime()).toBeLessThanOrEqual(now + 60_000);
    });

    it('resetAt stays consistent within window', () => {
      const limiter = createRateLimiter(60_000, 5);

      const r1 = limiter.check('user-1');
      const r2 = limiter.check('user-1');

      expect(r1.resetAt.getTime()).toBe(r2.resetAt.getTime());
    });
  });

  // ── Per-user isolation ─────────────────────────────────────────────

  describe('per-user isolation', () => {
    it('different users have separate limits', () => {
      const limiter = createRateLimiter(60_000, 2);

      // User 1 uses their limit
      limiter.check('user-1');
      limiter.check('user-1');
      expect(limiter.check('user-1').allowed).toBe(false);

      // User 2 should still be allowed
      expect(limiter.check('user-2').allowed).toBe(true);
      expect(limiter.check('user-2').allowed).toBe(true);
      expect(limiter.check('user-2').allowed).toBe(false);
    });

    it('user-1 reset does not affect user-2', () => {
      const limiter = createRateLimiter(60_000, 1);

      limiter.check('user-1');
      limiter.check('user-2');

      // Both are at limit
      expect(limiter.check('user-1').allowed).toBe(false);
      expect(limiter.check('user-2').allowed).toBe(false);

      // Advance time past window
      vi.advanceTimersByTime(60_001);

      // Both should be allowed again independently
      expect(limiter.check('user-1').allowed).toBe(true);
      expect(limiter.check('user-2').allowed).toBe(true);
    });

    it('three users have independent counters', () => {
      const limiter = createRateLimiter(60_000, 1);

      expect(limiter.check('a').allowed).toBe(true);
      expect(limiter.check('b').allowed).toBe(true);
      expect(limiter.check('c').allowed).toBe(true);

      expect(limiter.check('a').allowed).toBe(false);
      expect(limiter.check('b').allowed).toBe(false);
      expect(limiter.check('c').allowed).toBe(false);
    });
  });

  // ── Manual reset/clear ─────────────────────────────────────────────

  describe('manual reset', () => {
    it('reset clears a specific key', () => {
      const limiter = createRateLimiter(60_000, 1);

      limiter.check('user-1');
      expect(limiter.check('user-1').allowed).toBe(false);

      limiter.reset('user-1');
      expect(limiter.check('user-1').allowed).toBe(true);
    });

    it('reset does not affect other keys', () => {
      const limiter = createRateLimiter(60_000, 1);

      limiter.check('user-1');
      limiter.check('user-2');

      limiter.reset('user-1');

      expect(limiter.check('user-1').allowed).toBe(true);
      expect(limiter.check('user-2').allowed).toBe(false);
    });

    it('clear resets all keys', () => {
      const limiter = createRateLimiter(60_000, 1);

      limiter.check('user-1');
      limiter.check('user-2');
      limiter.check('user-3');

      limiter.clear();

      expect(limiter.check('user-1').allowed).toBe(true);
      expect(limiter.check('user-2').allowed).toBe(true);
      expect(limiter.check('user-3').allowed).toBe(true);
    });
  });

  // ── Configuration ──────────────────────────────────────────────────

  describe('configuration', () => {
    it('respects custom window size', () => {
      const limiter = createRateLimiter(10_000, 1); // 10 second window

      limiter.check('user-1');
      expect(limiter.check('user-1').allowed).toBe(false);

      vi.advanceTimersByTime(10_001);
      expect(limiter.check('user-1').allowed).toBe(true);
    });

    it('respects custom max count', () => {
      const limiter = createRateLimiter(60_000, 1);

      expect(limiter.check('user-1').allowed).toBe(true);
      expect(limiter.check('user-1').allowed).toBe(false);
    });

    it('works with max=1', () => {
      const limiter = createRateLimiter(60_000, 1);

      const r1 = limiter.check('user-1');
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(0);

      const r2 = limiter.check('user-1');
      expect(r2.allowed).toBe(false);
      expect(r2.remaining).toBe(0);
    });

    it('works with large max', () => {
      const limiter = createRateLimiter(60_000, 1000);

      for (let i = 0; i < 1000; i++) {
        expect(limiter.check('user-1').allowed).toBe(true);
      }
      expect(limiter.check('user-1').allowed).toBe(false);
    });
  });
});
