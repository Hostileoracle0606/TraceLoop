# TraceLoop is an agentic firmware IDE, not only a causal debugger

We began building a causal firmware *debugger* (explain *why* a test failed). During a grilling session we redrew the destination: TraceLoop is "Cursor for firmware" — an agentic IDE where an AI agent **authors** firmware, **builds** it, **simulates** it on a board (Renode), **tests** it, and uses the causal engine as the debug feedback loop to **fix** it. The causal debugger becomes one capability inside the loop, not the whole product.

Why: the reused dashboard was already designed as a full platform (Agent workspace, Code editor, board picker, Patch review) — only the failure-analysis view was wired. And the sharper, more Simantic-aligned thesis is *an agent developing firmware against simulation without hardware*, not a standalone post-mortem tool.

## Consequences

- The demo target is the **authoring loop** (agent writes firmware from a prompt → build → sim → test → debug → fix), not just a rendered failure.
- The MCP/agent interface (`causal-debugger/06`) moves from "nice-to-have" to the spine of the product.
