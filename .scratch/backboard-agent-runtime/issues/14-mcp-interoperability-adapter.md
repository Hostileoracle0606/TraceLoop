# 14 — MCP interoperability adapter over the capability registry

Status: blocked

Blocked by: 08, 10

## What to build

Expose selected TraceLoop resources and bounded domain capabilities through the stable official MCP TypeScript SDK without making MCP the internal workflow engine.

## Scope

- Select and record the stable MCP specification/SDK version at implementation time; require an ADR for beta-only production features.
- Reuse generated schemas and capability descriptions from the internal registry.
- Expose read-only project/task/contract/attempt/run/causal resources and only explicitly approved action tools.
- Support progress, cancellation, pagination, and bounded results.
- Implement local stdio and authenticated remote Streamable HTTP as needed.
- Enforce OAuth/scoped authorization, host/origin validation, ownership, permission, and activity audit for remote access.
- Keep Inngest as the durable task engine; do not delegate authoring-loop lifecycle to MCP tasks.
- Add third-party server allowlisting and no marketplace auto-install.

## Acceptance

- [ ] MCP and Backboard tools share canonical contracts rather than hand-maintained schemas.
- [ ] External callers cannot bypass task state, ownership, permissions, approvals, budgets, or idempotency.
- [ ] Remote transport rejects invalid origins/hosts/tokens/scopes.
- [ ] Read-only resources are paginated, redacted, and bounded.
- [ ] Cancellation maps to the authoritative TraceLoop cancellation path.
- [ ] No generic shell/database/deployment/credential tool is exposed.
- [ ] Protocol conformance and security tests pass for the pinned stable version.
- [ ] MCP can be disabled without affecting the internal authoring loop.

Full contract: `.scratch/backboard-agent-runtime/spec.md` → MCP and Phase 6.
