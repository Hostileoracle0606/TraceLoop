import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { derivePlatform, schematicHash } from './derive';
import { SchematicParseError } from './types';

const blinky = readFileSync(new URL('./__fixtures__/blinky.kicad.net', import.meta.url), 'utf8');
const unknown = readFileSync(new URL('./__fixtures__/unknown-mcu.kicad.net', import.meta.url), 'utf8');

describe('derivePlatform', () => {
  it('returns all artifacts for a supported schematic', () => {
    const d = derivePlatform(blinky, 'kicad');
    if (d.kind !== 'ok') throw new Error('expected ok');
    expect(d.derived.boardCapabilities.status).toBe('derived');
    expect(d.derived.renodeRepl).toMatch(/using /);
    expect(Object.keys(d.derived.zephyrFiles)).toContain('app.overlay');
    expect(d.derived.criteriaTargets[0]!.register).toBe('GPIOG_ODR[13]');
    expect(d.derived.gate.autoProceed).toBe(true);
  });

  it('C3: returns an unsupported result for an unknown MCU', () => {
    const d = derivePlatform(unknown, 'kicad');
    expect(d.kind).toBe('unsupported');
  });

  it('surfaces a parse failure as a typed error result, not a throw', () => {
    const d = derivePlatform('garbage', 'kicad');
    expect(d.kind).toBe('parse-error');
    if (d.kind === 'parse-error') expect(d.error).toBeInstanceOf(SchematicParseError);
  });

  it('F9/C7: hash is identical across reordered nets and whitespace', () => {
    const reordered = blinky.replace(/\s+/g, ' ').trim();
    expect(schematicHash(blinky)).toBe(schematicHash(reordered));
  });

  it('C1: deriving twice yields deep-equal models (deterministic, no clocks/random)', () => {
    const a = derivePlatform(blinky, 'kicad');
    const b = derivePlatform(blinky, 'kicad');
    expect(a).toEqual(b);
  });
});
