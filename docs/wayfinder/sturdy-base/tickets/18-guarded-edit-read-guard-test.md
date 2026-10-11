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

- `tests/guarded-edit-reads.test.ts` parses `src/` and `shared/` with the TypeScript 6 API (a per-file checker binds names, so shadowing, aliases and destructuring resolve) and fails on: an untracked read (`.peek`, `nativeEffectiveSource`, `nativeSources`, `nativeEditableSource`, `nativeBaseSources` and the other `native*Sources` byte readers, `draftStore().get`, `deps.source`, `ports.source`, or an alias or destructured name for one) inside a plan given to `*edits.run`/`*edits.now` (inline, named, a conditional, a factory's returned plan; the call through `const { run } = edits` too) or in a same-file helper it calls, transitively; a plan it cannot resolve in the file; a plan calling a helper whose `Reads` parameter defaults to `peek` without passing `r`; such reads in any function taking a `Reads`; and a compare against `generation`, `setupScope` or `revision` in `src/controllers/` or `src/page-builder/`. A reader identity compare (`reads !== peek`) is not a read. Cross-file helpers reached through ports are seen only when they take a `Reads`.
- Allowlist (rule, file, function, reason, exact count): 16 entries for 18 controller-lifetime compares (agent load epoch, boot read generation, palette, history panel, preview selection intents, upstream-deletion check, setup wizard), and one wait the plan scan stops at (`ensureNativeTextIndex`, the open404 plan's text index load).
- Two untracked reads in plans fixed (found in review): Pages delete's card removal (`cardsLinkingTo`) read every page and the section-ness templates through `peek`, now through the delete's `r`; the component loader planner (`LoaderPlanner`, main.ts `nativeComponentLoaderPlan`) read the whole site through `nativeSources` with a hand proof (`expectedSources`, `current()` as the guard), now takes `r` (`nativeSiteSources(site, r.source)`, `r.exists`), and the hand proof and `loaderReads` are gone.
- Built by Sol; resolution, waits and the fixes by Claude; reviewed by Sol. Tests: guard 9 cases (broken fixture and near-miss per rule), `cards-controller` (+1: a page read for cards changing during the dialog refuses), `component-plans` (+1: a file the loader planner read changing during its wait refuses).
