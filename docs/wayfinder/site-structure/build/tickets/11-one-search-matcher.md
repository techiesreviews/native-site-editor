---
title: "One search rule for the whole editor"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

Replace the editor's six separate matchers with one shared module ([ticket 06](../../../tickets/06-grill-search.md#resolution-2026-10-26); research `git show origin/research/ss-02-structure-and-search:docs/wayfinder/site-structure/research/02-structure-and-search.md`, section 3). Size: M.

## Decided behaviour

- Move the palette's matcher (`src/page-builder/palette-search.ts`) to `src/search/match.ts`, pure, keeping `fuzzyMatch`, `rankItems`, `markRuns` and `parseQuery`.
- **Matching (Lex, 2026-10-26):** word starts and runs rank first ("gp" finds garden-photo); letters in the middle of a word ("rden") also match, ranked below them. Every typed word must match.
- Add `matches(entry, query)` (the same rule, without scoring) and a prepared list: lowercase text built once per change, narrowing from the last results when letters are only added (keeps a 500-page site under one frame on a phone).
- Two modes: **best first** (palette, the panel's search) and **keep the order** (trees, Media newest first).
- Adapters turn what is held into entries (`id`, `title`, `hint`, `keywords`, `group`): pages (title, address as hint), files (name, path), pictures (file name, description, collections and on-page descriptions as keywords), online videos.
- Switch the palette (`src/controllers/command-palette-controller.ts`) and Media (`filterMediaLibrary`, `filterOnlineVideos` in `src/page-builder/media-library-filter.ts`) to it. Media keeps its kind, collection and order rules.
- Nothing visible changes except Media now also finding by word starts.

## Files

Expected: `src/search/match.ts` and `src/search/adapters.ts` (new), `src/page-builder/palette-search.ts` (removed or a re-export), `src/page-builder/media-library-filter.ts`, `src/controllers/command-palette-controller.ts`, unit tests (moved and new: middle-of-word ranks below word start; narrowing gives the same results as a fresh search).

## Done when

- The palette's and Media's existing tests pass; new tests cover the ranking rule and narrowing.
- A unit benchmark on a generated 500-page site stays under 16 ms per key press on this machine (the number is in Done).

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-ss-11 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ss-11 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md); everything here loads lazily).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
