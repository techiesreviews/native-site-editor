---
title: The feature list
type: task (AFK)
status: closed
assignee: sf-41
builder: claude
blocked_by: [40-ux-rulebook]
---

## Goal

One plain-words list of every editor feature, each with how to try it and what good looks like, linked to the UX rulebook ([checking-skill resolution](../../tickets/03-grill-checking-skill.md#resolution-2026-10-22) item 1). It is what the acts-like-a-user check tries (slices 42, 45) and what every visible slice keeps current (slice 44).

## Decided behaviour

- New file `docs/agents/features.md`. One entry per feature a user can notice, grouped by area (sign-in and setup, repositories and branches, Pages and files, page editing on the canvas, edit bar, Page Structure, components and Edit component mode, Media and the image popup, code panes, versions and history, publish and discard, agents menu and agent connection, command palette, phone layout).
- Entry format (machine-readable heading, plain body):

  ```
  ### F-<area>-<nn> <feature name>
  - Try: <steps a user takes, in plain words>
  - Good: <what a user should see and feel; rulebook rules by id where they apply>
  - Files: <globs of the source files that make it>
  - Phone: yes | no
  - Steps: <path of the scripted try, or "none yet">
  ```
- Sources: the code map (`docs/agents/code-map.md`), `CONTEXT.md`, the browser specs' titles in `tests/native-save/` and `tests/native-preview/`, the 13 `kit shots` screens, and trying the editor on the real starter (`scripts/agents/kit shots` named screens; T3 preview tools are not available to builders). Aim for completeness of what a user can do; a feature with no spec is marked `Steps: none yet`.
- `Files` globs must match existing files (a unit test checks it, like `tests/code-map.test.ts` does for the code map).

## Files

- `docs/agents/features.md` (new)
- `tests/features-list.test.ts` (new: headings unique and well-formed, every field present, every `Files` glob matches at least one tracked file, every `Steps` path exists or is `none yet`, rulebook ids exist in `docs/agents/ux-rulebook.md`)
- `docs/agents/kitchen.md` (station 7 points to it), `docs/agents/code-map.md` (one line: where features are listed)

## Done when

- Every area above has entries; the Done section lists counts per area and the features marked `Steps: none yet`.
- `scripts/agents/kit unit tests/features-list.test.ts tests/code-map.test.ts` green; `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Docs and one test file.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-sf41 -- scripts/agents/kit slice --ticket docs/wayfinder/software-factory/build/tickets/41-feature-list.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-sf41 --timeout 2h`.
- Report: feature count per area, unit `RESULT:` lines, review decisions, PR and merge SHA.

## Done (2026-10-25)

- `docs/agents/features.md` lists 142 features in the 14 areas, each with Try, Good (rule ids from the
  UX rulebook), Files, Phone and Steps: sign-in and setup 9, repositories and branches 9, Pages and
  files 16, page editing on the canvas 14, edit bar 11, Page Structure 8, components and Edit
  component mode 10, Media and the image popup 27, code panes 7, versions and history 6, publish and
  discard 7, agents menu and agent connection 9, command palette 4, phone layout 5. Built features
  only; the planned project overview, local folders and synced sessions join when they land.
- `Steps: none yet`: F-repo-02 Find a repository, F-repo-03 Add repositories on GitHub, F-repo-04
  Switch GitHub account. Every other entry names the browser spec that tries it.
- `tests/features-list.test.ts` checks headings (`F-<area>-<nn> <name>`, unique, one prefix per area,
  every area present with entries), the five fields in order with Phone yes or no, every `Files` glob
  against `git ls-files`, every `Steps` path on disk or `none yet`, and every rule id in Good against
  `docs/agents/ux-rulebook.md`; a parser test covers malformed entries.
- Kitchen station 7 points to the list and asks a visible change to keep its entries current; the
  code map's header names where features are listed.
- Validation: `kit unit tests/features-list.test.ts tests/code-map.test.ts` ok 8/8; `kit unit
  --affected` ok 5/5; `npm run check` and `npm run lint` pass.
