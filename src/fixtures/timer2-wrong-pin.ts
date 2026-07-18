import type { TraceEvent, Assertion } from '../engine/types';

// The canonical demo scenario, as a synthetic trace with a KNOWN answer.
// Mirrors the mockup's RUN-1042: TIM2 fires, IRQ28 pends, timer_isr runs, and
// main.c:37 wrongly writes GPIO pin 13 (orange LED) instead of pin 12 (green LED).
// These are the OBSERVED hardware events; the analyzer must derive the
// "orange LED on" consequence and the "assertion violated" conclusion itself.

export const timer2WrongPinTrace: TraceEvent[] = [
  {
    time: 1000,
    type: 'timer',
    source: 'TIM2',
    register: 'TIM2_SR.UIF',
    value: '0 → 1',
    detail: 'TIM2 update event observed by Renode',
    label: 'Timer 2 expired',
    lane: 'Timer 2',
  },
  {
    time: 1001,
    type: 'interrupt',
    source: 'NVIC',
    register: 'NVIC_ISPR0[28]',
    value: '0 → 1',
    detail: 'NVIC pending bit asserted',
    label: 'IRQ 28 pending',
    lane: 'IRQ 28',
  },
  {
    time: 1002,
    type: 'handler-entry',
    source: 'timer_isr',
    register: 'PC',
    value: '0x080004F8',
    detail: 'Program counter resolved to timer_isr',
    label: 'Entered timer_isr',
    lane: 'CPU',
  },
  {
    time: 1004,
    type: 'gpio-write',
    source: 'main.c:37',
    register: 'GPIOG_ODR[13]',
    value: '0 → 1',
    detail: 'main.c:37 wrote the orange LED output',
    label: 'GPIO pin 13 written',
    lane: 'GPIO pin 13',
    effect: { label: 'Orange LED on', lane: 'Orange LED', register: 'LED_ORANGE', value: 'OFF → ON' },
  },
];

// The test asserts the GREEN LED (pin 12) should be on by 2000µs. It never is.
export const greenLedAssertion: Assertion = {
  name: 'green_led_should_turn_on',
  register: 'GPIOG_ODR[12]',
  expect: '1',
  byTime: 2000,
};
