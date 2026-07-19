# 11 — Cross-attempt causal episodes and progress assessor

Status: blocked

Blocked by: 10

## What to build

Extend causal provenance across attempts so TraceLoop can determine whether an intervention resolved the failure, repeated it, regressed behavior, or produced incomparable evidence—and can explain that determination.

## Scope

- Add `causal_episodes` linking failed criterion, failure signature, root cause/absence attribution, hypothesis, patch/intervention, source snapshot, validation attempt, outcome, and evidence.
- Define stable failure signatures for build, divergence, missing-write, verification, and infrastructure cases.
- Implement deterministic `resolved`, `unchanged`, `regressed`, and `inconclusive` classification where evidence permits.
- Compute a diagnosis delta across attempts.
- Query relevant prior episodes by criterion, root-cause signature, implicated symbols/components, and project.
- Feed ineffective/regressed interventions into patch/replan context.
- Enforce a no-progress threshold and require materially new evidence before repeating an intervention.
- Do not add a graph database or parallel general provenance graph.

## Acceptance

- [ ] A passing validation attempt marks the prior episode resolved without test weakening.
- [ ] The same failed criterion/root-cause signature after a patch is unchanged.
- [ ] New/earlier failure or worsened criteria is classified regressed.
- [ ] Build/simulation/trace/analysis failures that prevent comparison are inconclusive, never passed.
- [ ] Every classification links to contract, attempts, runs, patches, activities, source snapshots, and artifacts sufficient to explain it.
- [ ] The next model turn receives scoped prior interventions and outcomes.
- [ ] Repeated unchanged interventions trigger replan/clarification/block according to policy.
- [ ] Existing per-run causal engine determinism remains unchanged.

Full contract: `.scratch/backboard-agent-runtime/spec.md` → Causal episode and progress and Phase 5.

