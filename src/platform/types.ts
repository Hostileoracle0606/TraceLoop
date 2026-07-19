// src/platform/types.ts
import type { BoardCapabilities, LedMapping } from '../engine/board-capabilities';

export const PLATFORM_SCHEMA_VERSION = 1;

/** A component instance from the netlist. */
export interface RawPart {
  refdes: string;
  value?: string;
  footprint?: string;
  libId?: string;
}

/** One pin of one component, and the MCU pin function if the netlist declares it. */
export interface RawNode {
  refdes: string;
  pin: string;
  pinfunction?: string;
}

export interface RawNet {
  name: string;
  nodes: RawNode[];
}

export interface RawSchematic {
  parts: RawPart[];
  nets: RawNet[];
}

export type PinFunction = 'gpio-out' | 'gpio-in' | 'i2c' | 'spi' | 'uart' | 'unknown';

export interface PinAssignment {
  mcuRefdes: string;
  pinfunction: string;        // e.g. 'PG13'
  gpioPort: string | null;    // e.g. 'GPIOG'
  pinNumber: number | null;   // e.g. 13
  net: string;                // net name, e.g. '/LED_GREEN'
  func: PinFunction;
  confidence: number;         // 0..1
}

export type FactCriticality = 'critical' | 'cosmetic';

export interface FactConfidence {
  fact: string;               // machine key, e.g. 'mcu-identity', 'pin:PG13:direction'
  score: number;              // 0..1
  criticality: FactCriticality;
  provenance: string;         // human string, e.g. 'pinfunction=PG13'
}

export interface DerivationWarning {
  code: string;               // e.g. 'dropped-part', 'conflicting-mapping'
  message: string;
  refs: string[];             // refdes / net names involved
}

export interface PlatformModel {
  schemaVersion: number;
  sourceHash: string;
  sourceFormat: 'kicad';
  mcuPartNumber: string;
  baseTarget: string;         // a BOARD_REGISTRY key
  pinAssignments: PinAssignment[];
  ledMappings: LedMapping[];
  peripherals: string[];
  confidence: FactConfidence[];
  warnings: DerivationWarning[];
}

export interface ResolvedMcu {
  kind: 'resolved';
  mcuPartNumber: string;
  baseTarget: string;
  template: BoardCapabilities;
}

export interface UnsupportedMcu {
  kind: 'unsupported';
  reason: string;
  detectedParts: string[];
}

export interface CriterionTarget {
  name: string;
  register: string;           // engine convention, e.g. 'GPIOG_ODR[13]'
  suggestedExpect: string;    // e.g. '1'
  confidence: number;
}

export interface Ambiguity {
  field: string;
  question: string;
  reason: string;
  options?: string[];
}

export interface DerivedPlatform {
  platformModel: PlatformModel;
  boardCapabilities: BoardCapabilities;
  renodeRepl: string;
  zephyrFiles: Record<string, string>;
  criteriaTargets: CriterionTarget[];
  gate: { autoProceed: boolean; blocking: Ambiguity[] };
}

export class SchematicParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchematicParseError';
  }
}
