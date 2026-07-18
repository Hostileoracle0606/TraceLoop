# 21 — Agent composer single turn-path + onboarding (Task E7)

**What to build:** One `submitTurn(text)` mutation for typed input (voice later shares it); remove the canned delayed response; add suggested prompts ("Explain this failure," "What needs my approval?," "Stop task"); add a guest/demo path (read-only sample) past the auth wall; success/commit toasts only after the backend op succeeds; commit requires the separate Git permission or is disabled-with-reason.

**Blocked by:** None — can start immediately (real agent replies richer once 05 lands).

**Status:** ready-for-agent

- [ ] A visitor can view a sample project without an account.
- [ ] No success/commit toast appears before a real backend result; the composer no longer fakes replies.

Full contract: plan → Workstream E, Task E7.
