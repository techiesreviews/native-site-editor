---
title: "Guard test: no untracked source reads in plans or controllers"
type: task (AFK)
status: open
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
