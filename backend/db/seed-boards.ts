/**
 * Seed script — inserts the three default boards into Supabase.
 *
 * Usage: npx tsx backend/db/seed-boards.ts
 *
 * Uses ON CONFLICT DO NOTHING on the unique name constraint so it's safe to
 * run multiple times.
 */

import { db } from './index';
import { boards } from './schema';

const DEFAULT_BOARDS = [
  {
    name: 'STM32F4 Discovery',
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
    status: 'active',
  },
  {
    name: 'nRF52840 DK',
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
    status: 'active',
  },
  {
    name: 'ESP32-C3 DevKitM',
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
    status: 'active',
  },
];

async function seed() {
  console.log('Seeding boards...');

  for (const board of DEFAULT_BOARDS) {
    try {
      await db.insert(boards).values(board).onConflictDoNothing({ target: boards.name });
      console.log(`  ✓ ${board.name} (${board.buildTarget})`);
    } catch (err) {
      console.error(`  ✗ ${board.name}:`, err);
    }
  }

  console.log('Done.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
