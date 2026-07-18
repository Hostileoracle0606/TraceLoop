# 20 — FSM screen: typed tRPC, auto-loaded, styled (Task E6)

**What to build:** Remove the UUID input and auto-load the current task; replace `fetch('http://localhost:3000/tasks.get')` with typed tRPC hooks (`tasks.get`, `tasks.getActivityLog`); read-only activity timeline + one control (Stop / Take over); restyle with the app's existing panel/form CSS (drop unbuilt Tailwind classes).

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] FSM loads the active task via authenticated tRPC (no hardcoded localhost, JWT attached).
- [ ] The view is visibly styled using `traceloop.css` classes.

Full contract: plan → Workstream E, Task E6.
