# 03 — Collapse Modal client to the deployed single-job contract (Task A1)

**What to build:** Replace `modalClient.build/simulate/analyze` with one `runJob({files, board}) → {build, trace?}` matching the deployed endpoint; resolve the board **slug** from its UUID in `tasks.execute`; drop the `elfPath` artifact handoff; run analysis in-process via `@engine`.

**Blocked by:** 01 (needs `boards.slug`).

**Status:** ready-for-agent

- [ ] `runJob` posts to the root endpoint and returns `{build:{ok,log}, trace?:{log}}` (mocked test).
- [ ] Pipeline uses one `run-firmware-job` step; no `elfPath`/`/build`/`/simulate`/`/analyze` references remain.
- [ ] `boardSlug` is resolved from the UUID before the Inngest event is sent.

Full contract: plan → Workstream A, Task A1.
