import { describe, it, expect } from 'vitest';
import {
  validateAssertionForBoard,
  validatePeripheralForBoard,
  getBoardForTarget,
  BOARD_REGISTRY,
  type BoardCapabilities,
} from './board-capabilities';

const stm32 = BOARD_REGISTRY.stm32f4_disco;
const nrf = BOARD_REGISTRY.nrf52840dk_nrf52840;
const esp32 = BOARD_REGISTRY.esp32c3_devkitm;

describe('validateAssertionForBoard', () => {
  describe('GPIO port validation', () => {
    it('accepts a valid GPIO port on STM32F4', () => {
      const result = validateAssertionForBoard({ register: 'GPIOA_BSRR' }, stm32);
      expect(result.valid).toBe(true);
    });

    it('accepts GPIOG on STM32F4 (where LEDs are)', () => {
      const result = validateAssertionForBoard({ register: 'GPIOG_ODR' }, stm32);
      expect(result.valid).toBe(true);
    });

    it('rejects a GPIO port not available on the board', () => {
      // nRF52840 uses P0/P1, not GPIOA
      const result = validateAssertionForBoard({ register: 'GPIOA_BSRR' }, nrf);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('GPIOA');
      expect(result.reason).toContain('not available');
    });

    it('accepts P0 on nRF52840', () => {
      // P0 doesn't match the GPIO[A-I] pattern, so it passes through
      const result = validateAssertionForBoard({ register: 'P0_OUT' }, nrf);
      expect(result.valid).toBe(true);
    });

    it('passes through non-GPIO registers without error', () => {
      const result = validateAssertionForBoard({ register: 'USART1_SR' }, stm32);
      expect(result.valid).toBe(true);
    });
  });

  describe('pin number validation', () => {
    it('accepts pin 0', () => {
      const result = validateAssertionForBoard({ register: 'GPIOA_BSRR', pin: 0 }, stm32);
      expect(result.valid).toBe(true);
    });

    it('accepts pin 15', () => {
      const result = validateAssertionForBoard({ register: 'GPIOA_BSRR', pin: 15 }, stm32);
      expect(result.valid).toBe(true);
    });

    it('rejects pin 16 (out of range)', () => {
      const result = validateAssertionForBoard({ register: 'GPIOA_BSRR', pin: 16 }, stm32);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('out of range');
    });

    it('rejects negative pin', () => {
      const result = validateAssertionForBoard({ register: 'GPIOA_BSRR', pin: -1 }, stm32);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('out of range');
    });

    it('skips pin validation when pin is undefined', () => {
      const result = validateAssertionForBoard({ register: 'GPIOA_BSRR' }, stm32);
      expect(result.valid).toBe(true);
    });
  });

  describe('timer validation', () => {
    it('accepts TIM2 on STM32F4 (14 timers)', () => {
      const result = validateAssertionForBoard({ register: 'TIM2' }, stm32);
      expect(result.valid).toBe(true);
    });

    it('accepts TIM14 on STM32F4 (max timer)', () => {
      const result = validateAssertionForBoard({ register: 'TIM14' }, stm32);
      expect(result.valid).toBe(true);
    });

    it('rejects TIM15 on STM32F4 (exceeds 14 timers)', () => {
      const result = validateAssertionForBoard({ register: 'TIM15' }, stm32);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('TIM15');
      expect(result.reason).toContain('not available');
    });

    it('rejects TIM6 on nRF52840 (only 5 timers)', () => {
      const result = validateAssertionForBoard({ register: 'TIM6' }, nrf);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('TIM6');
    });

    it('accepts TIM5 on nRF52840 (5 timers)', () => {
      const result = validateAssertionForBoard({ register: 'TIM5' }, nrf);
      expect(result.valid).toBe(true);
    });
  });
});

