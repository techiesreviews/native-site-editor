---
title: A line limit for every source file, not only main.ts
status: ready-for-agent
assignee:
blocked_by: []
---

# A line limit for every source file, not only main.ts

## What

Sweep 2026-10-26, item 1. Only `src/main.ts` has a line ceiling (`tests/main-ts-ceiling.test.ts`, 540). Every
other file can grow without limit: 42 of 532 source files are over 500 lines, 17 over 800
(`native-preview-runtime.js` 4313, `html-entities.ts` 2276, `components.ts` 2106). The single ceiling
rewarded moving lines out of `main.ts` into new files rather than making modules deeper.

Lex (2026-10-26): a limit is good against god files, but it must not be the only measure of tidying, and
every file should get smaller.

## Fix

- ESLint `max-lines` (the common convention; ESLint's own default is 300) at **400 lines**, blank lines
  and comments skipped, for `src/**`, `shared/**`, `worker/**` and `scripts/**` in `eslint.config.mjs`.
  Plain `.js`/`.mjs` files are linted for this rule too.
- Files over 400 today go in one checked-in list with their current size (e.g. `scripts/file-size-allowlist.json`).
  A listed file may not grow past its number; a test fails when a file shrinks 50+ lines below it and asks
  to lower the number (the `main-ts-ceiling` pattern), and when a listed file drops under 400 it must
  leave the list. New files get no entry.
- Delete `tests/main-ts-ceiling.test.ts`; `main.ts` joins the list at its current size.
- So the limit is not the only measure (ticket 15): a second check that the workspace host files
  (`*-host.ts`, `workspace-*.ts`) do not import each other, in the same lint config
  (`no-restricted-imports` patterns) or as a unit test.
- Write the rule into `CODING_STANDARDS.md` (one line: 400 lines, one job per file) and `docs/agents/guardrails.md`.

## Done when

- `npm run lint` fails on a new 401-line file in `src/` and on a listed file growing by one line.
- The allow-list test fails when a listed file shrank 50+ lines without its number being lowered.
- `tests/main-ts-ceiling.test.ts` is gone and `main.ts` is in the list.
- A host file importing another host file fails the check.
