import { createHash } from 'node:crypto';
import { parseKicadNetlist } from './parse/kicad';
import { resolveMcu } from './resolve-mcu';
import { compilePlatformModel } from './compile';
import { toBoardCapabilities } from './generate/board-capabilities';
import { toRenodeRepl } from './generate/renode-repl';
import { toZephyrBoardFiles } from './generate/zephyr-board';
import { toCriteriaTargets } from './generate/criteria-targets';
import { classifyConfidence } from './gate';
import { SchematicParseError, type DerivedPlatform, type UnsupportedMcu } from './types';

export type DeriveResult =
  | { kind: 'ok'; derived: DerivedPlatform }
  | { kind: 'unsupported'; detail: UnsupportedMcu }
  | { kind: 'parse-error'; error: SchematicParseError };

/** Content-address the schematic, normalized so cosmetic diffs share a key (C7). */
export function schematicHash(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(normalized).digest('hex');
}

export function derivePlatform(content: string, format: 'kicad'): DeriveResult {
  let raw;
  try {
    raw = parseKicadNetlist(content);
  } catch (e) {
    if (e instanceof SchematicParseError) return { kind: 'parse-error', error: e };
    throw e;
  }

  const mcu = resolveMcu(raw);
  if (mcu.kind === 'unsupported') return { kind: 'unsupported', detail: mcu };

  const model = compilePlatformModel(raw, mcu, schematicHash(content));
  const derived: DerivedPlatform = {
    platformModel: model,
    boardCapabilities: toBoardCapabilities(model),
    renodeRepl: toRenodeRepl(model),
    zephyrFiles: toZephyrBoardFiles(model),
    criteriaTargets: toCriteriaTargets(model),
    gate: classifyConfidence(model),
  };
  return { kind: 'ok', derived };
}