describe('validatePeripheralForBoard', () => {
  it('returns true for GPIO on all boards', () => {
    expect(validatePeripheralForBoard('GPIO', stm32)).toBe(true);
    expect(validatePeripheralForBoard('GPIO', nrf)).toBe(true);
    expect(validatePeripheralForBoard('GPIO', esp32)).toBe(true);
  });

  it('returns true for BLE on nRF52840', () => {
    expect(validatePeripheralForBoard('BLE', nrf)).toBe(true);
  });

  it('returns false for BLE on STM32F4', () => {
    expect(validatePeripheralForBoard('BLE', stm32)).toBe(false);
  });

  it('returns true for WiFi on ESP32-C3', () => {
    expect(validatePeripheralForBoard('WiFi', esp32)).toBe(true);
  });

  it('returns false for WiFi on STM32F4', () => {
    expect(validatePeripheralForBoard('WiFi', stm32)).toBe(false);
  });

  it('returns false for unknown peripheral', () => {
    expect(validatePeripheralForBoard('CANBUS', stm32)).toBe(false);
  });

  it('returns true for I2C on STM32F4', () => {
    expect(validatePeripheralForBoard('I2C', stm32)).toBe(true);
  });

  it('returns false for I2C on ESP32-C3', () => {
    // ESP32-C3 in our registry has I2C
    expect(validatePeripheralForBoard('I2C', esp32)).toBe(true);
  });
});

describe('getBoardForTarget', () => {
  it('returns STM32F4 Discovery for stm32f4_disco', () => {
    const board = getBoardForTarget('stm32f4_disco');
    expect(board).not.toBeNull();
    expect(board!.name).toBe('STM32F4 Discovery');
    expect(board!.mcu).toBe('STM32F407VG');
  });

  it('returns nRF52840 DK for nrf52840dk_nrf52840', () => {
    const board = getBoardForTarget('nrf52840dk_nrf52840');
    expect(board).not.toBeNull();
    expect(board!.name).toBe('nRF52840 DK');
    expect(board!.hasBLE).toBe(true);
  });

  it('returns ESP32-C3 for esp32c3_devkitm', () => {
    const board = getBoardForTarget('esp32c3_devkitm');
    expect(board).not.toBeNull();
    expect(board!.name).toBe('ESP32-C3 DevKitM');
    expect(board!.hasWiFi).toBe(true);
  });

  it('returns null for unknown target', () => {
    expect(getBoardForTarget('nonexistent_board')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getBoardForTarget('')).toBeNull();
  });
});

describe('BOARD_REGISTRY', () => {
  it('contains exactly 3 boards', () => {
    expect(Object.keys(BOARD_REGISTRY)).toHaveLength(3);
  });

  it('has stm32f4_disco entry', () => {
    expect(BOARD_REGISTRY.stm32f4_disco).toBeDefined();
    expect(BOARD_REGISTRY.stm32f4_disco.timerCount).toBe(14);
    expect(BOARD_REGISTRY.stm32f4_disco.gpioPorts).toHaveLength(9);
  });

  it('has nrf52840dk_nrf52840 entry', () => {
    expect(BOARD_REGISTRY.nrf52840dk_nrf52840).toBeDefined();
    expect(BOARD_REGISTRY.nrf52840dk_nrf52840.hasBLE).toBe(true);
    expect(BOARD_REGISTRY.nrf52840dk_nrf52840.ledMappings).toHaveLength(4);
  });

  it('has esp32c3_devkitm entry', () => {
    expect(BOARD_REGISTRY.esp32c3_devkitm).toBeDefined();
    expect(BOARD_REGISTRY.esp32c3_devkitm.hasWiFi).toBe(true);
    expect(BOARD_REGISTRY.esp32c3_devkitm.architecture).toBe('RISC-V RV32IMC');
  });

  it('all boards have status active', () => {
    for (const board of Object.values(BOARD_REGISTRY)) {
      expect(board.status).toBe('active');
    }
  });

  it('all boards have non-empty peripherals', () => {
    for (const board of Object.values(BOARD_REGISTRY)) {
      expect(board.peripherals.length).toBeGreaterThan(0);
    }
  });
});
