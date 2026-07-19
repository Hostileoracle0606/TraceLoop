import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runStatefulAuthoringLoop, proposePatch } from './authoring-loop';
import { greenLedAssertion } from '../fixtures/timer2-wrong-pin';
import type { FirmwareJobRunner, FirmwareJobRequest, FirmwareJobResult } from './firmware-job';

const zephyrLog = readFileSync(new URL('./__fixtures__/renode-zephyr-sample.log', import.meta.url), 'utf8');
const mainC = readFileSync(
  new URL('../../firmware-zephyr/timer2-wrong-pin/src/main.c', import.meta.url),
  'utf8',
);

// Fake compute plane: builds always succeed; the trace depends on which LED the
// ISR writes — orange (bug, pin 13 = 0x2000) or green (fixed, pin 12 = 0x1000).
function fakeCompute(): FirmwareJobRunner {
  return {
    async run(req: FirmwareJobRequest): Promise<FirmwareJobResult> {
      const src = req.files['src/main.c'] ?? '';
      const writesOrange = /gpio_pin_set_dt\(&orange_led, 1\)/.test(src);
      const log = writesOrange
        ? zephyrLog
        : zephyrLog.replace('BitSet), value 0x2000', 'BitSet), value 0x1000');
      return { build: { ok: true, log: 'built ok' }, trace: { log } };
    },
  };
}

// Fake compute plane that always fails to build
function failingCompute(): FirmwareJobRunner {
  return {
    async run(): Promise<FirmwareJobResult> {
      return { build: { ok: false, log: "src/main.c:52: error: 'grn_led' undeclared" } };
    },
  };
}

