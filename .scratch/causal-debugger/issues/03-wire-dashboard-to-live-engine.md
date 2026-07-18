# 03 — Wire the dashboard to live engine output (end-to-end on synthetic input)

**What to build:** Connect the engine (ticket 01) to the dashboard (ticket 02) through the run view-model, so a synthetic run flows engine → view-model → rendered dashboard with **no hand-authored fixture** in the loop. This is the first true end-to-end: feed the synthetic Timer2 wrong-pin sequence in, watch the real timeline / board / causal graph + root cause come out.

**Blocked by:** 01 (engine emits the view-model), 02 (dashboard renders the view-model).

**Status:** done (evidence-panel prose still static — cosmetic, tracked for polish)

- [x] The engine emits the run view-model and the dashboard renders it live — `frontend/src/run.ts` runs `analyze() → toDashboardRun()` on load via `@engine`/`@fixtures` Vite aliases; the static `run-fixture.json` is deleted. Build bundles 31 modules (engine included), frontend + engine typecheck clean, 4 engine tests green.
- [x] The synthetic Timer2 wrong-pin run shows the correct timeline, board (orange LED lit), causal graph, and root cause — verified in-browser, no console errors.
- [~] Evidence links + Generate-patch button render live; the evidence-panel *prose* (`<h2>` + explanation paragraph) is still the source's static copy. Wiring it to `rootCauseText` is cosmetic — folded into ticket 08 / polish.
