---
title: "Search in Pages, Media and Files"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [11-one-search-matcher]
---

## Goal

One search field in the left panel finds pages, pictures and files as you type ([ticket 06](../../tickets/06-grill-search.md#resolution-2026-10-26)). Lex asked for search in Pages and files on 2026-10-16. Size: M.

**Waits for** [atomic-catalogue build slice 66](../../../atomic-catalogue/build/tickets/66-organism-top-bar.md) (top bar version B, whose left panel has the search field slot) to be released.

## Decided behaviour

- The field sits in the panel's one header row (catalogue slice 66). Typing shows one list grouped under **Pages**, **Media** and **Files**, filtering as you type with the shared matcher (slice 11), best first within each group, matched letters marked.
- What it searches: page titles and addresses, file names and paths, picture names, descriptions and collections. If Media was never opened, `.editor/media.json` is read on the first key press (one small file), so first paint doesn't slow.
- Clicking a result opens it: a page in the editor, a picture in Media, a file in the code pane. Keyboard: arrows move, Enter opens, Esc clears and returns to the panel's segment.
- No counts on group headings; an empty result says nothing extra beyond the empty list (UX rulebook S1). Per-group limits as in the palette (`src/components/command-palette.ts`), and only rows on screen are drawn.
- Text inside pages stays out (Lex, 2026-10-16 and 2026-10-26).

## Files

Expected: `src/pages-and-files-explorer.ts` (or the panel organism from catalogue slices 52 and 66), a new `src/search/panel-search.ts`, CSS, a spec `tests/native-save/native-panel-search.spec.ts`.

## Done when

- A spec types a page title, a picture description (before Media was opened) and a file name, and opens each result.
- `docs/agents/features.md` gains the search feature.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-ss-20 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ss-20 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md); everything here loads lazily).
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
