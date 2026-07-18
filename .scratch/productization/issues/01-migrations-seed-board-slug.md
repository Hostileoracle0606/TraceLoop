# 01 — Committed migrations + board seed + slug (Task C1)

**What to build:** A fresh database can create a project — commit `drizzle-kit generate` migrations, add a `db:seed` inserting the STM32F4 Discovery board with a `slug` (`stm32f4_disco`), and `db:migrate`/`db:seed` scripts.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `boards.slug` column exists; migrations committed under `backend/db/migrations/`.
- [ ] After `db:seed`, `boards.list` returns ≥1 board with `slug='stm32f4_disco'`, `verified:true`.
- [ ] `package.json` has `db:migrate` + `db:seed`; documented in setup.

Full contract: `docs/productization/implementation-plan.md` → Workstream C, Task C1.
