---
title: "`kit ux`'s screen map moves into each project's settings (follow-up on 30)"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [30-kit-repo-and-move]
---

## Goal

After ticket 30 the shared kit still holds one of this editor's own facts: `screenFiles` in the kit's `kit.d/ux` (around line 43) maps each `kit shots` screen (`editor`, `media-gallery`, `pages`, …) to the editor's source files it shows (`src/components/…`, `src/page-builder/…`). Ticket 01 point 1 says each project keeps its own settings, and a screen added or renamed on either side now has to cross both gates at once (the review of 30 dropped the equality test between the two for that reason). Move the map into the project's settings so `kit ux` reads it from the project, like `featureList`.

## Decided behaviour

- A new optional key in `scripts/agents/kit.json`, `ux.screens`: an object from screen name to a list of file globs, the same shape as today's `screenFiles`. `kit ux` reads it through `kitSettings()`; without it no feature maps to a screen, and `kit ux` says so in one plain line (as it does for a missing `featureList`).
- The kit's `kit.d/ux` keeps no project paths: `screenFiles` and its editor globs go.
- This editor's `scripts/agents/kit.json` gets today's map unchanged, so `kit ux` behaves the same here.
- This editor's `tests/kit-editor.test.ts` gets back the check that every `kit shots` screen (`scripts/agents/shots/core` `screens`) has an entry in `ux.screens`, and every entry is a screen, both read from this repo only.

## Files

- In the kit repo (`~/Projects/agent-kit`, a PR through its own `kit pr`): `kit.d/ux`, `tests/kit-ux.test.ts` (fixtures carry their own `ux.screens`), `tests/fixtures/editor-kit.json`.
- In this repo: `scripts/agents/kit.json`, `tests/kit-editor.test.ts`, `docs/agents/agent-scripts.md` (the settings list and the `kit ux` line).

## Done when

- `kit ux` in this editor tries the same features on the same screens as before (a `kit ux --base origin/dev --no-review` run on a branch touching `src/page-builder/media-picker.css` names the `picker` screen before and after).
- The kit's `kit.d/ux` names no `src/` path; the kit's tests pass.
- Landing order: the editor PR adding `ux.screens` lands first (the kit still reads its own map then), then the kit PR that reads the setting, so neither gate fails.
- `kit unit --affected`, `kit doctor`, `kit status` pass in both repos.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`, in both repos). `kit doctor`; the kit side with `kit slice` or by hand and the kit repo's `kit pr`; the editor side with `ASE_OWNER=<owner> scripts/agents/kit pr --ticket docs/wayfinder/kitchen-everywhere/build/tickets/61-kit-ux-screen-map-in-project-settings.md`; `kit review` and the second look on each. Report both PRs and merge SHAs, and the `kit ux` screen lines before and after.
