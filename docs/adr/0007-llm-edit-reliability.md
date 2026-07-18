# LLM edit reliability: AI SDK + search/replace edits now; a coding-agent harness only as a contained tool later

**Decision.** Keep the Vercel AI SDK (ADR-0006) as the agent loop. For reliability, adopt **search/replace block** edits (Aider's proven format) with an *apply-or-reflect-and-retry* cycle, and validate every model output with Zod + policy (`isProtectedFile`, plan-scope, no path traversal, confidence bounds). **Do not fork an open-source coding-agent harness (Aider / SWE-agent / OpenHands) as the orchestrator.**

**Why not fork the harness as the loop.** Mature harnesses *own the loop*: one process, local filesystem + shell + git, single-user, autonomous, and (Aider/SWE-agent/OpenHands) Python. TraceLoop's control plane is the inverse — a **durable, restart-safe Inngest pipeline**, **per-tenant isolated Modal jobs**, **human-in-the-loop approval gates**, **resource budgets**, and **TypeScript**. Embedding a harness that owns control flow into that fights the architecture, and none of them provide the durability/permission/multi-tenant machinery we still have to keep. The reliability we actually want lives at the **edit-application layer** — obtainable via the search/replace format + retry technique in our own stack — not by adopting a foreign orchestrator. The firmware feedback signal is also a *causal-engine root cause*, not a stack trace, so a generic harness would need adapting regardless.

**The escape hatch.** If autonomous multi-file editing later becomes the bottleneck, wrap **Aider or SWE-agent as a sandboxed *editor tool*** behind the existing Modal/MCP seam — given a repo + the causal root cause, it returns a diff. It becomes a tool the pipeline *calls*, never the loop that calls us; the TS/Python boundary becomes a subprocess boundary. This aligns with exposing domain verbs (`build`, `simulate`, `get_causal_chain`, `propose_patch`, `apply_patch`) over MCP.

## Considered and rejected
- **Fork OpenHands** — heaviest impedance mismatch (owns runtime + loop). No.
- **Fork Aider/SWE-agent as orchestrator** — Python, single-user/autonomous, assumes local git/shell; borrow the *edit format*, don't adopt the *loop*.
- **Bespoke freeform-JSON file ops** (current code) — unreliable to apply; superseded by search/replace + validation.

## Consequences
- Tasks that generate edits (`agent.edit`, `proposePatch`, the patch loop) use the search/replace format + validation. `backend/llm/validate.ts` is the enforcement point.
- An optional future "editor-as-a-Modal-tool" is documented but not built now.
