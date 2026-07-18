# 08 — Make Generate-patch functional (stretch)

**What to build:** The dashboard already ships a **Generate-patch** action; wire it up. Given a resolved causal chain, propose a concrete patch (e.g. change `timer_isr` to write GPIO pin 12 instead of pin 13) and show it for review. This is the "next version of their GitHub Actions bot" framing — a comment that not only explains the causal story but offers the correction.

**Blocked by:** 03 (a resolved causal chain in the live view-model to patch from).

**Status:** ready-for-agent

- [ ] Given a resolved causal chain, the tool proposes a patch addressing the root event.
- [ ] The proposed patch is presented in the dashboard's Generate-patch surface for review, not applied silently.
