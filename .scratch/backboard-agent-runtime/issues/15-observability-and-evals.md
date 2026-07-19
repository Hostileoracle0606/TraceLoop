# 15 — Agent observability and evaluation datasets

Status: blocked

Blocked by: 04, 09, 10, 11

## What to build

Instrument the complete task/attempt/stage trajectory with OpenTelemetry and build repeatable evaluations that determine whether Backboard, context, ambiguity, and memory changes actually improve TraceLoop.

## Scope

- Add OpenTelemetry trace/span conventions for task, contract, attempt, stage, retrieval, model turn, tool, workspace, firmware worker, Modal, Renode, verification, causal analysis, progress, and memory.
- Pin/document the GenAI semantic-convention version and preserve W3C trace context across services where possible.
- Correlate local and external IDs without logging secrets, hidden reasoning, or unrestricted source/prompts.
- Export OTLP and configure Langfuse initially for traces, datasets, experiments, scores, cost, and latency.
- Build versioned datasets from synthetic firmware cases, repository fixtures, and sanitized real failures.
- Add deterministic evaluators first; use calibrated model judges only where deterministic checks cannot express quality.
- Compare legacy versus Backboard runtime and context/memory variants in shadow mode.
- Add dashboards/alerts for duplicate side effects, stuck waits, cost/budget, provider failure, and inconclusive/no-progress behavior.

## Acceptance

- [ ] One task can be reconstructed across contract, attempts, activities, providers, runs, and causal episodes from trace IDs.
- [ ] Provider/model/tokens/cost/latency/retries/outcomes are attributable per stage and attempt.
- [ ] Sensitive data and hidden reasoning are excluded/redacted by default.
- [ ] Evaluation cases cover ambiguity, first-pass success, build repair, divergence, missing-write, ineffective patch, regression, inconclusive evidence, approval, cancellation, and memory retrieval.
- [ ] Backboard cannot become default without a reproducible comparison against the legacy baseline.
- [ ] Memory benefit is measured; irrelevant/poisoned retrieval is detectable.
- [ ] Telemetry sink replacement does not require changing domain code.
- [ ] Operational alerts identify stuck/duplicate/over-budget paths.

Full contract: `.scratch/backboard-agent-runtime/spec.md` → Observability and evaluation and Phase 6.
