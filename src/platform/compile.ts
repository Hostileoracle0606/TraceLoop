import type { LedMapping } from '../engine/board-capabilities';
import { inferPinFunctions } from './infer-pins';
import {
  PLATFORM_SCHEMA_VERSION,
  type RawSchematic, type ResolvedMcu, type PlatformModel,
  type FactConfidence, type DerivationWarning,
} from './types';

const COLOR_WORDS = ['red', 'green', 'blue', 'orange', 'yellow', 'white', 'amber'];

function colorFromNet(netName: string, ledValue: string | undefined): string {
  const hay = `${netName} ${ledValue ?? ''}`.toLowerCase();
  return COLOR_WORDS.find((c) => hay.includes(c)) ?? 'unknown';
}

export function compilePlatformModel(raw: RawSchematic, mcu: ResolvedMcu, sourceHash: string): PlatformModel {
  const pinAssignments = inferPinFunctions(raw, mcu);
  const warnings: DerivationWarning[] = [];
  const confidence: FactConfidence[] = [
    { fact: 'mcu-identity', score: 0.95, criticality: 'critical', provenance: `part value ${mcu.mcuPartNumber}` },
  ];

  const ledParts = new Map(raw.parts.filter((p) => /led/i.test(p.value ?? '')).map((p) => [p.refdes, p.value]));
  const ledMappings: LedMapping[] = [];
  const seen = new Map<string, string>(); // 'GPIOG:13' -> net

  for (const a of pinAssignments) {
    if (a.gpioPort == null || a.pinNumber == null) continue;
    const net = raw.nets.find((n) => n.name === a.net)!;
    const led = net.nodes.map((n) => ledParts.get(n.refdes)).find(Boolean);
    if (!led) continue;

    const key = `${a.gpioPort}:${a.pinNumber}`;
    if (seen.has(key)) {
      warnings.push({ code: 'conflicting-mapping', message: `${key} mapped by both ${seen.get(key)} and ${a.net}`, refs: [seen.get(key)!, a.net] });
      continue;
    }
    seen.set(key, a.net);
    const color = colorFromNet(a.net, led);
    ledMappings.push({ name: a.net.replace(/^\//, ''), color, gpioPort: a.gpioPort, pin: a.pinNumber });
    confidence.push({ fact: `led:${key}`, score: a.confidence, criticality: 'cosmetic', provenance: `net ${a.net} + ${led}` });
    confidence.push({ fact: `pin:${a.pinfunction}:direction`, score: a.confidence, criticality: 'critical', provenance: `drives ${led}` });
  }

  // C5: any non-MCU, non-LED part is dropped (out of register-level simulation) with a warning
  const mcuRef = raw.parts.find((p) => p.value === mcu.mcuPartNumber)?.refdes;
  for (const p of raw.parts) {
    if (p.refdes === mcuRef || ledParts.has(p.refdes)) continue;
    warnings.push({ code: 'dropped-part', message: `${p.refdes} (${p.value ?? '?'}) not modeled at register level`, refs: [p.refdes] });
  }

  return {
    schemaVersion: PLATFORM_SCHEMA_VERSION,
    sourceHash,
    sourceFormat: 'kicad',
    mcuPartNumber: mcu.mcuPartNumber,
    baseTarget: mcu.baseTarget,
    pinAssignments,
    ledMappings,
    peripherals: mcu.template.peripherals,
    confidence,
    warnings,
  };
}
