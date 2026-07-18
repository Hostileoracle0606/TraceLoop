# 12 — Health-derived system status (Task D1)

**What to build:** Replace hardcoded "Renode connected · local" and Settings "All systems ready" with states derived from `/api/health` (`Simulator ready` / `Compute unavailable` / `Checking systems`); technical versions in a popover.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] With the backend down, the sidebar badge reads unavailable, not connected.
- [ ] Settings shows live per-dependency status; never "All core systems ready" unless every health check passes.

Full contract: plan → Workstream D, Task D1.
