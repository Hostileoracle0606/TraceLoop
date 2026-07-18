# 05 — Neo4j persistence of the trace graph

**What to build:** Persist the trace graph in Neo4j (reusing GraphMind patterns) so the causal graph is a real, queryable graph rather than only an in-memory structure inside the engine — and so the causal chain can be produced by a graph query. An in-memory graph is acceptable for the first end-to-end (tickets 01/03); this ticket makes the "graph-relational" claim real and is a demo flex in its own right.

**Blocked by:** 01 (engine builds the graph the persistence layer stores).

**Status:** ready-for-agent

- [ ] Trace events and causal edges are written to Neo4j as typed nodes (Observed / Derived / Violated), edges interrupt → handler → register-write → downstream effect.
- [ ] The causal chain for the failure is retrievable via a graph query (not only in-memory traversal).
- [ ] The graph view's data can be sourced from Neo4j through the run view-model.
