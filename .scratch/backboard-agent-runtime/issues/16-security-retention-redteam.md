# 16 — Agent security, retention/deletion, and red-team gates

Status: blocked

Blocked by: 08, 12, 14, 15

## What to build

Threat-model and harden the full agent architecture before external autonomous access, including Backboard, code/context retrieval, memory, tool capabilities, MCP, workspaces, and human approvals.

## Scope

- Map OWASP Agentic Security threats to TraceLoop trust boundaries and controls.
- Test goal/prompt/context injection, tool misuse, memory poisoning, identity/ownership failures, privilege escalation, resource overload, unexpected code/network execution, audit repudiation, and approval manipulation.
- Add provider-bound secret/source/document redaction and untrusted-context labeling.
- Verify sandbox containment, egress policy, no host secrets, file caps, path checks, protected tests, and budget enforcement.
- Verify user/project memory isolation and poisoned/stale memory correction.
- Implement retention/deletion workflows for Backboard assistants/threads/documents/memories, source snapshots, artifacts, activity references, and tombstones.
- Add Promptfoo or equivalent trajectory-based evals and CI quality/security gates.
- Write incident/reconciliation runbooks for leaked credentials, stuck remote runs, orphaned resources, response loss, and provider outage.

## Acceptance

- [ ] Threat model names every trust boundary, threat, mitigation, residual risk, and verification.
- [ ] Repository/document content cannot override system policy or widen tools.
- [ ] Cross-project/user access and memory leakage tests fail closed.
- [ ] Agent cannot exfiltrate host/provider secrets through tools, logs, prompts, or artifacts.
- [ ] Red-team trajectories distinguish what the agent said from tools/actions actually executed.
- [ ] Approval UI cannot conceal the affected files/tests/external side effect/cost.
- [ ] Retention/deletion is idempotent, observable, and exercised against live isolated Backboard resources.
- [ ] Required CI security thresholds pass before external autonomous or remote MCP rollout.

Full contract: `.scratch/backboard-agent-runtime/spec.md` → Security and trust boundaries and Gate D.

