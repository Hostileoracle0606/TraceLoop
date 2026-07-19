import { describe, it, expect } from 'vitest';
import { toZephyrBoardFiles, validateOverlaySyntax } from './zephyr-board';
import type { PlatformModel } from '../types';

const model: PlatformModel = {
  schemaVersion: 1, sourceHash: 'H', sourceFormat: 'kicad',
  mcuPartNumber: 'STM32F407VG', baseTarget: 'stm32f4_disco',
  pinAssignments: [], peripherals: ['GPIO'],
  ledMappings: [{ name: 'LED_GREEN', color: 'green', gpioPort: 'GPIOG', pin: 13 }],
  confidence: [], warnings: [],
};

describe('toZephyrBoardFiles', () => {
  it('emits an app.overlay with a leds node and a balanced brace count', () => {
    const files = toZephyrBoardFiles(model);
    expect(files['app.overlay']).toMatch(/leds\s*{/);
    expect(files['app.overlay']).toMatch(/gpiog 13/);
    expect(validateOverlaySyntax(files['app.overlay']!).valid).toBe(true);
  });

  it('emits prj.conf enabling GPIO', () => {
    const files = toZephyrBoardFiles(model);
    expect(files['prj.conf']).toMatch(/CONFIG_GPIO=y/);
  });

  it('C8: validateOverlaySyntax rejects unbalanced braces', () => {
    expect(validateOverlaySyntax('/ { leds { ').valid).toBe(false);
    expect(validateOverlaySyntax('/ { };').valid).toBe(true);
  });
});
