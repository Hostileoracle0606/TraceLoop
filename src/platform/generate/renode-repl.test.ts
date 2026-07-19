import { describe, it, expect } from 'vitest';
import { toRenodeRepl, validateReplSyntax } from './renode-repl';
import { BOARD_REGISTRY } from '../../engine/board-capabilities';
import type { PlatformModel } from '../types';

const model: PlatformModel = {
  schemaVersion: 1, sourceHash: 'H', sourceFormat: 'kicad',
  mcuPartNumber: 'STM32F407VG', baseTarget: 'stm32f4_disco',
  pinAssignments: [], peripherals: BOARD_REGISTRY.stm32f4_disco!.peripherals,
  ledMappings: [{ name: 'LED_GREEN', color: 'green', gpioPort: 'GPIOG', pin: 13 }],
  confidence: [], warnings: [],
};

describe('toRenodeRepl', () => {
  it('references the base platform and adds a led node bound to the GPIO port', () => {
    const repl = toRenodeRepl(model);
    expect(repl).toMatch(/using "platforms\/cpus\/stm32f4\.repl"/);
    expect(repl).toMatch(/led_green:/);
    expect(repl).toMatch(/GPIOG/);
    expect(validateReplSyntax(repl).valid).toBe(true);
  });

  it('C8: validateReplSyntax rejects unbalanced/emptily-typed nodes', () => {
    expect(validateReplSyntax('led: \n').valid).toBe(false);
    expect(validateReplSyntax('using "x.repl"\nled: LED @ gpioPort 13').valid).toBe(true);
  });

  it('F7: peripherals with no template mapping are skipped, not emitted malformed', () => {
    const exotic = { ...model, peripherals: [...model.peripherals, 'CAN-FD-EXOTIC'] };
    const repl = toRenodeRepl(exotic);
    expect(repl).not.toMatch(/CAN-FD-EXOTIC/);
    expect(validateReplSyntax(repl).valid).toBe(true);
  });
});
