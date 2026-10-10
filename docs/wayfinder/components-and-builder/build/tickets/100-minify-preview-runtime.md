---
title: "Minify the preview runtime at build time"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: sol
phase: 7
---

## What

Lex (2026-10-10), after slice 97 (see its Done note): `dev` sits at the 355 KB budget before first paint, so the push check fails. Minify the preview runtime (`src/components/native-preview-runtime.js`, shipped verbatim today) at build time, keeping the source readable in the repo and a source map so it stays debuggable (~24 KB gzip saved). This reverses the lean-fast-editor decision "no minifying" (`docs/wayfinder/lean-fast-editor/build/p5-14-runtime-cache.md`): add a one-line note there pointing here. Update the verbatim-runtime check in `tests/perf/byte-budget.ts` (and any test that reads the runtime's text) to the new rule; keep the runtime's caching (p5-14) working.

## Done when

- `npm run test:budget` passes with clear headroom; the preview works (smoke, the drag and Edit component mode specs); cold timings not worse (scripts/agents/cold.sh); a push to dev passes the "Deploy the dev preview" workflow's budget step (check with `gh run watch`).
