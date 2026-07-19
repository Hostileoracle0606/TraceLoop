import { BOARD_REGISTRY } from '../engine/board-capabilities';
import { matchMcuPart } from './mcu-catalog';
import type { RawSchematic, ResolvedMcu, UnsupportedMcu } from './types';

export function resolveMcu(raw: RawSchematic): ResolvedMcu | UnsupportedMcu {
  const matches = raw.parts
    .map((p) => ({ part: p, target: p.value ? matchMcuPart(p.value) : null }))
    .filter((m): m is { part: typeof m.part; target: string } => m.target !== null);

  const distinctTargets = [...new Set(matches.map((m) => m.target))];

  if (matches.length === 0) {
    const candidates = raw.parts.filter((p) => (p.value ?? '').length > 4).map((p) => p.value!);
    return { kind: 'unsupported', reason: `no supported MCU found; detected: ${candidates.join(', ') || 'none'}`, detectedParts: candidates };
  }
  if (distinctTargets.length > 1) {
    return { kind: 'unsupported', reason: `multiple MCUs found (${distinctTargets.join(', ')}); one board per schematic`, detectedParts: distinctTargets };
  }

  const target = distinctTargets[0]!;
  return {
    kind: 'resolved',
    mcuPartNumber: matches[0]!.part.value!,
    baseTarget: target,
    template: BOARD_REGISTRY[target]!,
  };
}
