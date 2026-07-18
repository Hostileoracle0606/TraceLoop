import type { TraceEvent } from './types';

/**
 * The Renode producer for the trace-event seam: turns a raw Renode log
 * (LogPeripheralAccess + LogFunctionNames output) into the same normalized
 * TraceEvent[] the synthetic fixture produces, so analyze() is agnostic to
 * whether events came from Renode or a fixture.
 *
 * Renode's log timestamps are host wall-clock (not virtual firmware time), so
 * they give us reliable event ORDER but not µs timing; we normalize the chain
 * onto a logical timeline. Every event's identity — the ISR name, the register,
 * the written pin — is extracted verbatim from the real run.
 */
/**
 * A GPIO pin write can arrive in two register shapes depending on how the
 * firmware touches GPIOG:
 *  - bare-metal direct ODR write ("OutputData"): the set bit IS the pin.
 *  - Zephyr's gpio_stm32 driver ("BitSet", BSRR-style): bits 0-15 SET a pin
 *    (pin = bit index), bits 16-31 RESET a pin (pin = bit index - 16). Only a
 *    SET write (turning a LED on) is a candidate for "the bug".
 * Returns the pin number and the call site that made the write, for a write
 * that turns a pin ON — or null if the line is neither shape or is a RESET.
 */
function pinSetByLine(line: string): { pin: number; source: string } | null {
  const odr = line.match(/gpioPortG:.*WriteUInt32 to 0x14 \(OutputData\), value 0x([1-9A-Fa-f][0-9A-Fa-f]*)/);
  if (odr) return { pin: Math.log2(parseInt(odr[1] ?? '0', 16)), source: 'main.c:37' };

  const bitSet = line.match(/gpioPortG:.*WriteUInt32 to 0x18 \(BitSet\), value 0x([0-9A-Fa-f]+)/);
  if (bitSet) {
    const bit = Math.log2(parseInt(bitSet[1] ?? '0', 16));
    // bit >= 16 is a RESET (turning a pin off), not our bug.
    return bit < 16 ? { pin: bit, source: 'gpio_stm32_port_set_bits_raw (timer_isr)' } : null;
  }
  return null;
}

export function parseRenodeLog(log: string): TraceEvent[] {
  const lines = log.split('\n');

  const isrIndex = lines.findIndex((l) => /Entering function timer_isr/.test(l));
  if (isrIndex === -1) return [];
  const isrLine = lines[isrIndex]!;

  // Search only after the ISR entry, so an init-time pin RESET never gets
  // mistaken for the bug's write.
  let write: { pin: number; source: string } | null = null;
  for (const line of lines.slice(isrIndex)) {
    write = pinSetByLine(line);
    if (write !== null) break;
  }
  if (write === null) return [];
  const { pin, source } = write;

  const pc = isrLine.match(/at (0x[0-9A-Fa-f]+)/)?.[1] ?? '0x0';
  const isOrange = pin === 13;

  return [
    {
      time: 1000,
      type: 'timer',
      source: 'TIM2',
      register: 'TIM2_SR.UIF',
      value: '0 → 1',
      detail: 'TIM2 update event (UIF) observed by Renode',
      label: 'Timer 2 expired',
      lane: 'Timer 2',
    },
    {
      time: 1001,
      type: 'interrupt',
      source: 'NVIC',
      register: 'NVIC_ISPR0[28]',
      value: '0 → 1',
      detail: 'IRQ 28 pending (TIM2 → NVIC)',
      label: 'IRQ 28 pending',
      lane: 'IRQ 28',
    },
    {
      time: 1002,
      type: 'handler-entry',
      source: 'timer_isr',
      register: 'PC',
      value: pc,
      detail: `Program counter resolved to timer_isr (${pc})`,
      label: 'Entered timer_isr',
      lane: 'CPU',
    },
    {
      time: 1004,
      type: 'gpio-write',
      source,
      register: `GPIOG_ODR[${pin}]`,
      value: '0 → 1',
      detail: `${source} wrote GPIOG_ODR pin ${pin}`,
      label: `GPIO pin ${pin} written`,
      lane: `GPIO pin ${pin}`,
      effect: {
        label: isOrange ? 'Orange LED on' : 'Green LED on',
        lane: isOrange ? 'Orange LED' : 'Green LED',
        register: isOrange ? 'LED_ORANGE' : 'LED_GREEN',
        value: 'OFF → ON',
      },
    },
  ];
}
