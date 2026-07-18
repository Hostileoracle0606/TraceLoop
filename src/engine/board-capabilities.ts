/**
 * Board capability validation — verifies that assertions and peripherals
 * are compatible with a given board's hardware capabilities.
 */

export interface LedMapping {
  name: string;
  color: string;
  gpioPort: string;
  pin: number;
}

export interface BoardCapabilities {
  name: string;
  mcu: string;
  architecture: string;
  memoryFlash: number;
  memoryRam: number;
  buildTarget: string;
  peripherals: string[];
  gpioPorts: string[];
  timerCount: number;
  hasBLE: boolean;
  hasWiFi: boolean;
  ledMappings: LedMapping[];
  devicetreePath?: string;
  renodePlatformDescription?: string;
  status: string;
}

export interface AssertionRef {
  register: string;
  pin?: number;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validate that an assertion's register/pin is compatible with the board.
 *
 * Checks:
 * - GPIO port extracted from the register exists in board.gpioPorts
 * - Pin number (if present) is in the valid range (0–15 for STM32-style MCUs)
 * - If the register references a timer, the board has enough timers
 */
export function validateAssertionForBoard(
  assertion: AssertionRef,
  board: BoardCapabilities,
): ValidationResult {
  const { register, pin } = assertion;

  // Extract GPIO port from register (e.g. "GPIOA" from "GPIOA_BSRR")
  const gpioMatch = register.match(/^(GPIO[A-I])/);
  if (gpioMatch && gpioMatch[1]) {
    const port = gpioMatch[1];
    if (!board.gpioPorts.includes(port)) {
      return {
        valid: false,
        reason: `GPIO port ${port} not available on ${board.name} (has: ${board.gpioPorts.join(', ')})`,
      };
    }
  }

  // Validate pin number range (STM32-style: 0–15)
  if (pin !== undefined) {
    if (pin < 0 || pin > 15) {
      return {
        valid: false,
        reason: `Pin ${pin} out of range (valid: 0–15 for ${board.architecture})`,
      };
    }
  }

  // Check timer references (e.g. "TIM2", "TIM5")
  const timerMatch = register.match(/^TIM(\d+)$/);
  if (timerMatch && timerMatch[1]) {
    const timerNum = parseInt(timerMatch[1], 10);
    if (timerNum > board.timerCount) {
      return {
        valid: false,
        reason: `Timer TIM${timerNum} not available — ${board.name} has ${board.timerCount} timers`,
      };
    }
  }

  return { valid: true };
}

/**
 * Check if a peripheral name is supported by the board.
 */
export function validatePeripheralForBoard(
  peripheral: string,
  board: BoardCapabilities,
): boolean {
  return board.peripherals.includes(peripheral);
}

/** Built-in board registry keyed by Zephyr build target. */
export const BOARD_REGISTRY: Record<string, BoardCapabilities> = {
  stm32f4_disco: {
    name: 'STM32F4 Discovery',
    mcu: 'STM32F407VG',
    architecture: 'ARM Cortex-M4F',
    memoryFlash: 1024,
    memoryRam: 192,
    buildTarget: 'stm32f4_disco',
    peripherals: ['GPIO', 'UART', 'Timers', 'SPI', 'I2C', 'ADC', 'DMA'],
    gpioPorts: ['GPIOA', 'GPIOB', 'GPIOC', 'GPIOD', 'GPIOE', 'GPIOF', 'GPIOG', 'GPIOH', 'GPIOI'],
    timerCount: 14,
    hasBLE: false,
    hasWiFi: false,
    ledMappings: [
      { name: 'LD3', color: 'orange', gpioPort: 'GPIOG', pin: 13 },
      { name: 'LD4', color: 'green', gpioPort: 'GPIOG', pin: 12 },
      { name: 'LD5', color: 'red', gpioPort: 'GPIOG', pin: 14 },
      { name: 'LD6', color: 'blue', gpioPort: 'GPIOG', pin: 8 },
    ],
    devicetreePath: 'boards/st/stm32f407g_disc',
    renodePlatformDescription: 'platforms/cpus/stm32f4.repl',
    status: 'active',
  },

  nrf52840dk_nrf52840: {
    name: 'nRF52840 DK',
    mcu: 'nRF52840',
    architecture: 'ARM Cortex-M4F',
    memoryFlash: 1024,
    memoryRam: 256,
    buildTarget: 'nrf52840dk_nrf52840',
    peripherals: ['GPIO', 'UART', 'Timers', 'SPI', 'BLE'],
    gpioPorts: ['P0', 'P1'],
    timerCount: 5,
    hasBLE: true,
    hasWiFi: false,
    ledMappings: [
      { name: 'LED1', color: 'green', gpioPort: 'P0', pin: 13 },
      { name: 'LED2', color: 'green', gpioPort: 'P0', pin: 14 },
      { name: 'LED3', color: 'green', gpioPort: 'P0', pin: 15 },
      { name: 'LED4', color: 'green', gpioPort: 'P0', pin: 16 },
    ],
    devicetreePath: 'boards/nordic/nrf52840dk_nrf52840',
    renodePlatformDescription: 'platforms/cpus/nrf52840.repl',
    status: 'active',
  },

  esp32c3_devkitm: {
    name: 'ESP32-C3 DevKitM',
    mcu: 'ESP32-C3',
    architecture: 'RISC-V RV32IMC',
    memoryFlash: 4096,
    memoryRam: 400,
    buildTarget: 'esp32c3_devkitm',
    peripherals: ['GPIO', 'UART', 'SPI', 'I2C', 'ADC', 'WiFi'],
    gpioPorts: ['GPIO0', 'GPIO1'],
    timerCount: 4,
    hasBLE: false,
    hasWiFi: true,
    ledMappings: [
      { name: 'RGB_LED', color: 'rgb', gpioPort: 'GPIO1', pin: 3 },
    ],
    devicetreePath: 'boards/espressif/esp32c3_devkitm',
    renodePlatformDescription: 'platforms/cpus/esp32c3.repl',
    status: 'active',
  },
};

/**
 * Look up board capabilities by Zephyr build target.
 */
export function getBoardForTarget(target: string): BoardCapabilities | null {
  return BOARD_REGISTRY[target] ?? null;
}
