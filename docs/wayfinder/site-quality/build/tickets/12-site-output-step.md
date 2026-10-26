---
title: "The site-output step in the save path"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

One place, run on every save, that brings the site's generated parts up to date before the commit ([ticket 05](../../tickets/05-grill-automatic-fixes.md#resolution-2026-10-26): "done silently, on every save"). Later slices add their work to it. Size: S–M.

## Decided behaviour

- A new module (`src/site-output/`, final name in `decide`) with one entry, given the drafts about to be saved and the site's settings, that returns the extra file changes for the same commit.
- Called from the save path (`src/controllers/save-publish-controller.ts`) for both Save and Publish, once per save, by whoever saves (also with several editors, agents build slice 26).
- The extra changes show in Compare changes and go into the same commit; nothing is saved behind Lex's back, and nothing asks him anything. No message, no mark.
- Loaded only when saving (lazy), so boot bytes do not grow.
- This slice ships the step with no work in it, plus the test harness the later slices use (drafts in, file changes out).

## Files

Expected (confirm while designing): `src/site-output/index.ts`, `src/controllers/save-publish-controller.ts`, `src/lazy-loaders.ts`, `tests/site-output.test.ts`, `docs/agents/code-map.md`.

## Done when

- A unit test shows the step runs once per Save and once per Publish and that its changes land in the same commit.
- `kit size`: boot bytes unchanged.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-12 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-12 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
