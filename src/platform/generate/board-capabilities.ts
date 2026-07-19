import { BOARD_REGISTRY, type BoardCapabilities } from '../../engine/board-capabilities';
import type { PlatformModel } from '../types';

/**
 * Derive a BoardCapabilities: base silicon template (gpioPorts, timerCount, mcu…)
 * overlaid with the schematic's LED mappings + a 'derived' status. The causal
 * engine consumes this unchanged.
 */
export function toBoardCapabilities(model: PlatformModel): BoardCapabilities {
  const base = BOARD_REGISTRY[model.baseTarget]!;
  return {
    ...base,
    name: `Derived: ${model.mcuPartNumber}`,
    ledMappings: model.ledMappings.length ? model.ledMappings : base.ledMappings,
    status: 'derived',
  };
}
