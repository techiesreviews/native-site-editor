---
title: Decide which leftovers are deleted
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: []
---

## Question

Which of these are deleted, and which are kept on purpose?
- Astro remnants: the `astro-site-editor` User-Agent in `worker/github.ts:162`, `.astro/` in `.gitignore`, and the Astro fixtures in `tests/publish.test.ts`, `history.test.ts` and `native-project.test.ts`.
- The missing `../functions` include in `worker/tsconfig.json`.
- `tests/browser-native-prototype/` and `tests/perf/`.
- `docs/archive/code-editor-prototypes.tar.gz`.
- The committed `memory/handoffs/*`.
- The stale comments in `shared/change-status.ts:5` and `shared/cascade.ts:4`.
- The old `.claude/worktrees/` copies.

## Resolution (2026-10-06)

Decided with Lex: everything listed goes.

- Astro remnants: User-Agent renamed (`worker/github.ts:162`), `.astro/` out of `.gitignore`, Astro fixtures replaced in `publish`, `history` and `native-project` tests.
- Fix the missing `../functions` include in `worker/tsconfig.json` (remove it).
- Delete `tests/browser-native-prototype/` and `tests/perf/edit-component-latency.ts` (and the reference to it in `tests/native-save/server.ts:167`). The cold-start script from ticket 01 is the one perf tool that stays.
- Delete `docs/archive/code-editor-prototypes.tar.gz`.
- Delete the committed `memory/handoffs/*` and `memory/INDEX.md`.
- Fix the stale comments in `shared/change-status.ts:5` and `shared/cascade.ts:4`.
- Remove old `.claude/worktrees/` copies (local only; skip any that belong to a running agent).
