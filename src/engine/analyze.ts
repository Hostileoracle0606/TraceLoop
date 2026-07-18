import type { TraceEvent, Assertion, RunViewModel, CausalNode } from './types';

/** Strip the bit/pin index: 'GPIOG_ODR[13]' -> 'GPIOG_ODR'. */
function registerBase(register: string): string {
  return register.replace(/\[\d+\]$/, '');
}

/**
 * The divergence: a write to the same register family the assertion cared about,
 * but a different index (pin 13 where pin 12 was expected). This is the fault,
 * distinct from earlier events that were correct behavior.
 */
function findDivergentWrite(trace: TraceEvent[], assertion: Assertion): TraceEvent | undefined {
  const expectedBase = registerBase(assertion.register);
  return trace.find(
    (e) =>
      e.type === 'gpio-write' &&
      registerBase(e.register) === expectedBase &&
      e.register !== assertion.register,
  );
}

export function analyze(trace: TraceEvent[], assertion: Assertion): RunViewModel {
  const satisfied = trace.some(
    (e) =>
      e.register === assertion.register &&
      e.value.endsWith(assertion.expect) &&
      e.time <= assertion.byTime,
  );

  const rootCause = findDivergentWrite(trace, assertion);
  if (!rootCause) {
    // Only the failing-divergence case is driven by a test so far.
    throw new Error('no divergent write found for a failing assertion');
  }

  // Walk events in time order, emitting each observed event and any derived
  // consequence its board wiring implies. Append the violation when the run failed.
  const nodes: Omit<CausalNode, 'id'>[] = [];
  for (const e of [...trace].sort((a, b) => a.time - b.time)) {
    nodes.push({
      label: e.label,
      lane: e.lane,
      taxonomy: 'observed',
      time: e.time,
      register: e.register,
      value: e.value,
      detail: e.detail,
    });
    if (e.effect) {
      nodes.push({
        label: e.effect.label,
        lane: e.effect.lane,
        taxonomy: 'derived',
        time: e.time + 2,
        register: e.effect.register,
        value: e.effect.value,
        detail: `Inferred from ${e.register} (${e.label})`,
      });
    }
  }

  if (!satisfied) {
    nodes.push({
      label: 'Assertion failed',
      lane: 'Test assertion',
      taxonomy: 'violated',
      time: assertion.byTime,
      register: assertion.register,
      value: `expected ${assertion.expect}`,
      detail: `${assertion.name}: expected ${assertion.register} = ${assertion.expect} by ${assertion.byTime} µs`,
    });
  }

  const chain: CausalNode[] = nodes.map((n, i) => ({ id: `e${i + 1}`, ...n }));

  const rootCauseText =
    `${rootCause.source} wrote ${rootCause.register} (${rootCause.value}), ` +
    `diverging from ${assertion.name}, which expected ${assertion.register} = ${assertion.expect} ` +
    `by ${assertion.byTime} µs.`;

  return {
    status: satisfied ? 'passed' : 'failed',
    rootCause,
    chain,
    rootCauseText,
  };
}
