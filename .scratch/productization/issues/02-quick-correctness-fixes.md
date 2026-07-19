# 02 — Quick correctness fixes: `?raw` types + drizzle bump (Task C3)

**What to build:** Unblock the frontend typecheck and clear the ORM advisory — add `frontend/src/vite-env.d.ts` (`/// <reference types="vite/client" />`) or drop the unused `firmwareSource` import, and bump `drizzle-orm` to ≥0.45.2.

**Blocked by:** None — can start immediately.

**Status:** complete

- [ ] `frontend` `tsc --noEmit` passes (the `main.c?raw` TS2307 is gone).
- [ ] `drizzle-orm >= 0.45.2`; full test suite still green after the bump.
- [ ] `npm audit` no longer reports the Drizzle SQL-injection high.

Full contract: plan → Workstream C, Task C3.
