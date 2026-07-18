// The backend seam: a producer-agnostic normalized trace event.
// Producers (a synthetic fixture, or the Renode parser over a real Zephyr build) all emit this shape;
// the analyzer consumes only this, never the producer.

export type TraceEventType = 'timer' | 'interrupt' | 'handler-entry' | 'gpio-write';

/** A downstream consequence of an event, e.g. a GPIO write lighting an LED. */
export interface TraceEventEffect {
  label: string;
  lane: string;
  register: string;
  value: string;
}

export interface TraceEvent {
  /** microseconds of virtual time */
  time: number;
  type: TraceEventType;
  /** where it originated: 'TIM2', 'NVIC', 'timer_isr', 'main.c:37', ... */
  source: string;
  /** what it touched: 'TIM2_SR.UIF', 'NVIC_ISPR0[28]', 'GPIOG_ODR[13]', 'PC' */
  register: string;
  /** human-readable transition, e.g. '0 → 1' */
  value: string;
  /** one-line explanation for the UI */
  detail: string;
  /** short human label, e.g. 'Timer 2 expired' */
  label: string;
  /** which timeline lane it belongs to, e.g. 'Timer 2', 'GPIO pin 13' */
  lane: string;
  /** downstream consequence the board wiring implies (producer-supplied); the analyzer emits it as a derived node */
  effect?: TraceEventEffect;
}

/** What the test expected of final hardware state. */
export interface Assertion {
  name: string;
  /** the register that should have changed, e.g. 'GPIOG_ODR[12]' */
  register: string;
  /** the value it should have reached, e.g. '1' */
  expect: string;
  /** deadline in microseconds */
  byTime: number;
}

export type Taxonomy = 'observed' | 'derived' | 'violated';

/** A node in the causal chain the dashboard renders (ids 'e1', 'e2', ...). */
export interface CausalNode {
  id: string;
  label: string;
  lane: string;
  taxonomy: Taxonomy;
  time: number;
  register: string;
  value: string;
  detail: string;
}

/**
 * The frontend seam: what the dashboard renders. Grown one field at a time as
 * tests demand it.
 */
export interface RunViewModel {
  status: 'passed' | 'failed';
  /** the event the analysis blames — the divergence from the assertion, not merely the earliest event. Absent on a passing run. */
  rootCause?: TraceEvent;
  /** the ordered causal path, ending at the violated node when the run failed */
  chain: CausalNode[];
  /** deterministic plain-language explanation of the root cause (the LLM only narrates this, never derives it) */
  rootCauseText: string;
}
