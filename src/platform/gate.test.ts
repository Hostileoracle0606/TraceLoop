import { describe, it, expect } from 'vitest';
import { classifyConfidence, CRITICAL_THRESHOLD } from './gate';
import type { PlatformModel } from './types';

function model(conf: PlatformModel['confidence']): PlatformModel {
  return {
    schemaVersion: 1, sourceHash: 'H', sourceFormat: 'kicad',
    mcuPartNumber: 'STM32F407VG', baseTarget: 'stm32f4_disco',
    pinAssignments: [], peripherals: [], ledMappings: [], confidence: conf, warnings: [],
  };
}

describe('classifyConfidence', () => {
  it('auto-proceeds when all critical facts clear the threshold', () => {
    const g = classifyConfidence(model([
      { fact: 'mcu-identity', score: 0.95, criticality: 'critical', provenance: 'x' },
      { fact: 'pin:PG13:direction', score: 0.9, criticality: 'critical', provenance: 'x' },
      { fact: 'led:GPIOG:13', score: 0.4, criticality: 'cosmetic', provenance: 'x' },
    ]));
    expect(g.autoProceed).toBe(true);
    expect(g.blocking).toHaveLength(0);
  });

  it('F12: blocks when a critical fact is below threshold; a low cosmetic fact never blocks', () => {
    const g = classifyConfidence(model([
      { fact: 'pin:PG13:direction', score: 0.3, criticality: 'critical', provenance: 'no pinfunction' },
      { fact: 'led-color', score: 0.1, criticality: 'cosmetic', provenance: 'x' },
    ]));
    expect(g.autoProceed).toBe(false);
    expect(g.blocking.map((b) => b.field)).toEqual(['pin:PG13:direction']);
  });

  it('the threshold is a single documented constant', () => {
    expect(CRITICAL_THRESHOLD).toBeGreaterThan(0);
    expect(CRITICAL_THRESHOLD).toBeLessThan(1);
  });
});
