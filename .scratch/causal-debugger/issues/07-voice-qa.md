# 07 — Voice Q&A: "why did this test fail?" (stretch)

**What to build:** A developer asks "why did this test fail?" out loud and hears the plain-language root cause spoken back, live — a thin voice layer over the engine's already-computed answer (the root-cause text in the run view-model). Demo garnish, not core; only worth building once the deterministic answer renders end-to-end.

**Blocked by:** 03 (end-to-end view-model with root-cause text to speak).

**Status:** ready-for-agent

- [ ] A spoken question is transcribed and resolved to the failure query.
- [ ] The run view-model's root-cause text is spoken back to the developer.
- [ ] End-to-end latency is low enough to feel live in a demo.
