import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compilePlatformModel } from './compile';
import { parseKicadNetlist } from './parse/kicad';
import { resolveMcu } from './resolve-mcu';

const raw = parseKicadNetlist(readFileSync(new URL('./__fixtures__/blinky.kicad.net', import.meta.url), 'utf8'));
const mcu = resolveMcu(raw);
if (mcu.kind !== 'resolved') throw new Error('fixture must resolve');

describe('compilePlatformModel', () => {
  it('builds a model with the base target and a stable sourceHash', () => {
    const m = compilePlatformModel(raw, mcu, 'HASH123');
    expect(m.baseTarget).toBe('stm32f4_disco');
    expect(m.sourceHash).toBe('HASH123');
    expect(m.schemaVersion).toBe(1);
  });

  it('derives an LED mapping from the LED net + PG13', () => {
    const m = compilePlatformModel(raw, mcu, 'H');
    expect(m.ledMappings).toContainEqual(expect.objectContaining({ color: 'green', gpioPort: 'GPIOG', pin: 13 }));
  });

  it('C4: every LED mapping and MCU-identity has a confidence entry', () => {
    const m = compilePlatformModel(raw, mcu, 'H');
    expect(m.confidence.find((c) => c.fact === 'mcu-identity')).toBeDefined();
    expect(m.confidence.every((c) => c.score >= 0 && c.score <= 1)).toBe(true);
  });

  it('C5: records non-MCU/non-LED parts as dropped-part warnings, never silently', () => {
    // Add a resistor to the raw schematic to test dropped-part warning
    const rawWithR = { ...raw, parts: [...raw.parts, { refdes: 'R1', value: '330' }] };
    const m = compilePlatformModel(rawWithR, mcu, 'H');
    const dropped = m.warnings.filter((w) => w.code === 'dropped-part');
    expect(dropped.some((w) => w.refs.includes('R1'))).toBe(true);
  });

  it('F8: flags two mappings on the same port+pin as a conflict', () => {
    const dupRaw = {
      parts: [{ refdes: 'U1', value: 'STM32F407VGT6' }, { refdes: 'D1', value: 'LED_Green' }, { refdes: 'D2', value: 'LED_Red' }],
      nets: [
        { name: '/A', nodes: [{ refdes: 'U1', pin: '1', pinfunction: 'PG13' }, { refdes: 'D1', pin: '2' }] },
        { name: '/B', nodes: [{ refdes: 'U1', pin: '2', pinfunction: 'PG13' }, { refdes: 'D2', pin: '2' }] },
      ],
    };
    const dupMcu = resolveMcu(dupRaw);
    if (dupMcu.kind !== 'resolved') throw new Error('dup MCU must resolve');
    const m = compilePlatformModel(dupRaw, dupMcu, 'H');
    expect(m.warnings.some((w) => w.code === 'conflicting-mapping')).toBe(true);
  });
});
