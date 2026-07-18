import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { analyzeTraceStep } from './functions';
import { greenLedAssertion } from '../../src/fixtures/timer2-wrong-pin';

const realLog = readFileSync(
  new URL('../../src/engine/__fixtures__/renode-sample.log', import.meta.url),
  'utf8',
);

describe('analyzeTraceStep', () => {
  it('uses parseRenodeLog (not JSON.parse) to process a raw Renode trace string', () => {
    // The raw Renode log is plain text — JSON.parse would throw on it.
    // The step must parse it via parseRenodeLog and run analyze().
    const result = analyzeTraceStep(realLog, [greenLedAssertion]);

    // The real log writes pin 13 (orange), not pin 12 (green) → failed
    expect(result.status).toBe('failed');
    expect(result.rootCauseText).toBeDefined();
    expect(result.rootCauseText).not.toBe('No acceptance criteria to prove');
  });

  it('returns failed when acceptance criteria are empty (empty ≠ passed)', () => {
    const result = analyzeTraceStep(realLog, []);

    expect(result.status).toBe('failed');
    expect(result.rootCauseText).toBe('No acceptance criteria to prove');
  });

  it('evaluates ALL criteria — fails if ANY criterion fails', () => {
    // greenLedAssertion fails (pin 13 written, not pin 12)
    // Create a second criterion that would pass on the same trace
    const passingCriterion = {
      name: 'timer_fires',
      register: 'TIM2_SR.UIF',
      expect: '1',
      byTime: 2000,
    };

    const result = analyzeTraceStep(realLog, [passingCriterion, greenLedAssertion]);

    // Even though the first criterion passes, the second fails → overall failed
    expect(result.status).toBe('failed');
  });

  it('pairs rootCause with the criterion that actually failed (not acceptanceCriteria[0])', () => {
    // First criterion passes, second fails. propose-patch must receive the
    // SECOND criterion as the assertion — pairing it with the wrong criterion
    // sends a mismatched (rootCause, assertion) pair to the patch LLM.
    const passingCriterion = {
      name: 'timer_fires',
      register: 'TIM2_SR.UIF',
      expect: '1',
      byTime: 2000,
    };

    const result = analyzeTraceStep(realLog, [passingCriterion, greenLedAssertion]);

    expect(result.status).toBe('failed');
    expect(result.assertion).toEqual(greenLedAssertion);
    expect(result.assertion).not.toEqual(passingCriterion);
  });

  it('returns passed only when ALL criteria pass', () => {
    // Use a criterion that matches the actual trace (pin 13 was written)
    const orangeCriterion = {
      name: 'orange_led_turns_on',
      register: 'GPIOG_ODR[13]',
      expect: '1',
      byTime: 2000,
    };

    const result = analyzeTraceStep(realLog, [orangeCriterion]);

    expect(result.status).toBe('passed');
  });
});
