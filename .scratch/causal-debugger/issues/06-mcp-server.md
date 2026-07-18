# 06 — MCP server for agent-driven control

**What to build:** An AI agent can drive the whole system through an MCP server exposing `step`, `get_register_state`, `inject_fault`, and `get_causal_chain` — mirroring the interface shape Simantic uses — so the failure and its causal explanation are reachable programmatically, not just through the UI.

**Blocked by:** 04 (live sim + engine on real traces).

**Status:** ready-for-agent

- [ ] MCP server exposes `step`, `get_register_state`, `inject_fault`, and `get_causal_chain`.
- [ ] An agent can inject the Timer2 fault and step the simulation through the server.
- [ ] `get_causal_chain` returns the same deterministic chain (as run view-model) the engine produces for the UI.
