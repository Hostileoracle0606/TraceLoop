import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { inferPinFunctions } from './infer-pins';
import { parseKicadNetlist } from './parse/kicad';
import { resolveMcu } from './resolve-mcu';

const load = (f: string) => parseKicadNetlist(readFileSync(new URL(`./__fixtures__/${f}`, import.meta.url), 'utf8'));
function pins(f: string) {
  const raw = load(f);
  const mcu = resolveMcu(raw);
  if (mcu.kind !== 'resolved') throw new Error('fixture MCU should resolve');
  return inferPinFunctions(raw, mcu);
}

describe('inferPinFunctions', () => {
  it('maps PG13 → GPIOG pin 13 with high confidence from pinfunction', () => {
    const a = pins('blinky.kicad.net').find((p) => p.pinfunction === 'PG13')!;
    expect(a.gpioPort).toBe('GPIOG');
    expect(a.pinNumber).toBe(13);
    expect(a.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('infers gpio-out when the pin drives an LED (via a series resistor net)', () => {
    const a = pins('blinky.kicad.net').find((p) => p.pinfunction === 'PG13')!;
    expect(a.func).toBe('gpio-out');
  });

  it('C4: every assignment carries a confidence score', () => {
    for (const a of pins('blinky.kicad.net')) {
      expect(a.confidence).toBeGreaterThan(0);
      expect(a.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('F4: a pin with no pinfunction yields unknown port/func at low confidence — no wrong guess', () => {
    const a = pins('ambiguous.kicad.net')[0]!;
    expect(a.gpioPort).toBeNull();
    expect(a.func).toBe('unknown');
    expect(a.confidence).toBeLessThan(0.5);
  });
});
