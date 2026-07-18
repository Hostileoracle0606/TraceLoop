import { describe, it, expect } from 'vitest';
import { analyze } from './analyze';
import { timer2WrongPinTrace, greenLedAssertion } from '../fixtures/timer2-wrong-pin';

describe('analyze', () => {
  it('blames the GPIO write that targets the wrong pin, not the earliest event', () => {
    const vm = analyze(timer2WrongPinTrace, greenLedAssertion);

    // The assertion was for pin 12; nothing ever set it, so the run failed.
    expect(vm.status).toBe('failed');

    // Root cause is the divergence — the write to pin 13 — NOT e1 (Timer2 expired),
    // which is the earliest event but entirely correct behavior.
    expect(vm.rootCause.register).toBe('GPIOG_ODR[13]');
    expect(vm.rootCause.detail).toContain('main.c:37');
  });

  it('builds the causal chain: timer → wrong write → derived LED consequence → violated assertion', () => {
    const vm = analyze(timer2WrongPinTrace, greenLedAssertion);

    expect(vm.chain.map((n) => n.label)).toEqual([
      'Timer 2 expired',
      'IRQ 28 pending',
      'Entered timer_isr',
      'GPIO pin 13 written',
      'Orange LED on',
      'Assertion failed',
    ]);

    // Observed hardware events keep their order and ids; the analyzer derives the
    // LED consequence from the write and appends the violation.
    expect(vm.chain.slice(0, 4).map((n) => n.id)).toEqual(['e1', 'e2', 'e3', 'e4']);
    expect(vm.chain.slice(0, 4).every((n) => n.taxonomy === 'observed')).toBe(true);
    expect(vm.chain.find((n) => n.label === 'Orange LED on')?.taxonomy).toBe('derived');
    expect(vm.chain.at(-1)?.taxonomy).toBe('violated');
  });

  it('produces a plain-language root-cause explanation naming the wrong target and the expectation', () => {
    const vm = analyze(timer2WrongPinTrace, greenLedAssertion);

    expect(vm.rootCauseText).toContain('main.c:37');
    expect(vm.rootCauseText).toContain('GPIOG_ODR[13]'); // what was wrongly written
    expect(vm.rootCauseText).toContain('GPIOG_ODR[12]'); // what the assertion expected
  });
});
