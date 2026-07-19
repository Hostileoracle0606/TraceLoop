import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseKicadNetlist } from './kicad';
import { SchematicParseError } from '../types';

const blinky = readFileSync(new URL('../__fixtures__/blinky.kicad.net', import.meta.url), 'utf8');

describe('parseKicadNetlist', () => {
  it('extracts parts with value and footprint', () => {
    const raw = parseKicadNetlist(blinky);
    const u1 = raw.parts.find((p) => p.refdes === 'U1');
    expect(u1).toMatchObject({ refdes: 'U1', value: 'STM32F407VGT6' });
    expect(raw.parts.map((p) => p.refdes).sort()).toEqual(['D1', 'U1']);
  });

  it('extracts nets with nodes and pinfunction', () => {
    const raw = parseKicadNetlist(blinky);
    const led = raw.nets.find((n) => n.name === '/LED_GREEN')!;
    const u1node = led.nodes.find((n) => n.refdes === 'U1')!;
    expect(u1node.pinfunction).toBe('PG13');
  });

  it('F2: throws SchematicParseError on empty input', () => {
    expect(() => parseKicadNetlist('')).toThrow(SchematicParseError);
  });

  it('F2: throws SchematicParseError on a non-export S-expr', () => {
    expect(() => parseKicadNetlist('(design (foo))')).toThrow(SchematicParseError);
  });

  it('F11: throws naming a node that references an undeclared component', () => {
    const bad = `(export (version "E")
      (components (comp (ref "U1") (value "STM32F407VGT6")))
      (nets (net (code "1") (name "N") (node (ref "X9") (pin "1")))))`;
    expect(() => parseKicadNetlist(bad)).toThrow(/X9/);
  });
});
