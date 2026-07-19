import { validateAssertionForBoard } from '../../engine/board-capabilities';
import { toBoardCapabilities } from './board-capabilities';
import type { PlatformModel, CriterionTarget } from '../types';

/**
 * Suggest acceptance-criteria targets (the "where") from derived LEDs.
 * Only emits targets the engine would accept on the derived board (F10).
 * The user's objective supplies the "what" (expected value/timing) later.
 */
export function toCriteriaTargets(model: PlatformModel): CriterionTarget[] {
  const caps = toBoardCapabilities(model);
  const targets: CriterionTarget[] = [];
  for (const led of model.ledMappings) {
    const check = validateAssertionForBoard({ register: `${led.gpioPort}_ODR`, pin: led.pin }, caps);
    if (!check.valid) continue;
    targets.push({
      name: `${led.name} on`,
      register: `${led.gpioPort}_ODR[${led.pin}]`,
      suggestedExpect: '1',
      confidence: 0.8,
    });
  }
  return targets;
}
