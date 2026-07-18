# 05 — Does the MCP server drive Renode live, or replay a recorded trace?

Type: prototype
Status: open
Blocked by: 01

## Question

The MCP server (build ticket `causal-debugger/06`) exposes `step`, `get_register_state`, `inject_fault`, `get_causal_chain`. Decide whether these operate on a *live* Renode session (step actually advances the emulator, inject_fault mutates running state) or on a *recorded* trace already ingested into the graph (step walks the stored event sequence). Live is truer to Simantic's shape but couples the MCP layer to Renode's control API; replay is simpler and enough for the demo. A cheap stub of each tool's response shape would settle it.

**Resolves:** the interface contract and backing model for build ticket `causal-debugger/06`. Blocked by ticket 01 because a live-driving server depends on what Renode control surface is available.
