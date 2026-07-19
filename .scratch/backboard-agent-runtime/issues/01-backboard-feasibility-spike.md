# 01 — Backboard feasibility and contract spike

Status: ready-for-agent

Blocked by: None

## What to establish

Verify the current Backboard API against the exact behavior TraceLoop needs before changing the production runtime. This is an isolated spike with no production default change and no model-authored side effects.

Create the findings report at `.scratch/backboard-agent-runtime/backboard-feasibility-report.md`.

## Scope

- Create, retrieve, continue, list, cancel, and delete task threads.
- Create/reconcile one assistant and multiple task threads.
- Exercise `REQUIRES_ACTION`, JSON argument parsing, tool-result submission, chained tool calls, parallel tool calls, streaming, and cancellation.
- Test the proposed tools: clarification, task contract, plan, file operations, patch, and blocker.
- Verify explicit memory add/search/update/delete, `Readonly`, `off`, asynchronous operation status, assistant isolation, and deletion.
- Verify assistant- and thread-scoped document upload, indexing, retrieval timing, failure, and deletion.
- Verify model pinning, tool/JSON capability discovery, usage, cost, latency, rate limits, timeouts, malformed responses, and provider errors.
- Simulate response loss after remote success and determine how assistants, threads, messages, tool calls, and memories can be reconciled.
- Record stable external identifiers and metadata/search facilities.

## Safety constraints

- Use isolated, clearly named spike resources.
- Execute only fake/read-only tools.
- Store no repository source, secrets, production data, or personal memory.
- Record every created remote resource and delete it after the spike unless retained intentionally for a documented live-test fixture.

## Acceptance

- [ ] The report records observed request/response shapes and material differences from official documentation.
- [ ] Multi-round and parallel tool-call behavior is demonstrated; all-output requirements and failure behavior are known.
- [ ] Local Zod validation rejects malformed tool arguments before any fake mutation.
- [ ] Thread continuation, cancellation, deletion, and ownership/retrieval requirements are understood.
- [ ] Memory isolation, explicit CRUD, async completion, correction, and deletion are verified.
- [ ] Document indexing states and incomplete-context behavior are verified.
- [ ] Reconciliation after response loss has either a proven strategy or a documented blocker.
- [ ] Usage/cost/model identifiers are sufficient for local policy and telemetry, or the gap is documented.
- [ ] A go/no-go decision selects one of: full Backboard runtime; conversation/memory only with legacy schema-critical model calls; no production Backboard adoption.
- [ ] No production runtime flag or database default changes.

Full contract: `.scratch/backboard-agent-runtime/spec.md` → Phase 0 and Gate A.

