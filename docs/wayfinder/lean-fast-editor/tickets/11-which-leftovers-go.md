---
title: Decide which leftovers are deleted
type: grilling (HITL)
status: open
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
