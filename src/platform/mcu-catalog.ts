import { BOARD_REGISTRY } from '../engine/board-capabilities';

/**
 * Map an MCU part number to a supported BOARD_REGISTRY base target.
 * The supported-MCU set IS the existing board registry — a derived platform
 * reuses a base silicon template and overlays the schematic's wiring.
 * Match by a family prefix so package/temp-grade suffixes are ignored.
 */
const MCU_PREFIX_TO_TARGET: Array<{ prefix: RegExp; target: keyof typeof BOARD_REGISTRY }> = [
  { prefix: /^STM32F407/i, target: 'stm32f4_disco' },
  { prefix: /^NRF52840/i, target: 'nrf52840dk_nrf52840' },
  { prefix: /^ESP32-?C3/i, target: 'esp32c3_devkitm' },
];

export function matchMcuPart(mpn: string): string | null {
  const hit = MCU_PREFIX_TO_TARGET.find((m) => m.prefix.test(mpn));
  return hit ? hit.target : null;
}
