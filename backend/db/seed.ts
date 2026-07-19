/**
 * Seed script — inserts default boards into the database.
 *
 * Usage:
 *   CLI:    npx tsx backend/db/seed.ts
 *   Script: npm run db:seed
 *   Import: import { seedBoards, DEFAULT_BOARDS } from './seed';
 *
 * Uses ON CONFLICT DO NOTHING on the unique name constraint so it's safe to
 * run multiple times.
 */

import { db } from './index';
import { boards } from './schema';

export const DEFAULT_BOARDS = [
  {
    name: 'STM32F4 Discovery',
    slug: 'stm32f4_disco',
    mcu: 'STM32F407VG',
    architecture: 'ARM Cortex-M4F',
    memoryFlash: 1024,
    memoryRam: 192,
    platformFile: 'platforms/cpus/stm32f4.repl',
    peripherals: ['GPIO', 'UART', 'Timers', 'SPI', 'I2C', 'ADC', 'DMA'],
    buildTarget: 'stm32f4_disco',
    devicetreePath: 'boards/st/stm32f407g_disc',
    ledMappings: [
      { name: 'LD4', color: 'green', gpioPort: 'GPIOG', pin: 12 },
      { name: 'LD3', color: 'orange', gpioPort: 'GPIOG', pin: 13 },
      { name: 'LD5', color: 'red', gpioPort: 'GPIOG', pin: 14 },
      { name: 'LD6', color: 'blue', gpioPort: 'GPIOG', pin: 8 },
    ],
    gpioPorts: ['GPIOA', 'GPIOB', 'GPIOC', 'GPIOD', 'GPIOE', 'GPIOF', 'GPIOG', 'GPIOH', 'GPIOI'],
    timerCount: 14,
    hasBLE: false,
    hasWiFi: false,
    renodePlatformDescription: 'platforms/cpus/stm32f4.repl',
    verified: true,
    status: 'active',
  },
  {
    name: 'nRF52840 DK',
    slug: 'nrf52840_dk',
    mcu: 'nRF52840',
    architecture: 'ARM Cortex-M4F',
    memoryFlash: 1024,
    memoryRam: 256,
    platformFile: 'platforms/cpus/nrf52840.repl',
    peripherals: ['GPIO', 'UART', 'Timers', 'SPI', 'BLE'],
    buildTarget: 'nrf52840dk_nrf52840',
    devicetreePath: 'boards/nordic/nrf52840dk_nrf52840',
    ledMappings: [
      { name: 'LED1', color: 'green', gpioPort: 'P0', pin: 13 },
      { name: 'LED2', color: 'green', gpioPort: 'P0', pin: 14 },
      { name: 'LED3', color: 'green', gpioPort: 'P0', pin: 15 },
      { name: 'LED4', color: 'green', gpioPort: 'P0', pin: 16 },
    ],
    gpioPorts: ['P0', 'P1'],
    timerCount: 5,
    hasBLE: true,
    hasWiFi: false,
    renodePlatformDescription: 'platforms/cpus/nrf52840.repl',
    verified: true,
    status: 'active',
  },
  {
    name: 'ESP32-C3 DevKitM',
    slug: 'esp32c3_devkitm',
    mcu: 'ESP32-C3',
    architecture: 'RISC-V RV32IMC',
    memoryFlash: 4096,
    memoryRam: 400,
    platformFile: 'platforms/cpus/esp32c3.repl',
    peripherals: ['GPIO', 'UART', 'SPI', 'I2C', 'ADC', 'WiFi'],
    buildTarget: 'esp32c3_devkitm',
    devicetreePath: 'boards/espressif/esp32c3_devkitm',
    ledMappings: [
      { name: 'RGB_LED', color: 'rgb', gpioPort: 'GPIO1', pin: 3 },
    ],
    gpioPorts: ['GPIO0', 'GPIO1'],
    timerCount: 4,
    hasBLE: false,
    hasWiFi: true,
    renodePlatformDescription: 'platforms/cpus/esp32c3.repl',
    verified: true,
    status: 'active',
  },
];

/**
 * Seed the boards table with default board definitions.
 * Uses ON CONFLICT DO NOTHING on the unique name constraint for idempotency.
 */
export async function seedBoards(database: typeof db): Promise<void> {
  for (const board of DEFAULT_BOARDS) {
    await database.insert(boards).values(board).onConflictDoNothing({ target: boards.name });
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  async function main() {
    console.log('Seeding boards...');
    await seedBoards(db);
    console.log(`✓ Seeded ${DEFAULT_BOARDS.length} boards`);
    process.exit(0);
  }

  main().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}
