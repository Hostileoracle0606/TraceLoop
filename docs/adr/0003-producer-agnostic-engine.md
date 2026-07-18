# The causal engine consumes a normalized trace-event stream, never a producer directly

`analyze()` takes `TraceEvent[]` and knows nothing about where the events came from. **Producers** sit behind this single seam: a synthetic fixture, or `renode-parser` reading a real Renode log. The engine is producer-agnostic.

Why: this let the same tested engine analyze a real Renode trace with zero changes, and it makes swapping the firmware substrate (bare-metal → Zephyr) a *producer-side* change, not an engine rewrite. This is the load-bearing architectural decision — the frontend consumes a matching `run view-model` seam on the other side, so engine and dashboard were built from opposite ends against agreed contracts.
