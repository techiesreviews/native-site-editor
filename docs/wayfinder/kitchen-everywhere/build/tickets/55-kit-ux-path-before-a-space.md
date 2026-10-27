---
title: "`kit ux` names a path followed by a space (follow-up on 54)"
type: task (AFK)
status: closed
assignee: ke-55
builder: claude
blocked_by: [54-kit-ux-spaced-paths-and-docs]
---

## Goal

Slice 54's final Claude review left one P2 regression ([ticket 54 Follow-ups](54-kit-ux-spaced-paths-and-docs.md#follow-ups)): `namesWhole` in `scripts/agents/kit.d/ux` (about line 501) no longer accepts a space after a path, so a checker line like `allow.json:1: src/a.css is no longer used` or `allow.json:1: stale entry src/a.css (no match)` is charged to `allow.json`, not `src/a.css`; when the allow list is not in the diff, the line is dropped and counted as outside. The old token split found `src/a.css` in both. The editor's own `check-colours.mjs` is not affected; other projects' checkers can be.

## Decided behaviour

- In the `afterSpace` pass, a trailing space also ends a path when the path ends in an extension (`/\.[\w-]+$/`), so `src/my` still never matches inside `src/my file.css`, and the left rule (no `/` before) still keeps a deleted `src/my (old) file.css` from being charged to `file.css`.
- A line that only looks like a location (`Found 1 problem in src/a.css:3: #fff`) next to a real located line: record the decision with a test (counted in `outside`, or dropped uncounted, said in the docs).

## Files

- `scripts/agents/kit.d/ux`
- `tests/kit-ux.test.ts`
- `docs/agents/agent-scripts.md` (the `kit ux` colour lines, only if the rule's wording changes)

## Done when

- `tests/kit-ux.test.ts`: `foundIn(["src/a.css"], "allow.json:1: src/a.css is no longer used\n", known).findings.length === 1`, the same with `stale entry src/a.css (no match)`, both failing before the fix; the location-lookalike case pins its `outside` count.
- `kit unit --affected` and `kit doctor` pass; the editor's `kit ux` output on a CSS change is unchanged.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines.

## Done (2026-10-28)

- `namesWhole` in `scripts/agents/kit.d/ux`: in the after-space pass, a space after a path also ends it when the path has an extension (`/\.[\w-]+$/`). `allow.json:1: src/a.css is no longer used` and `allow.json:1: stale entry src/a.css (no match)` now count for `src/a.css` again; `src/my` is still not named by `src/my file.css`, and a deleted `src/my (old) file.css` is still not charged to `file.css`.
- Lookalike decision: a line that only looks like a location (`Found 1 problem in src/a.css:3: #fff`) beside a real located line is dropped and not counted as outside the diff (`outside: 0`); said in `docs/agents/agent-scripts.md` and the `colourFindings` comment, whose rule wording also names the new space-after-extension case.
- Tests (`tests/kit-ux.test.ts`): the two stale-entry lines (both failed before the fix with `findings: [], outside: 1`), the extensionless and parenthesised paths followed by ` (no match)`, and the lookalike beside a located line.
- The editor's `check-colours.mjs` output (`file.css:line: match`) gives the same findings before and after: CSS lines take their own file and never reach `namesWhole`.
- Feature list: no change (kit plumbing, nothing in the editor a user sees).
