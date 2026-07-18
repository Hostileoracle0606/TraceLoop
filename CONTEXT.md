# TraceLoop

An agentic firmware IDE ("Cursor for firmware"): an AI agent authors Zephyr firmware, builds and simulates it on a board (Renode), and uses a causal engine — which walks a recorded trace graph backward from a failed test to a root cause — as the debug feedback loop. See `docs/adr/0001`.

## Language

**Root cause**:
The single event TraceLoop blames for a failed assertion. Either the observed event whose register/value diverges from what the assertion expected (a **divergence**), or — when nothing diverges and the fault is an absence — the last event that actually occurred along the **expected path** before it should have led to the missing write.
_Avoid_: trigger, culprit

**Divergence**:
An observed event whose register or value contradicts what a test assertion expected — e.g. a write landing on the wrong GPIO pin, or the right pin with the wrong value. The default, narrower root-cause case.
_Avoid_: anomaly, mismatch

**Missing-write failure**:
An assertion failure where the expected write never happened at all — no event diverges, one is simply absent. Attributed to the last event on the expected path, not to a divergent event (there isn't one).
_Avoid_: silent failure, no-op

**Expected path**:
The sequence of events that should occur, in order, for a given assertion to be satisfied (e.g. interrupt pending → handler entered → register written). Used only to attribute a root cause for a missing-write failure — divergence failures don't need one, the divergent event already answers "why."
_Avoid_: happy path, golden path (those imply a passing run generally, not this specific per-assertion sequence)

**Substrate**:
The firmware base the agent authors against — **Zephyr** (see `docs/adr/0002`). Determines the APIs the agent writes (`gpio_pin_set_dt`, device tree) and how firmware builds and runs.
_Avoid_: platform, framework

**Authoring loop**:
The agent's inner loop for developing firmware: write → build → simulate (Renode) → test → causal-explain → patch → re-simulate, until the test passes. The core interaction of TraceLoop-as-IDE.
_Avoid_: agent flow, pipeline

**Producer**:
A source of trace events that emits the normalized event stream the engine consumes — a synthetic fixture, or the Renode parser over a real run. The engine is producer-agnostic (see `docs/adr/0003`).
_Avoid_: adapter, driver, source
