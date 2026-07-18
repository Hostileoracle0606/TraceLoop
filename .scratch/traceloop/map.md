# TraceLoop — Wayfinder Map

`wayfinder:map`

## Destination

**TraceLoop = an agentic firmware IDE ("Cursor for firmware").** An AI agent authors **Zephyr** firmware, builds it, simulates it on a board in **Renode**, tests it, and uses the causal engine as the debug feedback loop to fix it — the **authoring loop**. The hackathon demo closes that loop end-to-end: agent writes firmware from a prompt → build → simulate → test → causal-explain → patch → passes. The causal debugger (tickets 01–04, done) is one capability inside the loop. See `docs/adr/0001`–`0003`. QNX is scrapped.

## Notes

- **Domain:** solo firmware-debugging hackathon build (Hack the 6ix, 2026-07-17 → 07-19). Also a proof-of-competence artifact for the Simantic (YC F26) founder interview — frame as exploring the same problem, not as having seen their internals.
- **Skills to consult each session:** `/grilling` + `/domain-modeling` for decision tickets; `/research` for research tickets; `/prototype` when "how should it behave" is the question. Use `/handoff` to compact each session for the next — 36h will exceed one context window.
- **Companion artifacts:** the spec is at `.scratch/causal-debugger/spec.md`; the build plan (execution tickets) is at `.scratch/causal-debugger/issues/`. This map navigates the *decisions* that gate that build; it does not duplicate the build tickets.
- **Execution override:** OFF. This map plans (produces decisions); it does not build. Building happens via the `causal-debugger` tickets.

## Decisions so far

<!-- index of closed decision tickets: one line each, gist + link -->

_(Seeded from the spec — decisions already locked before charting began:)_

- **Issue tracker** — local markdown under `.scratch/`; no GitHub round-trips. (`docs/agents/issue-tracker.md`)
- **The single seam** — a producer-agnostic normalized trace-event stream; the causal analyzer consumes only this, so Renode and fixtures are interchangeable producers. (spec, `docs/adr/0003`)
- **Node taxonomy** — Observed / Derived / Violated, driving the shared color language across all three views. (spec)
- **Analysis is deterministic** — backward graph walk computes the causal chain; the LLM only narrates it, never selects the root cause. (spec)
- **Graph store** — Neo4j, reusing existing GraphMind patterns. (spec)
- **Demo scenario** — green LED (GPIO pin 12) asserted ON by 2000µs; Timer2 ISR wrongly writes pin 13 (orange) at ~1004µs; assertion violated, confidence ~0.99. (spec, RUN-1042)
- **Frontend** — the existing [TraceLoop dashboard](https://traceloop-firmware-debugger.tsgoswam.chatgpt.site) is reused as-is (source dropped into the repo), not redesigned. Chrome stays static; three views + root-cause + Generate-patch get wired. (spec)
- **Second seam — run view-model** — the dashboard renders one JSON view-model (run metadata + typed events `e1..eN` + peripheral snapshots + causal chain + confidence); the engine's job is to emit it. Frontend and engine build in parallel against this schema. (spec)
- **Renode trace extraction — feasible (risk HIGH→LOW-MED)** — `LogPeripheralAccess` gives register/GPIO/NVIC writes with names+values; `CreateExecutionTracing` + `LoadELF` gives PC/handler-entry; register hooks emit structured events (fallback: parse logs); virtual-time timestamps; driven via Robot/`.resc`. Every `TraceEvent` field is populatable from a real STM32F4 run. ([traceloop/01](issues/01-renode-trace-extraction.md))
- **Confidence score — dropped** — out of scope; the chain + plain-language explanation stand alone. Static chip stays in the UI. ([traceloop/04](issues/04-confidence-score-definition.md))
- **Demo firmware — built** — hand-written bare-metal STM32F407 C (`firmware/`), compiled to ELF, runs headless in Renode v1.16.1 (portable macOS .app, no sudo). Real trace captured → `renode-parser.ts` → engine. ([traceloop/03](issues/03-demo-firmware-source.md))
- **DESTINATION REDRAWN → agentic firmware IDE** — TraceLoop is "Cursor for firmware": agent authors → builds → simulates (Renode) → tests → causal-explains → fixes. The causal debugger (01–04) is one capability inside the loop. (`docs/adr/0001`)
- **Substrate = Zephyr** — the agent authors Zephyr apps (matches the mockup's `gpio_pin_set_dt`, LLM-friendly, OSS, first-class Renode support). Bare-metal (ticket 04) is superseded; **QNX scrapped** (kernel not OSS, doesn't run in Renode, kernel-event model mismatch). (`docs/adr/0002`)

## Not yet specified

<!-- in-scope fog: real but not yet sharp enough to ticket; graduates as the frontier advances -->

- **Voice-layer stack** — which STT/TTS pipeline (Lumen reuse?), and how the spoken question resolves to the failure query. Stays fog until the deterministic answer (build ticket 01) exists to speak.
- **Patch-generation strategy** — how a proposed fix is derived from a resolved causal chain. Fog until root-cause works end to end.
- **Multi-scenario story** — whether the demo shows more than the one Timer2 fault. Likely not for 36h, but revisit if time remains.

## Out of scope

<!-- ruled beyond the destination; never graduates unless the destination is redrawn -->

- QNX (any form) — scrapped; kernel isn't OSS, doesn't run in Renode, event model doesn't fit the dashboard. See `docs/adr/0002`.
- Real / silicon-accurate hardware simulation.
- Multiple targets or boards beyond the single STM32F4 scenario.
- Auth, multi-user, durable persistence beyond a demo run.
- **Confidence score** — dropped; the causal chain + root-cause explanation stand on their own. The mockup's confidence chip stays as static UI. (was `traceloop/04`)
