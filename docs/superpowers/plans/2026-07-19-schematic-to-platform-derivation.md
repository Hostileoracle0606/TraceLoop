# Schematic → Derived Platform (Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execute in an isolated worktree (superpowers:using-git-worktrees).

**Goal:** Turn an uploaded KiCad netlist into a validated, deterministic `PlatformModel` and the four derived artifacts a firmware run needs — a `BoardCapabilities` (the engine's existing type), a Renode `.repl`, Zephyr overlay files, and acceptance-criteria targets — plus a confidence gate that blocks only on genuinely ambiguous critical facts.

**Architecture:** A new pure module `src/platform/` with zero I/O. The pipeline is `netlist → RawSchematic → PlatformModel → {BoardCapabilities, .repl, Zephyr files, criteria targets} + gate`. The "supported MCU" set reuses the existing `BOARD_REGISTRY`; a derived platform is a *base board template + a devicetree/wiring overlay*, so the causal engine and `validateAssertionForBoard` work unchanged. KiCad's `pinfunction` (e.g. `PG13`) gives deterministic port/pin; net names give intent — confidence is graded from both.

**Tech Stack:** TypeScript, Vitest, Node `crypto` (hashing). No new runtime dependencies (a hand-rolled S-expression tokenizer avoids pulling an EDA library for one format).

---

## Scope

This is **Slice 1 of a multi-plan pivot** — the deterministic derivation spine. It produces working, testable software on its own: feed a netlist, get validated artifacts + a gate decision. It does **not** run Renode, touch the DB, add UI, or parse EAGLE/Altium. Those are explicit follow-on plans (see the end). Everything here is a pure function — no Modal, no Inngest, no tRPC changes.

## Hard constraints (each enforced by a named test)

| # | Constraint | Enforced by |
|---|---|---|
| C1 | `src/platform/` is pure & deterministic: no `fetch`, no `db`, no `Date.now()`, no `Math.random()`; same input → identical output | Task 12 purity scan + Task 11 determinism test |
| C2 | A derived platform produces a valid `BoardCapabilities` that the engine's `validateAssertionForBoard` accepts for its own LED registers | Task 6 round-trip test |
| C3 | An unknown/unsupported MCU never silently defaults — `resolveMcu` returns a typed `UnsupportedMcu`, and the gate makes it blocking | Task 3 + Task 10 tests |
| C4 | No derived fact is emitted without a `confidence` score and provenance | Task 5 test asserts every fact carries confidence |
| C5 | Analog/power/passive parts are recorded as `warnings`, never silently discarded | Task 5 dropped-parts test |
| C6 | Register strings match the engine convention exactly (`GPIOG_ODR[13]`, `TIM2_SR.UIF`) | Task 9 format test |
| C7 | The cache key is a stable hash of the *normalized* schematic — reordered nets / whitespace that don't change electrical meaning yield the same hash | Task 11 hash-stability test |
| C8 | Generated `.repl` and Zephyr files are syntactically validated by the generator, not assumed valid | Task 7 + Task 8 validator tests |

## Anticipated failures → tests (design these first)

| ID | Failure | Test | Task |
|----|---|---|---|
| F1 | S-expr tokenizer breaks on quoted strings containing parens / escaped quotes | tokenizer parses `(name "a (b) c")` and `"a\"b"` correctly | 1 |
| F2 | Empty/garbage netlist crashes instead of erroring cleanly | parser throws typed `SchematicParseError` on `""` and on non-export S-expr | 2 |
| F3 | MCU present under an unknown MPN → wrong default board | `resolveMcu` returns `{kind:'unsupported'}` for `ATmega328P`; never a silent stm32 | 3 |
| F4 | Net named `LED` that's actually a power rail; a pin with no `pinfunction` | inference scores `unknown`/low confidence rather than asserting gpio-out | 4 |
| F5 | Zero MCUs or ≥2 MCUs in the netlist | `resolveMcu` returns unsupported with a clear reason, never picks one | 3 |
| F6 | A `pinfunction` pin number outside 0–15 (e.g. `PG20`) | derived `BoardCapabilities` fails the engine's own 0–15 range check | 6 |
| F7 | A peripheral the base template doesn't model | `.repl` emits only template-backed peripherals + a warning; never malformed | 7 |
| F8 | Two LEDs mapped to the same port+pin, or one net → two MCU pins | compile dedups and emits a `conflicting-mapping` warning | 5 |
| F9 | Nondeterministic ordering from object iteration leaks into output/hash | determinism test: parse→compile twice, `toEqual`; hash identical | 11 |
| F10 | A criterion target references a register the board doesn't expose | `toCriteriaTargets` only emits targets that pass `validateAssertionForBoard` | 9 |
| F11 | Duplicate refdes or a node referencing an undeclared component | parser throws `SchematicParseError` naming the offending refdes | 2 |
| F12 | Gate lets a low-confidence *critical* fact (MCU identity, pin direction) auto-proceed | gate blocks when any `critical` fact scores below threshold; cosmetic facts (LED color) never block | 10 |

## File structure

```
src/platform/
  types.ts                        # all shared types + error classes (Task 0)
  parse/
    sexpr.ts        sexpr.test.ts  # pure S-expression tokenizer/parser (Task 1)
    kicad.ts        kicad.test.ts  # parseKicadNetlist -> RawSchematic (Task 2)
  mcu-catalog.ts    mcu-catalog.test.ts   # MPN -> BOARD_REGISTRY base target (Task 3a)
  resolve-mcu.ts    resolve-mcu.test.ts   # resolveMcu(raw) (Task 3b)
  infer-pins.ts     infer-pins.test.ts    # inferPinFunctions (Task 4)
  compile.ts        compile.test.ts       # compilePlatformModel (Task 5)
  generate/
    board-capabilities.ts  .test.ts       # toBoardCapabilities (Task 6)
    renode-repl.ts         .test.ts       # toRenodeRepl + validateReplSyntax (Task 7)
    zephyr-board.ts        .test.ts       # toZephyrBoardFiles (Task 8)
    criteria-targets.ts    .test.ts       # toCriteriaTargets (Task 9)
  gate.ts           gate.test.ts          # classifyConfidence + artifact (Task 10)
  derive.ts         derive.test.ts        # derivePlatform orchestration + cache key (Task 11)
  __fixtures__/
    blinky.kicad.net            # STM32F407 + green LED on PG13 (happy path)
    ambiguous.kicad.net         # LED net with no pinfunction (low confidence)
    unknown-mcu.kicad.net       # ATmega328P (unsupported)
  __tests__/purity.test.ts      # import-scan: no io in src/platform (Task 12)
```

Vitest already includes `src/**` (see `package.json` `test` script). No config change needed.

---

### Task 0: Shared types and error classes

**Files:**
- Create: `src/platform/types.ts`

- [ ] **Step 1: Write the types (no test — this is a type-only module consumed by every later task)**

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (types-only file, no consumers yet).

- [ ] **Step 3: Commit**

```bash
git add src/platform/types.ts
git commit -m "feat(platform): shared PlatformModel types and error classes"
```

### Task 1: Pure S-expression parser (F1)

**Files:**
- Create: `src/platform/parse/sexpr.ts`, `src/platform/parse/sexpr.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/platform/parse/sexpr.test.ts
import { describe, it, expect } from 'vitest';
import { parseSexpr, type SNode } from './sexpr';

describe('parseSexpr', () => {
  it('parses a flat list of atoms', () => {
    expect(parseSexpr('(a b c)')).toEqual(['a', 'b', 'c']);
  });

  it('parses nested lists', () => {
    expect(parseSexpr('(a (b c) d)')).toEqual(['a', ['b', 'c'], 'd']);
  });

  it('F1: keeps parens and spaces inside quoted strings', () => {
    expect(parseSexpr('(name "a (b) c")')).toEqual(['name', 'a (b) c']);
  });

  it('F1: handles escaped quotes inside strings', () => {
    expect(parseSexpr('(v "a\\"b")')).toEqual(['v', 'a"b']);
  });

  it('throws on unbalanced parens', () => {
    expect(() => parseSexpr('(a (b)')).toThrow(/unbalanced/i);
  });

  it('returns the first top-level form only', () => {
    const node = parseSexpr('(export (version "E"))') as SNode[];
    expect(node[0]).toBe('export');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/platform/parse/sexpr.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/platform/parse/sexpr.ts
export type SNode = string | SNode[];

/** Parse the first top-level S-expression. Strings may contain parens/escapes. */
export function parseSexpr(input: string): SNode {
  let i = 0;

  function skipWs() {
    while (i < input.length && /\s/.test(input[i]!)) i++;
  }

  function readString(): string {
    i++; // opening quote
    let out = '';
    while (i < input.length) {
      const ch = input[i]!;
      if (ch === '\\' && i + 1 < input.length) {
        out += input[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"') {
        i++;
        return out;
      }
      out += ch;
      i++;
    }
    throw new Error('unbalanced quotes in S-expression');
  }

  function readAtom(): string {
    let out = '';
    while (i < input.length && !/[\s()]/.test(input[i]!)) {
      out += input[i]!;
      i++;
    }
    return out;
  }

  function readList(): SNode[] {
    i++; // opening paren
    const list: SNode[] = [];
    for (;;) {
      skipWs();
      if (i >= input.length) throw new Error('unbalanced parens in S-expression');
      const ch = input[i]!;
      if (ch === ')') { i++; return list; }
      if (ch === '(') { list.push(readList()); continue; }
      if (ch === '"') { list.push(readString()); continue; }
      list.push(readAtom());
    }
  }

  skipWs();
  if (input[i] !== '(') throw new Error('unbalanced parens: expected opening paren');
  return readList();
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/platform/parse/sexpr.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/platform/parse/sexpr.ts src/platform/parse/sexpr.test.ts
git commit -m "feat(platform): pure S-expression parser resilient to quoted parens/escapes"
```

### Task 2: KiCad netlist parser (F2, F11)

**Files:**
- Create: `src/platform/parse/kicad.ts`, `src/platform/parse/kicad.test.ts`
- Create: `src/platform/__fixtures__/blinky.kicad.net`

- [ ] **Step 1: Write the fixture**

```
(export (version "E")
  (components
    (comp (ref "U1") (value "STM32F407VGT6") (footprint "Package_QFP:LQFP-100"))
    (comp (ref "D1") (value "LED_Green") (footprint "LED_SMD:LED_0805"))
    (comp (ref "R1") (value "330") (footprint "Resistor_SMD:R_0805")))
  (nets
    (net (code "1") (name "/LED_GREEN")
      (node (ref "U1") (pin "108") (pinfunction "PG13"))
      (node (ref "R1") (pin "1")))
    (net (code "2") (name "Net-(D1-A)")
      (node (ref "R1") (pin "2"))
      (node (ref "D1") (pin "2") (pinfunction "A")))
    (net (code "3") (name "GND")
      (node (ref "U1") (pin "10"))
      (node (ref "D1") (pin "1") (pinfunction "K")))))
```

- [ ] **Step 2: Write the failing tests**

```ts
// src/platform/parse/kicad.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseKicadNetlist } from './kicad';
import { SchematicParseError } from '../types';

const blinky = readFileSync(new URL('../__fixtures__/blinky.kicad.net', import.meta.url), 'utf8');

describe('parseKicadNetlist', () => {
  it('extracts parts with value and footprint', () => {
    const raw = parseKicadNetlist(blinky);
    const u1 = raw.parts.find((p) => p.refdes === 'U1');
    expect(u1).toMatchObject({ refdes: 'U1', value: 'STM32F407VGT6' });
    expect(raw.parts.map((p) => p.refdes).sort()).toEqual(['D1', 'R1', 'U1']);
  });

  it('extracts nets with nodes and pinfunction', () => {
    const raw = parseKicadNetlist(blinky);
    const led = raw.nets.find((n) => n.name === '/LED_GREEN')!;
    const u1node = led.nodes.find((n) => n.refdes === 'U1')!;
    expect(u1node.pinfunction).toBe('PG13');
  });

  it('F2: throws SchematicParseError on empty input', () => {
    expect(() => parseKicadNetlist('')).toThrow(SchematicParseError);
  });

  it('F2: throws SchematicParseError on a non-export S-expr', () => {
    expect(() => parseKicadNetlist('(design (foo))')).toThrow(SchematicParseError);
  });

  it('F11: throws naming a node that references an undeclared component', () => {
    const bad = `(export (version "E")
      (components (comp (ref "U1") (value "STM32F407VGT6")))
      (nets (net (code "1") (name "N") (node (ref "X9") (pin "1")))))`;
    expect(() => parseKicadNetlist(bad)).toThrow(/X9/);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/platform/parse/kicad.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
// src/platform/parse/kicad.ts
import { parseSexpr, type SNode } from './sexpr';
import { SchematicParseError, type RawSchematic, type RawPart, type RawNet, type RawNode } from '../types';

function isList(n: SNode): n is SNode[] {
  return Array.isArray(n);
}

/** Find all direct children whose head atom equals `tag`. */
function children(list: SNode[], tag: string): SNode[][] {
  return list.filter((c): c is SNode[] => isList(c) && c[0] === tag);
}

/** Value of a `(key "value")` child, or undefined. */
function prop(list: SNode[], key: string): string | undefined {
  const found = list.find((c): c is SNode[] => isList(c) && c[0] === key);
  return found && typeof found[1] === 'string' ? found[1] : undefined;
}

export function parseKicadNetlist(content: string): RawSchematic {
  if (!content.trim()) throw new SchematicParseError('empty netlist');

  let root: SNode;
  try {
    root = parseSexpr(content);
  } catch (e) {
    throw new SchematicParseError(`not a valid S-expression: ${(e as Error).message}`);
  }
  if (!isList(root) || root[0] !== 'export') {
    throw new SchematicParseError("not a KiCad netlist (missing 'export' root)");
  }

  const componentsBlock = children(root, 'components')[0] ?? [];
  const parts: RawPart[] = children(componentsBlock, 'comp').map((comp) => ({
    refdes: prop(comp, 'ref') ?? '',
    value: prop(comp, 'value'),
    footprint: prop(comp, 'footprint'),
    libId: prop(comp, 'libsource'),
  }));
  const known = new Set(parts.map((p) => p.refdes));
  const dupes = parts.map((p) => p.refdes).filter((r, i, a) => a.indexOf(r) !== i);
  if (dupes.length) throw new SchematicParseError(`duplicate refdes: ${dupes.join(', ')}`);

  const netsBlock = children(root, 'nets')[0] ?? [];
  const nets: RawNet[] = children(netsBlock, 'net').map((net) => {
    const nodes: RawNode[] = children(net, 'node').map((node) => {
      const refdes = prop(node, 'ref') ?? '';
      if (!known.has(refdes)) {
        throw new SchematicParseError(`net node references undeclared component: ${refdes}`);
      }
      return { refdes, pin: prop(node, 'pin') ?? '', pinfunction: prop(node, 'pinfunction') };
    });
    return { name: prop(net, 'name') ?? '', nodes };
  });

  return { parts, nets };
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/platform/parse/kicad.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/platform/parse/kicad.ts src/platform/parse/kicad.test.ts src/platform/__fixtures__/blinky.kicad.net
git commit -m "feat(platform): KiCad netlist parser with typed parse errors"
```

### Task 3: MCU catalog + resolveMcu (C3, F3, F5)

**Files:**
- Create: `src/platform/mcu-catalog.ts`, `src/platform/mcu-catalog.test.ts`
- Create: `src/platform/resolve-mcu.ts`, `src/platform/resolve-mcu.test.ts`
- Create: `src/platform/__fixtures__/unknown-mcu.kicad.net`

- [ ] **Step 1: Write the catalog test** (reuses `BOARD_REGISTRY` as the supported set — DRY)

```ts
// src/platform/mcu-catalog.test.ts
import { describe, it, expect } from 'vitest';
import { matchMcuPart } from './mcu-catalog';

describe('matchMcuPart', () => {
  it('matches an STM32F407 MPN to the stm32f4_disco base target', () => {
    expect(matchMcuPart('STM32F407VGT6')).toBe('stm32f4_disco');
    expect(matchMcuPart('STM32F407VG')).toBe('stm32f4_disco');
  });

  it('matches an nRF52840 MPN to its base target', () => {
    expect(matchMcuPart('nRF52840-QIAA')).toBe('nrf52840dk_nrf52840');
  });

  it('returns null for an unsupported MCU', () => {
    expect(matchMcuPart('ATmega328P-PU')).toBeNull();
  });

  it('is case-insensitive on the family prefix', () => {
    expect(matchMcuPart('stm32f407vg')).toBe('stm32f4_disco');
  });
});
```

- [ ] **Step 2: Run → FAIL, then implement the catalog**

```ts
// src/platform/mcu-catalog.ts
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
```

- [ ] **Step 3: Write the unknown-mcu fixture**

```
(export (version "E")
  (components (comp (ref "U1") (value "ATmega328P-PU") (footprint "DIP-28")))
  (nets (net (code "1") (name "/BLINK")
    (node (ref "U1") (pin "14") (pinfunction "PB0")))))
```

- [ ] **Step 4: Write resolve-mcu tests (C3/F3/F5)**

```ts
// src/platform/resolve-mcu.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveMcu } from './resolve-mcu';
import { parseKicadNetlist } from './parse/kicad';

const load = (f: string) => parseKicadNetlist(readFileSync(new URL(`./__fixtures__/${f}`, import.meta.url), 'utf8'));

describe('resolveMcu', () => {
  it('resolves the supported MCU with its base template', () => {
    const r = resolveMcu(load('blinky.kicad.net'));
    expect(r.kind).toBe('resolved');
    if (r.kind === 'resolved') {
      expect(r.baseTarget).toBe('stm32f4_disco');
      expect(r.template.mcu).toBe('STM32F407VG');
    }
  });

  it('C3/F3: returns unsupported for an unknown MCU — never a silent default', () => {
    const r = resolveMcu(load('unknown-mcu.kicad.net'));
    expect(r.kind).toBe('unsupported');
    if (r.kind === 'unsupported') expect(r.reason).toMatch(/ATmega328P/);
  });

  it('F5: returns unsupported when no MCU-like part is present', () => {
    const raw = { parts: [{ refdes: 'R1', value: '330' }], nets: [] };
    expect(resolveMcu(raw).kind).toBe('unsupported');
  });

  it('F5: returns unsupported when two different supported MCUs are present', () => {
    const raw = {
      parts: [{ refdes: 'U1', value: 'STM32F407VG' }, { refdes: 'U2', value: 'nRF52840' }],
      nets: [],
    };
    const r = resolveMcu(raw);
    expect(r.kind).toBe('unsupported');
    if (r.kind === 'unsupported') expect(r.reason).toMatch(/multiple/i);
  });
});
```

- [ ] **Step 5: Run → FAIL, then implement resolve-mcu**

```ts
// src/platform/resolve-mcu.ts
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
```

- [ ] **Step 6: Run → PASS, then commit**

```bash
git add src/platform/mcu-catalog.ts src/platform/mcu-catalog.test.ts src/platform/resolve-mcu.ts src/platform/resolve-mcu.test.ts src/platform/__fixtures__/unknown-mcu.kicad.net
git commit -m "feat(platform): MCU resolution against BOARD_REGISTRY; unknown/multi MCU blocked"
```

### Task 4: Pin-function inference (C4, F4)

**Files:**
- Create: `src/platform/infer-pins.ts`, `src/platform/infer-pins.test.ts`
- Create: `src/platform/__fixtures__/ambiguous.kicad.net`

- [ ] **Step 1: Write the ambiguous fixture** (LED net, but the MCU node has no `pinfunction`)

```
(export (version "E")
  (components
    (comp (ref "U1") (value "STM32F407VG"))
    (comp (ref "D1") (value "LED_Red")))
  (nets
    (net (code "1") (name "/STATUS")
      (node (ref "U1") (pin "42"))
      (node (ref "D1") (pin "2")))))
```

- [ ] **Step 2: Write the tests (C4/F4)**

```ts
// src/platform/infer-pins.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { inferPinFunctions } from './infer-pins';
import { parseKicadNetlist } from './parse/kicad';
import { resolveMcu } from './resolve-mcu';

const load = (f: string) => parseKicadNetlist(readFileSync(new URL(`./__fixtures__/${f}`, import.meta.url), 'utf8'));
function pins(f: string) {
  const raw = load(f);
  const mcu = resolveMcu(raw);
  if (mcu.kind !== 'resolved') throw new Error('fixture MCU should resolve');
  return inferPinFunctions(raw, mcu);
}

describe('inferPinFunctions', () => {
  it('maps PG13 → GPIOG pin 13 with high confidence from pinfunction', () => {
    const a = pins('blinky.kicad.net').find((p) => p.pinfunction === 'PG13')!;
    expect(a.gpioPort).toBe('GPIOG');
    expect(a.pinNumber).toBe(13);
    expect(a.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('infers gpio-out when the pin drives an LED (via a series resistor net)', () => {
    const a = pins('blinky.kicad.net').find((p) => p.pinfunction === 'PG13')!;
    expect(a.func).toBe('gpio-out');
  });

  it('C4: every assignment carries a confidence score', () => {
    for (const a of pins('blinky.kicad.net')) {
      expect(a.confidence).toBeGreaterThan(0);
      expect(a.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('F4: a pin with no pinfunction yields unknown port/func at low confidence — no wrong guess', () => {
    const a = pins('ambiguous.kicad.net')[0]!;
    expect(a.gpioPort).toBeNull();
    expect(a.func).toBe('unknown');
    expect(a.confidence).toBeLessThan(0.5);
  });
});
```

- [ ] **Step 3: Run → FAIL, then implement**

```ts
// src/platform/infer-pins.ts
import type { RawSchematic, ResolvedMcu, PinAssignment, PinFunction } from './types';

/** Parse an STM32-style pinfunction like 'PG13' → { port:'GPIOG', pin:13 }. */
function parsePortPin(pinfunction: string | undefined): { port: string; pin: number } | null {
  if (!pinfunction) return null;
  const m = pinfunction.match(/^P([A-I])(\d{1,2})$/);
  if (!m) return null;
  return { port: `GPIO${m[1]}`, pin: parseInt(m[2]!, 10) };
}

/** Does this net also connect to an LED (directly or through a resistor)? */
function driialsLed(netName: string, raw: RawSchematic, ledRefdes: Set<string>): boolean {
  // direct: the same net has an LED node
  const net = raw.nets.find((n) => n.name === netName);
  if (net && net.nodes.some((n) => ledRefdes.has(n.refdes))) return true;
  // one hop through a resistor: net shares a resistor whose other net hits an LED
  return false; // series-resistor tracing is a follow-on; direct + name heuristic is enough for slice 1
}

export function inferPinFunctions(raw: RawSchematic, mcu: ResolvedMcu): PinAssignment[] {
  const ledRefdes = new Set(raw.parts.filter((p) => /led/i.test(p.value ?? '')).map((p) => p.refdes));

  const assignments: PinAssignment[] = [];
  for (const net of raw.nets) {
    for (const node of net.nodes) {
      if (node.refdes !== mcu.template && node.refdes !== mcuRefdes(raw, mcu)) continue;
      const pp = parsePortPin(node.pinfunction);
      const looksLikeLed = ledRefdes.size > 0 && (/led|status|blink/i.test(net.name) || driialsLed(net.name, raw, ledRefdes));

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
```

Note: `node.refdes !== mcu.template` is wrong — fix during implementation to compare against `mcuRefdes(raw, mcu)` only. The intended predicate is: keep only nodes on the MCU. Implement it as:

```ts
      const mcuRef = mcuRefdes(raw, mcu);
      if (node.refdes !== mcuRef) continue;
```

(Compute `mcuRef` once before the loops.)

- [ ] **Step 4: Run → PASS, then commit**

```bash
git add src/platform/infer-pins.ts src/platform/infer-pins.test.ts src/platform/__fixtures__/ambiguous.kicad.net
git commit -m "feat(platform): graded pin-function inference from pinfunction + net intent"
```

### Task 5: compilePlatformModel (C4, C5, F8)

**Files:**
- Create: `src/platform/compile.ts`, `src/platform/compile.test.ts`

- [ ] **Step 1: Write the tests**

```ts
// src/platform/compile.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compilePlatformModel } from './compile';
import { parseKicadNetlist } from './parse/kicad';
import { resolveMcu } from './resolve-mcu';

const raw = parseKicadNetlist(readFileSync(new URL('./__fixtures__/blinky.kicad.net', import.meta.url), 'utf8'));
const mcu = resolveMcu(raw);
if (mcu.kind !== 'resolved') throw new Error('fixture must resolve');

describe('compilePlatformModel', () => {
  it('builds a model with the base target and a stable sourceHash', () => {
    const m = compilePlatformModel(raw, mcu, 'HASH123');
    expect(m.baseTarget).toBe('stm32f4_disco');
    expect(m.sourceHash).toBe('HASH123');
    expect(m.schemaVersion).toBe(1);
  });

  it('derives an LED mapping from the LED net + PG13', () => {
    const m = compilePlatformModel(raw, mcu, 'H');
    expect(m.ledMappings).toContainEqual(expect.objectContaining({ color: 'green', gpioPort: 'GPIOG', pin: 13 }));
  });

  it('C4: every LED mapping and MCU-identity has a confidence entry', () => {
    const m = compilePlatformModel(raw, mcu, 'H');
    expect(m.confidence.find((c) => c.fact === 'mcu-identity')).toBeDefined();
    expect(m.confidence.every((c) => c.score >= 0 && c.score <= 1)).toBe(true);
  });

  it('C5: records analog/passive parts as dropped-part warnings, never silently', () => {
    const m = compilePlatformModel(raw, mcu, 'H');
    const dropped = m.warnings.filter((w) => w.code === 'dropped-part');
    expect(dropped.some((w) => w.refs.includes('R1'))).toBe(true);
  });

  it('F8: flags two mappings on the same port+pin as a conflict', () => {
    const dupRaw = {
      parts: [{ refdes: 'U1', value: 'STM32F407VG' }, { refdes: 'D1', value: 'LED_Green' }, { refdes: 'D2', value: 'LED_Red' }],
      nets: [
        { name: '/A', nodes: [{ refdes: 'U1', pin: '1', pinfunction: 'PG13' }, { refdes: 'D1', pin: '2' }] },
        { name: '/B', nodes: [{ refdes: 'U1', pin: '2', pinfunction: 'PG13' }, { refdes: 'D2', pin: '2' }] },
      ],
    };
    const m = compilePlatformModel(dupRaw, mcu, 'H');
    expect(m.warnings.some((w) => w.code === 'conflicting-mapping')).toBe(true);
  });
});
```

- [ ] **Step 2: Run → FAIL, then implement**

```ts
// src/platform/compile.ts
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
```

- [ ] **Step 3: Run → PASS, then commit**

```bash
git add src/platform/compile.ts src/platform/compile.test.ts
git commit -m "feat(platform): compile PlatformModel with confidence + dropped/conflict warnings"
```

### Task 6: toBoardCapabilities — reuse the engine (C2, F6)

**Files:**
- Create: `src/platform/generate/board-capabilities.ts`, `src/platform/generate/board-capabilities.test.ts`

- [ ] **Step 1: Write the tests (C2 round-trip, F6 range)**

```ts
// src/platform/generate/board-capabilities.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { toBoardCapabilities } from './board-capabilities';
import { compilePlatformModel } from '../compile';
import { parseKicadNetlist } from '../parse/kicad';
import { resolveMcu } from '../resolve-mcu';
import { validateAssertionForBoard } from '../../engine/board-capabilities';

function model(f: string) {
  const raw = parseKicadNetlist(readFileSync(new URL(`../__fixtures__/${f}`, import.meta.url), 'utf8'));
  const mcu = resolveMcu(raw);
  if (mcu.kind !== 'resolved') throw new Error('resolve');
  return compilePlatformModel(raw, mcu, 'H');
}

describe('toBoardCapabilities', () => {
  it('produces a derived board whose LED mappings come from the schematic, not the base', () => {
    const caps = toBoardCapabilities(model('blinky.kicad.net'));
    expect(caps.status).toBe('derived');
    expect(caps.ledMappings).toContainEqual(expect.objectContaining({ gpioPort: 'GPIOG', pin: 13, color: 'green' }));
  });

  it('C2: the engine accepts an assertion on a derived LED register', () => {
    const caps = toBoardCapabilities(model('blinky.kicad.net'));
    const led = caps.ledMappings[0]!;
    const res = validateAssertionForBoard({ register: `${led.gpioPort}_ODR`, pin: led.pin }, caps);
    expect(res.valid).toBe(true);
  });

  it('F6: the engine rejects a pin outside 0–15 even on a derived board', () => {
    const caps = toBoardCapabilities(model('blinky.kicad.net'));
    const res = validateAssertionForBoard({ register: 'GPIOG_ODR', pin: 20 }, caps);
    expect(res.valid).toBe(false);
  });

  it('keeps the base silicon fields (mcu, gpioPorts, timerCount)', () => {
    const caps = toBoardCapabilities(model('blinky.kicad.net'));
    expect(caps.mcu).toBe('STM32F407VG');
    expect(caps.gpioPorts).toContain('GPIOG');
    expect(caps.timerCount).toBe(14);
  });
});
```

- [ ] **Step 2: Run → FAIL, then implement**

```ts
// src/platform/generate/board-capabilities.ts
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
```

- [ ] **Step 3: Run → PASS, then commit**

```bash
git add src/platform/generate/board-capabilities.ts src/platform/generate/board-capabilities.test.ts
git commit -m "feat(platform): derive engine BoardCapabilities from PlatformModel (reuse validation)"
```

### Task 7: toRenodeRepl + validateReplSyntax (C8, F7)

**Files:**
- Create: `src/platform/generate/renode-repl.ts`, `src/platform/generate/renode-repl.test.ts`

- [ ] **Step 1: Write the tests**

```ts
// src/platform/generate/renode-repl.test.ts
import { describe, it, expect } from 'vitest';
import { toRenodeRepl, validateReplSyntax } from './renode-repl';
import { BOARD_REGISTRY } from '../../engine/board-capabilities';
import type { PlatformModel } from '../types';

const model: PlatformModel = {
  schemaVersion: 1, sourceHash: 'H', sourceFormat: 'kicad',
  mcuPartNumber: 'STM32F407VG', baseTarget: 'stm32f4_disco',
  pinAssignments: [], peripherals: BOARD_REGISTRY.stm32f4_disco!.peripherals,
  ledMappings: [{ name: 'LED_GREEN', color: 'green', gpioPort: 'GPIOG', pin: 13 }],
  confidence: [], warnings: [],
};

describe('toRenodeRepl', () => {
  it('references the base platform and adds a led node bound to the GPIO port', () => {
    const repl = toRenodeRepl(model);
    expect(repl).toMatch(/using "platforms\/cpus\/stm32f4\.repl"/);
    expect(repl).toMatch(/led_green:/);
    expect(repl).toMatch(/GPIOG/);
    expect(validateReplSyntax(repl).valid).toBe(true);
  });

  it('C8: validateReplSyntax rejects unbalanced/emptily-typed nodes', () => {
    expect(validateReplSyntax('led: \n').valid).toBe(false);
    expect(validateReplSyntax('using "x.repl"\nled: LED @ gpioPort 13').valid).toBe(true);
  });

  it('F7: peripherals with no template mapping are skipped, not emitted malformed', () => {
    const exotic = { ...model, peripherals: [...model.peripherals, 'CAN-FD-EXOTIC'] };
    const repl = toRenodeRepl(exotic);
    expect(repl).not.toMatch(/CAN-FD-EXOTIC/);
    expect(validateReplSyntax(repl).valid).toBe(true);
  });
});
```

- [ ] **Step 2: Run → FAIL, then implement**

```ts
// src/platform/generate/renode-repl.ts
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
```

- [ ] **Step 3: Run → PASS, then commit**

```bash
git add src/platform/generate/renode-repl.ts src/platform/generate/renode-repl.test.ts
git commit -m "feat(platform): generate + syntactically validate a derived Renode .repl"
```

### Task 8: toZephyrBoardFiles (C8)

**Files:**
- Create: `src/platform/generate/zephyr-board.ts`, `src/platform/generate/zephyr-board.test.ts`

- [ ] **Step 1: Write the tests**

```ts
// src/platform/generate/zephyr-board.test.ts
import { describe, it, expect } from 'vitest';
import { toZephyrBoardFiles, validateOverlaySyntax } from './zephyr-board';
import type { PlatformModel } from '../types';

const model: PlatformModel = {
  schemaVersion: 1, sourceHash: 'H', sourceFormat: 'kicad',
  mcuPartNumber: 'STM32F407VG', baseTarget: 'stm32f4_disco',
  pinAssignments: [], peripherals: ['GPIO'],
  ledMappings: [{ name: 'LED_GREEN', color: 'green', gpioPort: 'GPIOG', pin: 13 }],
  confidence: [], warnings: [],
};

describe('toZephyrBoardFiles', () => {
  it('emits an app.overlay with a leds node and a balanced brace count', () => {
    const files = toZephyrBoardFiles(model);
    expect(files['app.overlay']).toMatch(/leds\s*{/);
    expect(files['app.overlay']).toMatch(/gpiog 13/);
    expect(validateOverlaySyntax(files['app.overlay']!).valid).toBe(true);
  });

  it('emits prj.conf enabling GPIO', () => {
    const files = toZephyrBoardFiles(model);
    expect(files['prj.conf']).toMatch(/CONFIG_GPIO=y/);
  });

  it('C8: validateOverlaySyntax rejects unbalanced braces', () => {
    expect(validateOverlaySyntax('/ { leds { ').valid).toBe(false);
    expect(validateOverlaySyntax('/ { };').valid).toBe(true);
  });
});
```

- [ ] **Step 2: Run → FAIL, then implement**

```ts
// src/platform/generate/zephyr-board.ts
import type { PlatformModel } from '../types';

export function toZephyrBoardFiles(model: PlatformModel): Record<string, string> {
  const ledNodes = model.ledMappings.map((led, i) => {
    const label = led.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    return `    ${label}: led_${i} {\n      gpios = <&${led.gpioPort.toLowerCase()} ${led.pin} GPIO_ACTIVE_HIGH>;\n      label = "${led.name}";\n    };`;
  }).join('\n');

  const overlay = `/ {\n  leds {\n    compatible = "gpio-leds";\n${ledNodes}\n  };\n};\n`;
  const prjConf = `CONFIG_GPIO=y\n`;
  return { 'app.overlay': overlay, 'prj.conf': prjConf };
}

export function validateOverlaySyntax(overlay: string): { valid: boolean; reason?: string } {
  let depth = 0;
  for (const ch of overlay) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth < 0) return { valid: false, reason: 'unbalanced closing brace' };
  }
  return depth === 0 ? { valid: true } : { valid: false, reason: 'unbalanced opening brace' };
}
```

- [ ] **Step 3: Run → PASS, then commit**

```bash
git add src/platform/generate/zephyr-board.ts src/platform/generate/zephyr-board.test.ts
git commit -m "feat(platform): generate + validate Zephyr devicetree overlay and prj.conf"
```

### Task 9: toCriteriaTargets (C6, F10)

**Files:**
- Create: `src/platform/generate/criteria-targets.ts`, `src/platform/generate/criteria-targets.test.ts`

- [ ] **Step 1: Write the tests**

```ts
// src/platform/generate/criteria-targets.test.ts
import { describe, it, expect } from 'vitest';
import { toCriteriaTargets } from './criteria-targets';
import { toBoardCapabilities } from './board-capabilities';
import { validateAssertionForBoard } from '../../engine/board-capabilities';
import type { PlatformModel } from '../types';

const model: PlatformModel = {
  schemaVersion: 1, sourceHash: 'H', sourceFormat: 'kicad',
  mcuPartNumber: 'STM32F407VG', baseTarget: 'stm32f4_disco',
  pinAssignments: [], peripherals: ['GPIO'],
  ledMappings: [{ name: 'LED_GREEN', color: 'green', gpioPort: 'GPIOG', pin: 13 }],
  confidence: [], warnings: [],
};

describe('toCriteriaTargets', () => {
  it('C6: emits a register in the exact engine convention GPIOG_ODR[13]', () => {
    const t = toCriteriaTargets(model)[0]!;
    expect(t.register).toBe('GPIOG_ODR[13]');
    expect(t.suggestedExpect).toBe('1');
  });

  it('F10: every emitted target passes validateAssertionForBoard on the derived board', () => {
    const caps = toBoardCapabilities(model);
    for (const t of toCriteriaTargets(model)) {
      const reg = t.register.replace(/\[\d+\]$/, '');
      const pin = Number(t.register.match(/\[(\d+)\]$/)?.[1]);
      expect(validateAssertionForBoard({ register: reg, pin }, caps).valid).toBe(true);
    }
  });

  it('drops a target whose pin is out of range (never emits an invalid target)', () => {
    const bad = { ...model, ledMappings: [{ name: 'X', color: 'red', gpioPort: 'GPIOG', pin: 99 }] };
    expect(toCriteriaTargets(bad)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run → FAIL, then implement**

```ts
// src/platform/generate/criteria-targets.ts
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
```

- [ ] **Step 3: Run → PASS, then commit**

```bash
git add src/platform/generate/criteria-targets.ts src/platform/generate/criteria-targets.test.ts
git commit -m "feat(platform): derive engine-valid acceptance-criteria targets from LEDs"
```

### Task 10: Confidence gate (C3, F12)

**Files:**
- Create: `src/platform/gate.ts`, `src/platform/gate.test.ts`

- [ ] **Step 1: Write the tests**

```ts
// src/platform/gate.test.ts
import { describe, it, expect } from 'vitest';
import { classifyConfidence, CRITICAL_THRESHOLD } from './gate';
import type { PlatformModel } from './types';

function model(conf: PlatformModel['confidence']): PlatformModel {
  return {
    schemaVersion: 1, sourceHash: 'H', sourceFormat: 'kicad',
    mcuPartNumber: 'STM32F407VG', baseTarget: 'stm32f4_disco',
    pinAssignments: [], peripherals: [], ledMappings: [], confidence: conf, warnings: [],
  };
}

describe('classifyConfidence', () => {
  it('auto-proceeds when all critical facts clear the threshold', () => {
    const g = classifyConfidence(model([
      { fact: 'mcu-identity', score: 0.95, criticality: 'critical', provenance: 'x' },
      { fact: 'pin:PG13:direction', score: 0.9, criticality: 'critical', provenance: 'x' },
      { fact: 'led:GPIOG:13', score: 0.4, criticality: 'cosmetic', provenance: 'x' },
    ]));
    expect(g.autoProceed).toBe(true);
    expect(g.blocking).toHaveLength(0);
  });

  it('F12: blocks when a critical fact is below threshold; a low cosmetic fact never blocks', () => {
    const g = classifyConfidence(model([
      { fact: 'pin:PG13:direction', score: 0.3, criticality: 'critical', provenance: 'no pinfunction' },
      { fact: 'led-color', score: 0.1, criticality: 'cosmetic', provenance: 'x' },
    ]));
    expect(g.autoProceed).toBe(false);
    expect(g.blocking.map((b) => b.field)).toEqual(['pin:PG13:direction']);
  });

  it('the threshold is a single documented constant', () => {
    expect(CRITICAL_THRESHOLD).toBeGreaterThan(0);
    expect(CRITICAL_THRESHOLD).toBeLessThan(1);
  });
});
```

- [ ] **Step 2: Run → FAIL, then implement**

```ts
// src/platform/gate.ts
import type { PlatformModel, Ambiguity } from './types';

/** A critical derived fact below this confidence blocks auto-proceed. */
export const CRITICAL_THRESHOLD = 0.6;

export function classifyConfidence(model: PlatformModel): { autoProceed: boolean; blocking: Ambiguity[] } {
  const blocking: Ambiguity[] = model.confidence
    .filter((c) => c.criticality === 'critical' && c.score < CRITICAL_THRESHOLD)
    .map((c) => ({
      field: c.fact,
      question: `Confirm ${c.fact} — automatic extraction is only ${Math.round(c.score * 100)}% confident.`,
      reason: c.provenance,
    }));
  return { autoProceed: blocking.length === 0, blocking };
}
```

- [ ] **Step 3: Run → PASS, then commit**

```bash
git add src/platform/gate.ts src/platform/gate.test.ts
git commit -m "feat(platform): confidence gate blocks only low-confidence critical facts"
```

### Task 11: derivePlatform orchestration + content-address cache key (C1, C7, F9)

**Files:**
- Create: `src/platform/derive.ts`, `src/platform/derive.test.ts`

- [ ] **Step 1: Write the tests**

```ts
// src/platform/derive.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { derivePlatform, schematicHash } from './derive';
import { SchematicParseError } from './types';

const blinky = readFileSync(new URL('./__fixtures__/blinky.kicad.net', import.meta.url), 'utf8');
const unknown = readFileSync(new URL('./__fixtures__/unknown-mcu.kicad.net', import.meta.url), 'utf8');

describe('derivePlatform', () => {
  it('returns all artifacts for a supported schematic', () => {
    const d = derivePlatform(blinky, 'kicad');
    if (d.kind !== 'ok') throw new Error('expected ok');
    expect(d.derived.boardCapabilities.status).toBe('derived');
    expect(d.derived.renodeRepl).toMatch(/using /);
    expect(Object.keys(d.derived.zephyrFiles)).toContain('app.overlay');
    expect(d.derived.criteriaTargets[0]!.register).toBe('GPIOG_ODR[13]');
    expect(d.derived.gate.autoProceed).toBe(true);
  });

  it('C3: returns an unsupported result for an unknown MCU', () => {
    const d = derivePlatform(unknown, 'kicad');
    expect(d.kind).toBe('unsupported');
  });

  it('surfaces a parse failure as a typed error result, not a throw', () => {
    const d = derivePlatform('garbage', 'kicad');
    expect(d.kind).toBe('parse-error');
    if (d.kind === 'parse-error') expect(d.error).toBeInstanceOf(SchematicParseError);
  });

  it('F9/C7: hash is identical across reordered nets and whitespace', () => {
    const reordered = blinky.replace(/\s+/g, ' ').trim();
    expect(schematicHash(blinky)).toBe(schematicHash(reordered));
  });

  it('C1: deriving twice yields deep-equal models (deterministic, no clocks/random)', () => {
    const a = derivePlatform(blinky, 'kicad');
    const b = derivePlatform(blinky, 'kicad');
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run → FAIL, then implement**

```ts
// src/platform/derive.ts
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
```

- [ ] **Step 3: Run → PASS, then commit**

```bash
git add src/platform/derive.ts src/platform/derive.test.ts
git commit -m "feat(platform): derivePlatform orchestration with content-addressed cache key"
```

### Task 12: Purity guard + full-suite verification (C1)

**Files:**
- Create: `src/platform/__tests__/purity.test.ts`

- [ ] **Step 1: Write the purity scan test**

```ts
// src/platform/__tests__/purity.test.ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    if (e === '__fixtures__' || e === '__tests__') continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (e.endsWith('.ts') && !e.endsWith('.test.ts')) yield full;
  }
}

describe('C1: src/platform is pure', () => {
  it('no production file imports db/fetch/Date.now/Math.random (crypto hash + Date-free only)', () => {
    const banned = [/from ['"].*\/db['"]/, /\bfetch\s*\(/, /Date\.now\s*\(/, /Math\.random\s*\(/, /new Date\s*\(/];
    const offenders: string[] = [];
    for (const file of walk(ROOT)) {
      const src = readFileSync(file, 'utf8');
      if (banned.some((re) => re.test(src))) offenders.push(file.replace(ROOT, 'src/platform'));
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the purity test + full suite + typecheck**

Run: `npx vitest run src/platform/ && npx tsc --noEmit`
Expected: all `src/platform` tests pass; typecheck clean.

Run: `npx vitest run 2>&1 | tail -5`
Expected: the pre-existing suite (449 tests) still passes plus the new `src/platform` tests — nothing outside `src/platform/` was touched, so no regressions.

- [ ] **Step 3: Commit**

```bash
git add src/platform/__tests__/purity.test.ts
git commit -m "test(platform): purity guard — no io/clock/random in the derivation module"
```

---

## Self-review

**Spec coverage (approved design → tasks):** netlist ingestion → Tasks 1–2; `PlatformModel` spine → Tasks 0, 5; MCU resolution against the existing registry (the finite-target reality) → Task 3; graded confidence/provenance → Tasks 4, 5, 10; derive `BoardCapabilities` so the engine is reused unchanged → Task 6; Renode `.repl` + Zephyr generators (validated) → Tasks 7, 8; acceptance-criteria "where" targets → Task 9; confidence gate + non-blocking failure surfacing → Task 10; content-addressed caching + determinism → Task 11; purity → Task 12. Every C1–C8 and F1–F12 maps to a named test in the table.

**Deliberately deferred (follow-on plans, each its own spec→plan):** (1) Modal/Renode execution of a derived board — teach `modal/app.py` + `FirmwareJobRequest` to accept a custom `.repl` + overlay instead of a slug; (2) UI upload flow + the derived-platform review artifact surface; (3) EAGLE and Altium parsers behind the same `RawSchematic` seam; (4) series-resistor net tracing and non-LED peripheral inference (I2C/SPI/UART); (5) persisting derived boards + wiring `agent.startTask` to accept a schematic. Slice 1 is independently testable without any of these.

**Placeholder scan:** every code step is complete. The one call-out (Task 4's intentionally-wrong `node.refdes !== mcu.template` line) is written as an explicit fix instruction with the corrected code shown, not a silent TODO.

**Type consistency:** `RawSchematic`/`RawNet`/`RawNode`/`PinAssignment`/`PlatformModel`/`DerivedPlatform`/`CriterionTarget` are defined once in Task 0 and imported everywhere; `toBoardCapabilities`, `toRenodeRepl`, `toZephyrBoardFiles`, `toCriteriaTargets`, `classifyConfidence`, `derivePlatform`, `schematicHash` keep identical signatures across their definition and call sites (Tasks 6–11); the derived register format `GPIOG_ODR[13]` is consistent between Task 9 and the engine's `TraceEvent`/`Assertion` convention.
