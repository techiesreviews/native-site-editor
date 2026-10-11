---
title: "Guard test: no untracked source reads in plans or controllers"
type: task (AFK)
status: closed
assignee:
blocked_by: [17-guarded-edit-fold-apply-paths]
builder: sol
phase: 1
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/guarded-edit-design.md. A unit test (TypeScript compiler API, already a dependency) that fails when:

- a function passed to `edits.run`/`edits.now` reads through `peek`, `nativeEffectiveSource`, `nativeSources`, `deps.source` or `ports.source` instead of its `r`;
- a file under `src/controllers/` or `src/page-builder/` compares `generation`, `setupScope()` or a `revision` outside the module;
- with an allowlist (file:function + reason) for UI-only reads (painting, menus) that may stay on `peek`.

## Done when

- `tests/guarded-edit-reads.test.ts` green on dev, with a deliberately broken fixture showing each rule fires.
- `npm run check`, `npm test` green.

## Done (2026-10-11)

- `tests/guarded-edit-reads.test.ts` parses `src/` and `shared/` with the TypeScript 6 API and fails on: an untracked read (`.peek`, `nativeEffectiveSource`, `nativeSources`, `nativeEditableSource`, `nativeBaseSources` and the other `native*Sources` byte readers, `draftStore().get`, `deps.source`, `ports.source`) inside a plan passed to `*edits.run`/`*edits.now` (inline, named, or a plan factory) or in any same-file helper it calls, transitively; a plan the guard cannot resolve to a function; a plan calling a helper with a `Reads = …peek` default without passing `r`; such reads in any function taking a `Reads` parameter; and a compare against `generation`, `setupScope` or `revision` in `src/controllers/` or `src/page-builder/`. A reader identity compare (`reads !== peek`) is not a read.
- Allowlist (rule, file, function, reason, exact count): 16 controller-lifetime compares (agent load epoch, boot read generation, palette, history panel, preview selection intents, upstream-deletion check, setup wizard); one wait the plan scan stops at (`ensureNativeTextIndex`, the open404 plan's text index load). No untracked plan read found in the real tree; no src change.
- Built by Sol, transitive helpers, unresolved plans and the wait boundary by Claude. Tests: 8 cases, each rule with a broken fixture and a near-miss; unit 1,910/1,910.
