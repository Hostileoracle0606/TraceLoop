import { describe, it, expect } from 'vitest';
import { matchMcuPart } from './mcu-catalog';

describe('matchMcuPart', () => {
  it('matches an STM32F407 MPN to the stm32f4_disco base target', () => {
    expect(matchMcuPart('STM32F407VGT6')).toBe('stm32f4_disco');
    expect(matchMcuPart('STM32F407VG')).toBe('stm32f4_disco');
  });

  it('matches an nRF52840 MPN to its base target', () => {
    expect(matchMcuPart('nRF52840-QIAA')).toBe('nrf52840dk_nrf52840');
  });

  it('returns null for an unsupported MCU', () => {
    expect(matchMcuPart('ATmega328P-PU')).toBeNull();
  });

  it('is case-insensitive on the family prefix', () => {
    expect(matchMcuPart('stm32f407vg')).toBe('stm32f4_disco');
  });
});
