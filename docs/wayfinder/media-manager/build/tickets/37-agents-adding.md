---
title: Agents place with the same markup and may change settings
type: task (AFK)
status: closed
assignee: claude (mm-37 runner)
blocked_by: [33-placed-image-markup, 26-adding-settings, 22-media-chapter-and-mcp-docs]
builder: sol
phase: 2
---

## What

Ticket [13](../../tickets/13-what-agents-may-do.md#resolution-2026-10-13) "Placing and framing" and "Settings".

- Agents' placements (slice 21) write exactly slice 33's markup, including copies for older images (slice 35).
- A tool to read and change the site's adding settings, shown and undoable like other agent changes.
- Media chapter: phase 2's rules (folders and names, the markup is the editor's, settings); starter `AGENTS.md`, `fixtures/actual-starter` and the vendored copy refreshed in this slice.

## Done when

- `tests/mcp-runtime.test.ts`: an agent placement equals the editor's markup for the same place; the settings tool changes and reports settings.
- The drift test passes.

## Done (2026-10-14)

- **Behaviour.** Agent placement and the picker's Use now build the placed image with one function, `mediaImageForPlacement` (lazy `media-markup.ts`: the file, its decoded size and its Image family's copies), and both go through `placeMediaImage`, so an agent's `place_media` writes exactly the editor's markup (srcset, measured sizes, width/height, decoding, loading order and `fetchpriority`, `<picture>` clean-up, description rules). The agent path's own records read for the alt was unused (`placeMediaImage` decides the alt through `swapPlaceImage`) and is gone; the picker still sets its alt for component and Site settings fields. New MCP tool **`adding_settings`** `{ image?, video?, audio?, keepOriginal?, reset? }` (27 tools): with no choices it reads; choices or `reset` change the site's Adding settings through the open tab's media workspace `adding()`, one Undo step labelled "Agent changed adding settings" / "Agent reset adding settings"; a change that changes nothing writes nothing. It returns the settings, whether they are the defaults, and each kind's choices with their plain hints. Invalid values, and `reset` with choices, are refused before queueing; unreadable records read as the defaults with a note and refuse changes. The choice names now live once in `shared/media-records.ts` (`MEDIA_ADDING_VALUES`), used by the record parser, the worker's schema and `MEDIA_ADDING_CHOICES`. `MEDIA_RECORDS_REFUSED` names `adding_settings`.
- **Media chapter.** New `### Folders and names` (`media/<kind>/`, tidy names, `-480/-960/-1600` copies, originals in `media/originals/`, place the main file only), `### The markup is the editor's` (what place_media writes; no hand-written attributes or `<img>` for Media files) and `### Adding settings`; the records bullet names adding settings; the Links and files line no longer says every image lives in `images/`; `siteInstructions` and `docs/mcp.md` mention adding settings.
- **Starter.** `AGENTS.md` on the starter's `dev` carries the chapter word for word, and its own layout notes name `media/<kind>/`: starter commit `238b4d6` (pushed `HEAD:dev` under the lock). `fixtures/actual-starter` re-archived from it (only `AGENTS.md` changed); vendored preview copy `va4b2f44` → `v238b4d6` (`NATIVE_STARTER_VERSION`), generated from the starter's tracked files by a script that first reproduced `va4b2f44` byte for byte. Provenance and source docs updated.
- **Commits.** a55a31ca claim; 2cc73549 build (Sol; runner straightened curly apostrophes); 85bd1626 starter refresh (runner); close.
- **Tests.** `tests/mcp-runtime.test.ts`: an agent placement equals the editor's for the same place (the real picker Use through `chooseImage` and the real agent path through `applyAgentMedia`/`preparePlacement`, identical page and records text) for plain and `<picture>` places, first-screen or not, Decorative or not, with srcset, measured sizes, width/height and loading checked; the tab reads, changes and resets settings with agent labels, no empty Undo step, Undo restoring, unreadable records; the tool is listed with editing annotations, refuses bad values and reset with choices, queues its args and returns the report; the served chapter names `adding_settings`, `media/images/` and `srcset`. `tests/media-settings.test.ts`: agent labels and no-op changes. Browser (not `@smoke`) `native-mcp-media.spec.ts`: an agent sets Smaller files, the Adding settings screen shows it, one Undo restores the defaults. Ran `npm run check`, `npm run lint`, unit 2822/2822 (drift test included); browser `native-mcp-media`, `native-mcp`, `native-media-picker`, `native-image-markup` 32/32, `@native-static` 2/2, `@actual` 58/58.
- **Review (GPT-6.1 Sol, read-only `codex exec` through `review.sh`).** Evidence: main checkout `.scratch/reviews/mm-37/round-1/` (`run.log`: model gpt-6.1-sol, sandbox read-only; `result.md` starts `REVIEW_STATUS: complete`; Sol's nested codex exec failed in the sandbox, which is harmless). Fixed 0. Rejected 1 (P2, "older images receive no responsive copies", with its test gap): that is slice 35's own ticket (Copies for older images; open, being built in parallel). This slice routes agents through the same placement code so slice 35's copies reach them; the chapter promises nothing slice 35 has not landed.
- **Bytes.** `test:budget` 345 KB gzip before first preview paint of 355 KB. Same-sitting `build:ui`: boot entry JS +138 B gzip (the shared choice names and the operation in `shared/agent.ts`); tab-side code is in the lazy `agent-media-actions` and media chunks.
- **Follow-ups.** Slice 35: hook its copies into the shared placement path (`mediaImageForPlacement` / `placeMediaImage`), not the picker alone, and add the agent case to this slice's equality test in `tests/mcp-runtime.test.ts`; it may add a chapter line once copies for older images land. Later agents slices (45, 55, 69, 75, 81) refresh the starter the same way; `.scratch/vendor-starter.mjs` was a throwaway, the steps are in `docs/native-starter-source.md`.
