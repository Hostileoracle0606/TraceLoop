import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { toBoardCapabilities } from './board-capabilities';
import { compilePlatformModel } from '../compile';
import { parseKicadNetlist } from '../parse/kicad';
import { resolveMcu } from '../resolve-mcu';
import { validateAssertionForBoard } from '../../engine/board-capabilities';

function model(f: string) {
  const raw = parseKicadNetlist(readFileSync(new URL(`../__fixtures__/${f}`, import.meta.url), 'utf8'));
  const mcu = resolveMcu(raw);
  if (mcu.kind !== 'resolved') throw new Error('resolve');
  return compilePlatformModel(raw, mcu, 'H');
}

describe('toBoardCapabilities', () => {
  it('produces a derived board whose LED mappings come from the schematic, not the base', () => {
    const caps = toBoardCapabilities(model('blinky.kicad.net'));
    expect(caps.status).toBe('derived');
    expect(caps.ledMappings).toContainEqual(expect.objectContaining({ gpioPort: 'GPIOG', pin: 13, color: 'green' }));
  });

  it('C2: the engine accepts an assertion on a derived LED register', () => {
    const caps = toBoardCapabilities(model('blinky.kicad.net'));
    const led = caps.ledMappings[0]!;
    const res = validateAssertionForBoard({ register: `${led.gpioPort}_ODR`, pin: led.pin }, caps);
    expect(res.valid).toBe(true);
  });

  it('F6: the engine rejects a pin outside 0–15 even on a derived board', () => {
    const caps = toBoardCapabilities(model('blinky.kicad.net'));
    const res = validateAssertionForBoard({ register: 'GPIOG_ODR', pin: 20 }, caps);
    expect(res.valid).toBe(false);
  });

  it('keeps the base silicon fields (mcu, gpioPorts, timerCount)', () => {
    const caps = toBoardCapabilities(model('blinky.kicad.net'));
    expect(caps.mcu).toBe('STM32F407VG');
    expect(caps.gpioPorts).toContain('GPIOG');
    expect(caps.timerCount).toBe(14);
  });
});
