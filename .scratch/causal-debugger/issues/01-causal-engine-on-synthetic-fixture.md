# 01 — Causal engine on a synthetic fixture → run view-model

**What to build:** A developer can run the causal analyzer against a hand-written synthetic trace-event sequence (the Timer2 wrong-pin scenario, with a known correct answer) and get back the causal chain, serialized as the **run view-model** the dashboard consumes — with no emulator and no database required. This is the deterministic core and the single backend test seam; ticket 02 builds the matching frontend against the same view-model.

**Blocked by:** None — can start immediately. (Backend half of the parallel frontier with 02.)

**Status:** done (peripheral-snapshot passthrough deferred to ticket 03 wiring)

- [x] A normalized trace-event schema exists (step index/timestamp, event type, source, target, value, label, lane) and is documented.
- [x] Given a synthetic fixture with the planted fault, the analyzer returns the correct root event and the ordered path to the Violated node.
- [x] Serializes to the run view-model — typed events (`e1..eN`) + taxonomy + causal chain + plain-language root-cause text + `toDashboardRun()` producing the dashboard's exact `events` map (`observed|derived|failed`) and run header. Peripheral-snapshot passthrough finalizes with ticket 03.
- [x] Scenario locked to the mockup's RUN-1042: green LED = GPIO port G pin 12 (asserted ON by 2000µs); `timer_isr` wrongly writes pin 13 (orange) at ~1004µs; pin-13 write + interrupt/handler events are **Observed**, "orange LED on" is **Derived**, the green-LED assertion is **Violated**.
- [x] Tests assert on the causal-chain / view-model result (external behavior), not internal node ids, graph internals, or query strings.
- [x] Analysis is deterministic: the same fixture yields the same chain on every run.

_Confidence score dropped from scope (see wayfinder `traceloop/04`)._
