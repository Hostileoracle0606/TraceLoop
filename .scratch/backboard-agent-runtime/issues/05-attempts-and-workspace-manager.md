# 05 — Immutable attempts and workspace manager

Status: blocked

Blocked by: 02, 04

## What to build

Replace mutable task-level source as the execution identity with immutable attempts and isolated workspaces. Every plan, diff, run, trace, patch, and causal episode must point to the exact source snapshot it used.

## Scope

- Add `attempts` with sequence, parent, contract revision, plan, base/source/workspace/diff references, status, and timestamps.
- Link runs and patches to attempts; preserve/backfill current `iteration` compatibility.
- Define `WorkspaceManager` operations: create, restore, read, apply validated operations, snapshot, diff, discard, and cleanup.
- Implement Git-worktree behavior for connected/local repositories.
- Implement content-addressed source artifacts for generated/uploaded projects.
- Use Modal filesystem snapshots only as an optional environment optimization, not the sole source record.
- Enforce workspace-root containment, size limits, cleanup, and source snapshot creation before build dispatch.
- Keep `tasks.currentFiles` as a temporary compatibility projection and document cutover/removal criteria.

## Acceptance

- [ ] Every firmware run references one attempt and immutable source snapshot.
- [ ] Two attempts can branch from the same base without sharing mutable working files.
- [ ] Recreating a workspace from the snapshot yields byte-equivalent build inputs.
- [ ] Diff artifacts identify every authorized source change and protected tests remain unchanged unless separately approved.
- [ ] Path traversal and cross-workspace access are rejected.
- [ ] Cancellation/failed attempts clean ephemeral workspaces without deleting immutable evidence.
- [ ] Current task consumers remain compatible during migration.

Full contract: `.scratch/backboard-agent-runtime/spec.md` → Attempt and workspace and Phase 2.
