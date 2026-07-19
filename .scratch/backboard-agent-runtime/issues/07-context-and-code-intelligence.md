# 07 — Firmware-aware context engine and code intelligence

Status: blocked

Blocked by: 02, 05

## What to build

Replace repository-wide prompt concatenation with stage-specific, attributable context using Zephyr compilation commands, LSP, syntax structure, project rules, Git/source diffs, and causal history.

## Scope

- Define `CodeIntelligence`, repository-map, retrieval, and `ContextAssembler` ports.
- Generate/capture valid `compile_commands.json` from the Zephyr build for clangd.
- Implement symbol, reference, definition, and diagnostics queries through clangd/LSP.
- Implement a Tree-sitter repository/syntax map and broken-source fallback.
- Score/select context by contract, stage, diagnostics, changed files, dependency proximity, root cause, and prior validated episodes.
- Record source references, token budget, truncation, and omissions.
- Synchronize only stable approved project documents to Backboard; never upload the changing source tree after each edit.
- Run a bounded read-only Serena spike; disable shell, mutation, and memory tools.
- Delay embeddings until deterministic retrieval baselines and evaluation fixtures exist.

## Acceptance

- [ ] Planning/editing/patching receive different bounded context packets.
- [ ] Zephyr includes, defines, devicetree-generated headers, and board flags resolve correctly in a fixture.
- [ ] Symbol/reference retrieval finds firmware relationships that plain text search cannot disambiguate.
- [ ] Broken/incomplete source still produces a useful Tree-sitter map.
- [ ] Context provenance and omissions are inspectable in tests/telemetry.
- [ ] No default path concatenates every source file into every prompt.
- [ ] Serena value, latency, failure behavior, and overlap are measured before any write capability is considered.
- [ ] Retrieval evaluation cases establish a baseline for later semantic search.

Full contract: `.scratch/backboard-agent-runtime/spec.md` → Context engine and code intelligence.