describe('runStatefulAuthoringLoop', () => {
  describe('happy path: converge in 2 iterations', () => {
    it('transitions through planning → editing → building → simulating → analyzing → patching → rerunning → building → ... → completed', async () => {
      const result = await runStatefulAuthoringLoop(
        { files: { 'src/main.c': mainC }, assertion: greenLedAssertion, board: 'stm32f4_disco' },
        fakeCompute(),
        { maxIterations: 5, profile: 'autonomous' },
      );

      // Should converge: iter1 fails + patches, iter2 passes
      expect(result.finalState).toBe('completed');
      expect(result.result.status).toBe('passed');
      if (result.result.status === 'passed') {
        expect(result.result.iterations).toBe(2);
        expect(result.result.files['src/main.c']).toContain('gpio_pin_set_dt(&green_led, 1)');
      }

      // Audit log should contain the full state flow
      const states = result.auditLog.map(t => t.to);
      expect(states).toContain('editing');
      expect(states).toContain('building');
      expect(states).toContain('simulating');
      expect(states).toContain('analyzing');
      expect(states).toContain('patching');
      expect(states).toContain('rerunning');
      expect(states).toContain('completed');
    });
  });

  describe('build failure', () => {
    it('transitions to editing on build failure, then blocked if max iterations hit', async () => {
      const result = await runStatefulAuthoringLoop(
        { files: { 'src/main.c': mainC }, assertion: greenLedAssertion, board: 'stm32f4_disco' },
        failingCompute(),
        { maxIterations: 2, profile: 'autonomous' },
      );

      // Should hit max iterations and block
      expect(result.finalState).toBe('blocked');
      expect(result.result.status).toBe('build-failed');

      // Audit log should show build-failed transitions
      const reasons = result.auditLog.map(t => t.reason);
      expect(reasons).toContain('build-failed');
      expect(reasons).toContain('budget-exhausted');
    });
  });

  describe('resource limits', () => {
    it('transitions to blocked when iteration limit is exceeded', async () => {
      // A compute plane that always returns the buggy trace (never converges)
      const stuckCompute: FirmwareJobRunner = {
        async run() {
          return { build: { ok: true, log: 'ok' }, trace: { log: zephyrLog } };
        },
      };

      const result = await runStatefulAuthoringLoop(
        { files: { 'src/main.c': mainC }, assertion: greenLedAssertion, board: 'stm32f4_disco' },
        stuckCompute,
        { maxIterations: 2, profile: 'autonomous', resourceControls: { maxIterations: 2, maxTimeMs: 60_000, maxCostUsd: 10 } },
      );

      expect(result.finalState).toBe('blocked');
      expect(result.result.status).toBe('gave-up');
      expect(result.resourceUsage.iterations).toBe(2);
    });

    it('transitions to blocked when time limit is exceeded', async () => {
      const result = await runStatefulAuthoringLoop(
        { files: { 'src/main.c': mainC }, assertion: greenLedAssertion, board: 'stm32f4_disco' },
        fakeCompute(),
        {
          maxIterations: 5,
          profile: 'autonomous',
          resourceControls: { maxIterations: 5, maxTimeMs: 0, maxCostUsd: 10 }, // 0ms = immediate timeout
          startTimeMs: Date.now() - 1000, // started 1 second ago
        },
      );

      expect(result.finalState).toBe('blocked');
    });
  });

  describe('cancellation', () => {
    it('transitions to stopped when user cancels', async () => {
      let cancelled = false;
      const slowCompute: FirmwareJobRunner = {
        async run() {
          await new Promise(resolve => setTimeout(resolve, 10));
          cancelled = true; // Cancel after first build
          return { build: { ok: true, log: 'ok' }, trace: { log: zephyrLog } };
        },
      };

      const result = await runStatefulAuthoringLoop(
        { files: { 'src/main.c': mainC }, assertion: greenLedAssertion, board: 'stm32f4_disco' },
        slowCompute,
        { maxIterations: 5, profile: 'autonomous', isCancelled: () => cancelled },
      );

      expect(result.finalState).toBe('stopped');
      expect(result.auditLog.some(t => t.reason === 'user-cancelled')).toBe(true);
    });
  });

  describe('audit log', () => {
    it('records every state transition with reason, actor, and timestamp', async () => {
      const result = await runStatefulAuthoringLoop(
        { files: { 'src/main.c': mainC }, assertion: greenLedAssertion, board: 'stm32f4_disco' },
        fakeCompute(),
        { maxIterations: 5, profile: 'autonomous' },
      );

      // Every transition should have required fields
      for (const entry of result.auditLog) {
        expect(entry.from).toBeTruthy();
        expect(entry.to).toBeTruthy();
        expect(entry.reason).toBeTruthy();
        expect(entry.actor).toBeTruthy();
        expect(entry.timestamp).toBeTruthy();
      }

      // First transition should be planning → editing
      expect(result.auditLog[0]?.from).toBe('planning');
      expect(result.auditLog[0]?.to).toBe('editing');
      expect(result.auditLog[0]?.reason).toBe('plan-approved');

      // Last transition should end in completed
      const lastEntry = result.auditLog[result.auditLog.length - 1];
      expect(lastEntry?.to).toBe('completed');
    });
  });

  describe('permission profile', () => {
    it('pauses in review mode when patch approval is required', async () => {
      const result = await runStatefulAuthoringLoop(
        { files: { 'src/main.c': mainC }, assertion: greenLedAssertion, board: 'stm32f4_disco' },
        fakeCompute(),
        { maxIterations: 5, profile: 'review' },
      );

      // Review mode requires approval for apply-patch — loop should pause
      expect(result.finalState).toBe('patching');
      expect(result.auditLog.some(t => t.reason === 'awaiting-approval')).toBe(true);
      // Should NOT have converged
      expect(result.result.status).not.toBe('passed');
      // Files should remain unchanged (no patch applied)
      if (result.result.status === 'gave-up') {
        expect(result.result.files['src/main.c']).toBe(mainC);
      }
      // No forged patch-approved transition
      expect(result.auditLog.some(t => t.reason === 'patch-approved')).toBe(false);
    });

    it('pauses in guided mode when patch approval is required', async () => {
      const result = await runStatefulAuthoringLoop(
        { files: { 'src/main.c': mainC }, assertion: greenLedAssertion, board: 'stm32f4_disco' },
        fakeCompute(),
        { maxIterations: 5, profile: 'guided' },
      );

      // Guided mode requires approval at patch checkpoint
      expect(result.finalState).toBe('patching');
      expect(result.auditLog.some(t => t.reason === 'awaiting-approval')).toBe(true);
      // Files should remain unchanged (no patch applied)
      if (result.result.status === 'gave-up') {
        expect(result.result.files['src/main.c']).toBe(mainC);
      }
      // No forged patch-approved transition
      expect(result.auditLog.some(t => t.reason === 'patch-approved')).toBe(false);
    });

    it('converges in autonomous mode (no approval needed)', async () => {
      const result = await runStatefulAuthoringLoop(
        { files: { 'src/main.c': mainC }, assertion: greenLedAssertion, board: 'stm32f4_disco' },
        fakeCompute(),
        { maxIterations: 5, profile: 'autonomous' },
      );

      // Autonomous mode auto-allows patches
      expect(result.finalState).toBe('completed');
      expect(result.result.status).toBe('passed');
      // Patch should be applied
      if (result.result.status === 'passed') {
        expect(result.result.files['src/main.c']).toContain('gpio_pin_set_dt(&green_led, 1)');
      }
      // patch-approved should be recorded with actor 'system' (auto-approval)
      const patchApproved = result.auditLog.find(t => t.reason === 'patch-approved');
      expect(patchApproved).toBeDefined();
      expect(patchApproved?.actor).toBe('system');
    });
  });

  describe('resource usage tracking', () => {
    it('tracks iterations, elapsed time, and cost', async () => {
      const startTime = Date.now() - 5000; // 5 seconds ago
      const result = await runStatefulAuthoringLoop(
        { files: { 'src/main.c': mainC }, assertion: greenLedAssertion, board: 'stm32f4_disco' },
        fakeCompute(),
        { maxIterations: 5, profile: 'autonomous', startTimeMs: startTime, currentCostUsd: 1.23 },
      );

      expect(result.resourceUsage.iterations).toBe(2);
      expect(result.resourceUsage.elapsedMs).toBeGreaterThanOrEqual(5000);
      expect(result.resourceUsage.costUsd).toBe(1.23);
    });
  });
});
