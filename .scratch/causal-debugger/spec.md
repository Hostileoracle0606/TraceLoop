# Spec: TraceLoop — Causal Firmware Debugger

Status: ready-for-agent

> Synthesized from the Hack the 6ix brainstorm (2026-07-17). Solo build, ~36h. Doubles as a proof-of-competence artifact for the Simantic (YC F26) founder interview. Frame as *exploring the same problem they solve*, not as having seen their internals.

> **Redrawn 2026-07-17:** the destination is now an agentic firmware IDE ("Cursor for firmware") on a **Zephyr** substrate — an agent authors → builds → simulates in Renode → tests → causal-explains → fixes firmware in a loop, not a standalone debugger. QNX is scrapped. See `docs/adr/0001`–`0003`. The causal engine below is one capability inside that loop.

## Problem Statement

When a firmware test fails, existing simulation tooling tells you **that** it failed and often **where** it stopped — a flagged line, a wrong register, a failed assertion. It does not tell you **why**: which interrupt, peripheral event, or register write several steps earlier actually *caused* the wrong final state. A firmware developer staring at "expected GPIO pin 12 high, got pin 13 high" still has to manually reconstruct the causal story — walk backwards through interrupts, handlers, and register writes to find the origin. That reconstruction is slow, error-prone, and is the part a human (or an AI agent) most wants help with.

## Solution

TraceLoop runs a firmware target under emulation, records every state transition as a causal graph while it executes, and — when a test fails — walks **backwards** from the failure to produce a plain-language root-cause explanation. The developer asks "why did this test fail?" and gets: *"Timer2's interrupt handler wrote GPIO pin 13; the test expected pin 12. The wrong pin was written at handler entry, 3 events before the assertion failed."*

The same recorded trace drives three synchronized views — **timeline (when), causal graph (why), board (where on the physical layout)** — sharing one color language. These views are **not designed from scratch**: TraceLoop's UI *is* the existing [TraceLoop dashboard](https://traceloop-firmware-debugger.tsgoswam.chatgpt.site), reused as-is and wired to live data. A thin voice layer lets the developer ask the "why" question out loud and hear the answer. The causal analysis is **deterministic** (graph traversal over observed facts); the LLM only *narrates* the already-computed chain, it does not guess it.

## User Stories

1. As a firmware developer, I want to run a firmware target in emulation without physical hardware, so that I can debug on a laptop at a hackathon table.
2. As a firmware developer, I want every state transition (interrupt fired, handler entered, register written, GPIO changed) recorded as I run, so that a complete causal history exists to query after a failure.
3. As a firmware developer, I want a test to assert on final hardware state (e.g. "GPIO pin 12 is high"), so that a wrong outcome is detected automatically.
4. As a firmware developer, when a test fails I want the tool to identify the single earliest event that caused the wrong outcome, so that I don't have to manually trace backwards through the run.
5. As a firmware developer, I want the root cause explained in plain language, so that I understand the failure without reading raw register dumps.
6. As a firmware developer, I want the causal chain from root cause to failure shown as an ordered path, so that I can verify the tool's reasoning step by step.
7. ~~As a firmware developer, I want a confidence score attached to the causal chain, so that I know how much to trust the explanation.~~ *(dropped — out of scope)*
8. As a firmware developer, I want to trust that the analysis is deterministic (not an LLM guess), so that the same trace always yields the same root cause.
9. As a firmware developer, I want to see the trace on a timeline, so that I understand *when* each event happened relative to the failure.
10. As a firmware developer, I want to see the trace as a causal graph, so that I understand *why* — which events led to which.
11. As a firmware developer, I want to see the trace mapped onto a picture of the board, so that I understand *where* physically the fault manifested (e.g. the wrong LED lighting).
12. As a firmware developer, I want the three views to share one color language (normal vs. the event that broke), so that I can move between "when / why / where" without re-orienting.
13. As a firmware developer, I want each event classified as Observed, Derived, or Violated, so that I can distinguish raw trace facts from inferred conclusions and the specific broken expectation.
14. As a firmware developer, I want to ask "why did this test fail?" by voice and hear the answer, so that the demo reads instantly to someone watching.
15. As an AI coding agent, I want to drive the simulator through a tool interface (`step`, `get_register_state`, `inject_fault`), so that I can inspect and manipulate simulated hardware state programmatically.
16. As an AI coding agent, I want to request the causal chain for a failure over the same interface, so that I can act on the root cause (e.g. propose a fix) rather than just the symptom.
17. As a firmware developer, I want to inject a known fault (e.g. wrong pin write) deterministically, so that I can reproduce the demo scenario every run.
18. As a firmware developer, I want the trace-event format to be producer-agnostic, so that the same analyzer works whether events come from the live emulator or a synthetic fixture.
19. As a hackathon judge with no firmware background, I want the failure and its cause to be visually obvious (wrong LED lights, one node turns red), so that I grasp the value in seconds.
20. As the developer preparing for the Simantic interview, I want the tool to sit one layer beyond "detect the regression" (explain its causal story), so that it signals I understood where their next hard problem is.
21. As a firmware developer, I want a clear "normal run" baseline alongside the failing run, so that the contrast makes the fault legible.
22. As a firmware developer, I want the analysis to complete fast enough to feel live in a demo, so that there's no awkward wait between the question and the answer.
23. As a firmware developer (stretch), I want the tool to propose a patch for the root cause, so that I go from explanation to fix in one step.
24. As a firmware developer, I want an AI agent to author, build, simulate, and fix Zephyr firmware in a loop, so that I can develop firmware against a simulated board without physical hardware.

