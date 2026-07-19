import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveMcu } from './resolve-mcu';
import { parseKicadNetlist } from './parse/kicad';

const load = (f: string) => parseKicadNetlist(readFileSync(new URL(`./__fixtures__/${f}`, import.meta.url), 'utf8'));

describe('resolveMcu', () => {
  it('resolves the supported MCU with its base template', () => {
    const r = resolveMcu(load('blinky.kicad.net'));
    expect(r.kind).toBe('resolved');
    if (r.kind === 'resolved') {
      expect(r.baseTarget).toBe('stm32f4_disco');
      expect(r.template.mcu).toBe('STM32F407VG');
    }
  });

  it('C3/F3: returns unsupported for an unknown MCU — never a silent default', () => {
    const r = resolveMcu(load('unknown-mcu.kicad.net'));
    expect(r.kind).toBe('unsupported');
    if (r.kind === 'unsupported') expect(r.reason).toMatch(/ATmega328P/);
  });

  it('F5: returns unsupported when no MCU-like part is present', () => {
    const raw = { parts: [{ refdes: 'R1', value: '330' }], nets: [] };
    expect(resolveMcu(raw).kind).toBe('unsupported');
  });

  it('F5: returns unsupported when two different supported MCUs are present', () => {
    const raw = {
      parts: [{ refdes: 'U1', value: 'STM32F407VG' }, { refdes: 'U2', value: 'nRF52840' }],
      nets: [],
    };
    const r = resolveMcu(raw);
    expect(r.kind).toBe('unsupported');
    if (r.kind === 'unsupported') expect(r.reason).toMatch(/multiple/i);
  });
});
