---
title: Agents place, swap, describe and collect
type: task (AFK)
status: closed
assignee: claude (mm-21 runner)
blocked_by: [18-media-picker, 20-agents-see-media, 15-collection-records]
builder: sol
phase: 1
---

## What

Ticket [13](../../tickets/13-what-agents-may-do.md#resolution-2026-10-13) and [15](../../tickets/15-collections-and-file-names.md#resolution-2026-10-14) "Agents". Each change is an ordinary unsaved change the user can undo; no extra Yes/No.

- **Place and swap** a media file already in Media into a place, with exactly the markup the editor writes (the picker's placing code).
- **Describe**: set a file's description or a place's own words, or mark Decorative; agent text carries the by-agent mark.
- **Collections**: create, rename, delete, add to, take out of.
- Never upload, fetch or generate media.

## Done when

- `tests/mcp-runtime.test.ts`: each tool, a refused upload-like call, the by-agent mark set.
- `@smoke` `tests/native-save/native-mcp-media.spec.ts`: with the editor open, a client lists media, places an image on the home page and writes its description; the canvas shows it, To check lists it, Undo removes it.

## Done (2026-10-14)

- **Behaviour.** Three MCP editing tools, applied by the open editor tab as ordinary unsaved changes, each one Undo step, no extra Yes/No. **`place_media`** `{ path, element, file }` fills an existing `<img>` on a page with a file already in Media through the picker's own placing code, now shared in the lazy `src/page-builder/media-place.ts` (`placeMediaImage`, also used by the picker's Use): same markup, alt rules, Decorative carry-over and stale checks. **`describe_media`** `{ file, text | decorative, page?, element? }`: a file description (places that follow it update, `description.byAgent` set), file Decorative, a place's own words (`places[page].agentText`, page and records in one batch) or place Decorative (`createMediaWorkspace().describe`). **`change_collection`** `{ action: new | add | take-out | rename | delete, name, to?, files? }` runs Media's `collections(change)`; taken names refuse, delete keeps files, works with no page open. Agents never bring media in: web/data/blob addresses and files not in the site are refused, and `write_file` refuses binary media paths (SVG text stays writable). `MEDIA_RECORDS_REFUSED` now names `describe_media`, `change_collection` and `list_media` (slice 07 follow-up). `docs/mcp.md` lists the tools (26). Tab code is in lazy chunks (`src/agent-media-actions.ts`).
- **Assumptions (★).** Placing fills an existing `<img>` (the editor has no other placing code); agents make new image places with sections/components first. One by-agent mark per file on a page (slice 13's place): an element-targeted description is refused while another image of the file there still shows different unchecked agent words.
- **Commits.** d9622af5 claim; 7af02423 build (Sol; runner reworked the smoke spec to write the file's description, as the ticket asks, and to refuse a web address); 3f0475fd review fixes.
- **Tests.** `tests/mcp-runtime.test.ts`: the three tools listed with editing annotations and queued args; refusals before queueing (web/data addresses, non-images, `.github`, `.editor/media.json`, bad collection args); `write_file` to `images/new.png` refused, SVG still accepted; the refusal message names the tools. `tests/media-workspace.test.ts`: by-agent file descriptions flow to places and undo with records; own words and place Decorative one batch; file Decorative never clears an unchecked description; blanks, outside files and unused pages refused without writing; every collection action with Undo; every-use own words keep one row. `tests/media-descriptions.test.ts`: swap moves an agent's own-words mark; stranded-words rule. `tests/media-controller.test.ts`, `tests/agent-media.test.ts` extended. New `@smoke` `tests/native-save/native-mcp-media.spec.ts`: a picture added through Media, then the client lists it, writes its description, places it on the home page; the canvas shows it with the words, To check (1) lists them, one Undo restores the page. `npm run check`, `npm run lint`, unit 2522/2522; browser `native-mcp-media`, `native-mcp`, `native-media-picker`, `native-image-alt-refusal`, `native-structure` 26/26, after review fixes 9/9.
- **Review (GPT-6.1 Sol).** Fixed 2 (P2): different words for two images of one file on a page overwrote the single mark (now refused); a swap that kept agent words left their mark on the old file (now moves). Rejected 0. Not re-reviewed: small fixes, fully tested.
- **Bytes.** First paint 342 KB of 355 KB. Same-sitting build against origin/dev 14941bb3: entry JS +609 B gzip, all first-paint assets +0.7 KB, CSS unchanged.
- **Follow-ups.** Placing an undescribed file writes the name-fallback alt, which slice 13's rule then treats as own words, so a later file description does not reach that place (describe first, then place); slice 22's Media chapter should say so, or a later slice can treat name-fallback alts as following. Slice 22 writes the Media chapter the tool descriptions point to.
