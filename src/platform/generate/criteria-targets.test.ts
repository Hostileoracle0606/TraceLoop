import { describe, it, expect } from 'vitest';
import { toCriteriaTargets } from './criteria-targets';
import { toBoardCapabilities } from './board-capabilities';
import { validateAssertionForBoard } from '../../engine/board-capabilities';
import type { PlatformModel } from '../types';

const model: PlatformModel = {
  schemaVersion: 1, sourceHash: 'H', sourceFormat: 'kicad',
  mcuPartNumber: 'STM32F407VG', baseTarget: 'stm32f4_disco',
  pinAssignments: [], peripherals: ['GPIO'],
  ledMappings: [{ name: 'LED_GREEN', color: 'green', gpioPort: 'GPIOG', pin: 13 }],
  confidence: [], warnings: [],
};

describe('toCriteriaTargets', () => {
  it('C6: emits a register in the exact engine convention GPIOG_ODR[13]', () => {
    const t = toCriteriaTargets(model)[0]!;
    expect(t.register).toBe('GPIOG_ODR[13]');
    expect(t.suggestedExpect).toBe('1');
  });

  it('F10: every emitted target passes validateAssertionForBoard on the derived board', () => {
    const caps = toBoardCapabilities(model);
    for (const t of toCriteriaTargets(model)) {
      const reg = t.register.replace(/\[\d+\]$/, '');
      const pin = Number(t.register.match(/\[(\d+)\]$/)?.[1]);
      expect(validateAssertionForBoard({ register: reg, pin }, caps).valid).toBe(true);
    }
  });

  it('drops a target whose pin is out of range (never emits an invalid target)', () => {
    const bad = { ...model, ledMappings: [{ name: 'X', color: 'red', gpioPort: 'GPIOG', pin: 99 }] };
    expect(toCriteriaTargets(bad)).toHaveLength(0);
  });
});
