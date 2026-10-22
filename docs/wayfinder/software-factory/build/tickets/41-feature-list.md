---
title: The feature list
type: task (AFK)
status: open
assignee:
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
