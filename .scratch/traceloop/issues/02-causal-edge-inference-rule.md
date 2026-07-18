# 02 — What rule infers a causal edge between two trace events?

Type: grilling
Status: open
Blocked by: 01

## Question

The analyzer's correctness hinges on how "event A caused event B" is decided when building the graph. Options, roughly in increasing fidelity: (a) pure temporal adjacency within the same context; (b) temporal + data dependency — B read a register/address that A last wrote; (c) explicit control-flow instrumentation — interrupt → its handler → the writes inside that handler.

The demo needs at least: interrupt-fire → handler-entry → register/GPIO-write inside the handler → assertion. Decide the minimal rule that reliably reconstructs *that* chain, and what an edge is labelled (Observed vs Derived). Blocked by ticket 01 because the achievable rule depends on which event granularity Renode actually gives us.

**Resolves:** the graph-construction logic in build ticket `causal-debugger/01` and the meaning of a Derived edge.
