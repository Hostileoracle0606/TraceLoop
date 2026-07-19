# 09 — Validate & enforce LLM outputs (Task B1)

**What to build:** `backend/llm/validate.ts` — parse every model output with the Zod schemas (`generateObject`/`safeParse`) and enforce policy: path ∈ approved plan, `!isProtectedFile(path)`, no absolute/`..`, `edit.search` must exist in the file, confidence ∈ [0,1]. Reject (retry once) on violation.

**Blocked by:** None — can start immediately.

**Status:** complete

- [x] Rejects: out-of-plan path, protected test file, `../` traversal, missing `search`, confidence `1.5`, malformed JSON.
- [x] `backend/llm/functions.ts` routes all outputs through the validators (no `as` casts).
- [x] A typed `LLMValidationError` is thrown after the retry budget.

Full contract: plan → Workstream B, Task B1.
