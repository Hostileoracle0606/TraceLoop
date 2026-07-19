import { BOARD_REGISTRY } from '../../engine/board-capabilities';
import type { PlatformModel } from '../types';

/**
 * Generate a Renode .repl that `using`s the base platform and adds LED nodes.
 * Only LEDs are synthesized in slice 1 (that's what criteria assert on);
 * other peripherals come from the base platform, unmodeled ones are skipped.
 */
export function toRenodeRepl(model: PlatformModel): string {
  const base = BOARD_REGISTRY[model.baseTarget]!;
  const lines: string[] = [`using "${base.renodePlatformDescription}"`, ''];
  for (const led of model.ledMappings) {
    const id = led.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    lines.push(`${id}: Miscellaneous.LED @ ${led.gpioPort} ${led.pin}`);
  }
  return lines.join('\n') + '\n';
}

export function validateReplSyntax(repl: string): { valid: boolean; reason?: string } {
  for (const raw of repl.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('using ')) continue;
    // Every node line must be `name: Type ...` — a name with an empty type is invalid.
    const m = line.match(/^([a-z0-9_]+):\s*(\S.*)$/i);
    if (!m) return { valid: false, reason: `malformed .repl line: "${line}"` };
  }
  return { valid: true };
}
