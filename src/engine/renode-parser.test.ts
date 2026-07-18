import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseRenodeLog } from './renode-parser';
import { analyze } from './analyze';
import { greenLedAssertion } from '../fixtures/timer2-wrong-pin';

const realLog = readFileSync(new URL('./__fixtures__/renode-sample.log', import.meta.url), 'utf8');
const zephyrLog = readFileSync(new URL('./__fixtures__/renode-zephyr-sample.log', import.meta.url), 'utf8');

describe('parseRenodeLog', () => {
  it('extracts the causal chain from a real Renode trace log', () => {
    const trace = parseRenodeLog(realLog);

    expect(trace.map((e) => e.type)).toEqual(['timer', 'interrupt', 'handler-entry', 'gpio-write']);

    const handler = trace.find((e) => e.type === 'handler-entry');
    expect(handler?.source).toBe('timer_isr');

    // The bug: 0x2000 written to OutputData decodes to pin 13 (orange), not pin 12.
    const write = trace.find((e) => e.type === 'gpio-write');
    expect(write?.register).toBe('GPIOG_ODR[13]');
    expect(write?.effect?.label).toContain('Orange');
  });

  it('the engine blames the pin-13 write when fed the REAL Renode trace', () => {
    const trace = parseRenodeLog(realLog);
    const vm = analyze(trace, greenLedAssertion);

    expect(vm.status).toBe('failed');
    expect(vm.rootCause?.register).toBe('GPIOG_ODR[13]');
    expect(vm.chain.map((n) => n.label)).toContain('Orange LED on');
  });

  it('decodes a Zephyr GPIO driver BitSet write (BSRR-style) as the same pin-13 gpio-write', () => {
    // Zephyr's gpio_stm32 driver writes the BitSet/BitReset register, not OutputData
    // directly (bare-metal did that). Bit 13 set (0x2000) is still "wrote pin 13".
    const trace = parseRenodeLog(zephyrLog);

    expect(trace.map((e) => e.type)).toEqual(['timer', 'interrupt', 'handler-entry', 'gpio-write']);

    const write = trace.find((e) => e.type === 'gpio-write');
    expect(write?.register).toBe('GPIOG_ODR[13]');
    expect(write?.effect?.label).toContain('Orange');
  });

  it('the engine blames the pin-13 write when fed a REAL Zephyr Renode trace', () => {
    const trace = parseRenodeLog(zephyrLog);
    const vm = analyze(trace, greenLedAssertion);

    expect(vm.status).toBe('failed');
    expect(vm.rootCause?.register).toBe('GPIOG_ODR[13]');
  });
});
