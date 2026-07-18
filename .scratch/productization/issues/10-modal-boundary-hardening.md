# 10 — Harden the public Modal boundary (Task B2)

**What to build:** In `modal/app.py`: path containment (resolve + `is_relative_to(workdir)`, reject absolute/`..`), a shared-secret `X-TraceLoop-Token` (Modal Secret), file-count (≤64) + total-size (≤1MB) caps, and stop returning Python tracebacks (generic error; compiler log stays).

**Blocked by:** 03 (client sends the token via `runJob`).

**Status:** ready-for-agent

- [ ] Traversal/absolute paths → `{build:{ok:false, log:"invalid file path"}}`.
- [ ] Missing/wrong token → 401; oversized/too-many-files → rejected.
- [ ] No harness traceback in any response body.

Full contract: plan → Workstream B, Task B2.
