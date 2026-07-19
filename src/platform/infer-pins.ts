import type { RawSchematic, ResolvedMcu, PinAssignment, PinFunction } from './types';

/** Parse an STM32-style pinfunction like 'PG13' → { port:'GPIOG', pin:13 }. */
function parsePortPin(pinfunction: string | undefined): { port: string; pin: number } | null {
  if (!pinfunction) return null;
  const m = pinfunction.match(/^P([A-I])(\d{1,2})$/);
  if (!m) return null;
  return { port: `GPIO${m[1]}`, pin: parseInt(m[2]!, 10) };
}

/** Does this net also connect to an LED (directly or through a resistor)? */
function drivesLed(netName: string, raw: RawSchematic, ledRefdes: Set<string>): boolean {
  const net = raw.nets.find((n) => n.name === netName);
  if (net && net.nodes.some((n) => ledRefdes.has(n.refdes))) return true;
  return false;
}

export function inferPinFunctions(raw: RawSchematic, mcu: ResolvedMcu): PinAssignment[] {
  const ledRefdes = new Set(raw.parts.filter((p) => /led/i.test(p.value ?? '')).map((p) => p.refdes));
  const mcuRef = mcuRefdes(raw, mcu);

  const assignments: PinAssignment[] = [];
  for (const net of raw.nets) {
    for (const node of net.nodes) {
      if (node.refdes !== mcuRef) continue;
      const pp = parsePortPin(node.pinfunction);
      const looksLikeLed = ledRefdes.size > 0 && (/led|status|blink/i.test(net.name) || drivesLed(net.name, raw, ledRefdes));

      let func: PinFunction = 'unknown';
      let confidence = 0.3;
      if (pp) {
        confidence = 0.9;
        func = looksLikeLed ? 'gpio-out' : 'gpio-out';
        if (!looksLikeLed) confidence = 0.7;
      }

      assignments.push({
        mcuRefdes: node.refdes,
        pinfunction: node.pinfunction ?? '',
        gpioPort: pp?.port ?? null,
        pinNumber: pp?.pin ?? null,
        net: net.name,
        func: pp ? func : 'unknown',
        confidence: pp ? confidence : 0.3,
      });
    }
  }
  return assignments.sort((a, b) => a.net.localeCompare(b.net));
}

/** The refdes of the resolved MCU part in this schematic. */
function mcuRefdes(raw: RawSchematic, mcu: ResolvedMcu): string {
  const part = raw.parts.find((p) => p.value === mcu.mcuPartNumber);
  return part?.refdes ?? '';
}