## Implementation Decisions

**Trace source (live demo).** Use **Renode** as the emulator for the live demo, targeting an **STM32F4 Discovery** board. The canonical demo scenario (as encoded in the dashboard's RUN-1042): the test asserts **green LED (GPIO port G, pin 12) ON by the 2000µs deadline**, but **Timer2's interrupt handler (`timer_isr`) writes GPIO pin 13** — the orange LED — at ~1004µs, so the green LED never lights and the assertion is violated. In the taxonomy: the pin-13 write and the preceding interrupt/handler-entry events are **Observed**, "orange LED on" is **Derived**, and the green-LED assertion is the **Violated** node. This scenario is chosen because it is simpler to build than a race condition and the wrong-vs-expected LED contrast reads instantly to a non-technical judge.

**The single seam — normalized trace-event stream.** Define one producer-agnostic event schema that is the boundary between *producers* and the *causal analyzer*. Producers: Renode (live, from a Zephyr build), synthetic fixtures (tests). The analyzer consumes only this stream, so it never knows or cares where events came from. Each event carries at least: a monotonic step index / timestamp, an event type (e.g. `interrupt`, `handler-entry`, `register-write`, `gpio-write`, `mem-access`, `assertion`), the source (peripheral / ISR / instruction), the target (register / pin / address), a value, and — where known — a reference to the immediately-causing event. Only the Renode and fixture producers exist.

**Graph store — Neo4j.** Every trace event becomes a node; causal relationships become edges (`interrupt → handler → register-write → downstream-effect`). This reuses the developer's existing GraphMind Neo4j/graph-relational patterns, so it is not new ground.

**Node taxonomy — Observed / Derived / Violated.** `Observed` = facts taken directly from the trace. `Derived` = conclusions the analyzer inferred by traversal. `Violated` = the specific expectation/assertion that broke. This taxonomy (cleaner than a plain normal/broken split) drives the shared color language across all three views.

**Causal analyzer — deterministic backward walk.** On failure, start at the `Violated` node and walk backward along causal edges to the earliest `Observed` event that necessitated the wrong state. Output: an ordered causal chain (root → violation) plus a **confidence score**. This computation is **deterministic graph analysis**, stated explicitly as such. An LLM is used *only* to render the already-computed chain into a plain-language sentence — it does not select the root cause.

**MCP server.** Wrap the simulator control surface in a minimal MCP server exposing `step`, `get_register_state`, and `inject_fault`, mirroring the interface shape Simantic already uses, plus a call to retrieve the causal chain for a failure. This is how an AI agent (and, under the hood, the demo) drives the system uniformly.

**Frontend — the existing TraceLoop dashboard, reused.** The UI is not built from scratch. The [TraceLoop dashboard mockup](https://traceloop-firmware-debugger.tsgoswam.chatgpt.site) — a three-column layout (filter rail | timeline | board + causal graph) with a root-cause narrative and a Generate-patch action — is dropped into the repo as the shipping frontend and wired to live data. Its chrome (top nav, runs list, filter rail) may stay static; the demo-critical surface is the three views + root-cause + Generate-patch.

**The run view-model — the second seam.** The dashboard renders a single JSON **run view-model**: run metadata (id, commit, board, Renode version, virtual time, event count), the typed event list (`e1..eN`, each with timestamp, source, target, value, taxonomy class, and causing-event refs), peripheral-state snapshots, and the ordered causal chain. This is the frontend-facing seam, mirroring the backend trace-event seam: the engine's job is to **emit this view-model**, and the dashboard renders whatever conforms to it. The mockup's hardcoded RUN-1042 data is the first fixture of this schema. The three views (timeline / board / causal graph) all read from this one view-model, keyed on the node taxonomy for color.

**Voice layer (thin).** A Lumen-style speech layer: spoken question → resolve to a query over the graph → spoken answer. Treated as demo garnish on top of the deterministic core, not part of it.

## Testing Decisions

**Test at the single highest seam — the causal analyzer's public entry point.** The one test seam is the analyzer function that takes a normalized trace-event stream and returns a causal-chain result. Feed it a **synthetic event sequence with a planted fault and a known correct root cause**, and assert the returned chain names the correct root event, the correct ordered path to the `Violated` node, and the expected confidence bucket. Because the seam is producer-agnostic, these tests hold whether events come from Renode or a fixture — and they run without booting the emulator or standing up graph infrastructure.

**Test external behavior only.** Assert on the *shape and content of the causal chain* (root cause, path, confidence), never on internal node IDs, Neo4j query strings, or traversal bookkeeping — those are implementation details free to change.

**What to actually TDD vs. eyeball.** Only the causal-analysis stage earns real TDD (a few sharp tests against synthetic sequences with known answers). Renode wiring, the reused dashboard, the MCP transport, and the voice layer are verified by eye during the demo build and swept at the end with `/code-review`; they are not the correctness-critical core.

**Frontend seam — develop against a static fixture.** The dashboard is exercised against a hand-authored **run view-model** JSON fixture (the mockup's RUN-1042 data, promoted to a file) before the engine emits it live. This lets the frontend wiring and the engine's view-model output be built in parallel and meet at an agreed schema, and keeps a swap-the-JSON smoke check for the UI.

**Prior art.** No in-repo prior art yet (greenfield). The closest conceptual prior art is the graph-query testing approach from the developer's GraphMind project — testing traversal logic against a seeded graph with known structure.

## Out of Scope

- **"Generate patch" action** — proposing a fix for the root cause. Stretch goal, only after the causal chain works end to end.
- **QNX (any form)** — scrapped entirely, not even a roadmap producer. Its kernel isn't open-source, it doesn't run in Renode, and its kernel-event model doesn't fit the GPIO dashboard. See `docs/adr/0002`.
- **Voice beyond one hardcoded query path** — a single "why did this test fail?" flow is enough for the demo; general spoken Q&A over the graph is stretch.
- **Silicon-accurate simulation / real hardware** — the target is behavioral, driven through Renode; no physical board.
- **Multiple targets or scenarios** — one STM32F4 wrong-LED scenario is the demo; generalizing across boards/faults is out.
- **Auth, multi-user, durable persistence beyond the demo run.**
- **Confidence score** — the causal chain and root-cause explanation stand on their own; the reused dashboard's confidence chip remains static UI.

## Further Notes

- **Context / constraints:** Solo developer, ~36 hours, Hack the 6ix (July 17–19, 2026). No hardware or additional engineers. Leans on the developer's two most proven strengths: GraphMind (Neo4j/causal graph) and Lumen (sub-600ms voice).
- **Positioning for Simantic:** The project deliberately sits in Simantic's problem space (firmware visibility for humans + AI agents without physical hardware) and pushes one layer past "flag the regression" to "explain its causal story." A close alternate framing is "the next version of their GitHub Actions bot — a comment that explains the causal story between two runs, not just that a test regressed." Frame honestly as exploring the same problem, not as having seen their internals.
- **Build order:** Get an ugly end-to-end pipeline (trace → graph → answer) working in the first 6–8 hours before any polish. Solo with no one to catch the last stretch, a late UI scramble is the biggest risk.
- **Session continuity:** 36 hours will exceed one context window. Use `wayfinder` for a persistent investigation map and `/handoff` to compact each session for the next. This is the real unlock for solo multi-session work.
- **Sponsor/track caveat:** Verify current tracks and sponsors at the event (last year QNX's challenge accepted software-only entries and the voice-agent prize was sponsored by Ribbon, not ElevenLabs — sponsors shift year to year).
- **Frontend (reused, not reference):** https://traceloop-firmware-debugger.tsgoswam.chatgpt.site is **the** frontend for this project, not just inspiration. Its source is dropped into the repo and wired to the run view-model. It defines the exact UI, the Observed/Derived/Violated taxonomy, the ~0.99 confidence display, the RUN-1042 scenario data (green pin 12 asserted, orange pin 13 wrongly written at ~1004µs), and the Generate-patch action.
