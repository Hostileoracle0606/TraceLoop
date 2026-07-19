# 13 — Conversation, activity, contract, attempt, and memory APIs/UI

Status: blocked

Blocked by: 03, 09, 10, 12

## What to build

Expose the agent runtime through task-oriented APIs and make conversation, authoritative execution, contract interpretation, attempts, causal evidence, and retained memory visibly distinct in the UI.

## Scope

- Add provider-neutral commands for start/turn, clarification response, approve/reject, resume, cancel, and conversation retrieval.
- Add queries for task contract/revisions, activity timeline, attempts, causal episodes, and memory provenance.
- Proxy Backboard conversation through the authenticated backend; never expose provider credentials.
- Use Supabase Realtime for authoritative task/run/activity progress rather than Backboard thread status.
- Replace the canned composer path with one real `submitTurn` path.
- Build the clarification card with rationale, options, recommended default, and contract diff.
- Show a persistent task-attention bar with state, attempt, profile, budgets, required action, stop/takeover.
- Show conversation and activity as separate views; identify source snapshot and evidence for every run/patch.
- Add memory inspection/correction/deletion UX at an appropriate project/user scope.

## Acceptance

- [ ] A user can start, clarify, approve/reject, resume, cancel, refresh, and reopen a task without losing continuity.
- [ ] Conversation displays Backboard history while state/progress comes from TraceLoop records.
- [ ] The current confirmed contract and assumptions are visible and editable through a revision flow.
- [ ] UI never shows a provider reply or queued action as completed work.
- [ ] Attempt/run/patch views link to the exact immutable source and causal evidence.
- [ ] Stop/takeover works from every active-loop surface.
- [ ] Ownership, empty, unavailable-provider, and partial-failure states are tested.
- [ ] Playwright covers clarification and approval pause/resume on the same task.

Full contract: `.scratch/backboard-agent-runtime/spec.md` → APIs and UI and Phase 6.
