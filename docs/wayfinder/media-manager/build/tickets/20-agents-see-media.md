---
title: Agents see media (list and preview tools)
type: task (AFK)
status: closed
assignee: claude (mm-20 runner)
blocked_by: [11-usage-records, 13-descriptions-and-decorative]
builder: sol
phase: 1
---

## What

Ticket [13](../../tickets/13-what-agents-may-do.md#resolution-2026-10-13) "Seeing media". Agents work through the open editor, as every agent edit does today (`worker/mcp.ts`).

- **`list_media`**: every media file with kind, size, Image family, uses, description (by agent or Decorative), collections, Always keep and Not checked yet.
- **`preview_media`**: a small preview of a picture so an agent can describe it; the open tab makes it (for example a 512 px WebP) ★.
- Tool descriptions point to the conventions' Media chapter (slice 22) rather than restating rules.

## Done when

- `tests/mcp-runtime.test.ts`: both tools in the tool list; `list_media` over a small site with a family, a description and an unchecked file; `preview_media` returns an image for a picture and a clear refusal for a PDF.

## Done (2026-10-14)

- **Behaviour.** Two read-only MCP tools, answered by the open editor tab as `inspect_preview` is (the Worker cannot use `src/` families, usage and descriptions). **`list_media`** (`folder`, `offset`, `limit` up to 200): one entry per Image family (other media one per file; media = every non-text file outside `node_modules/`, `.github/`, `.editor/` and hidden files) with `kind` (image, video, audio, document, other), `size` and family `totalSize`, `family { copies, originals }`, `uses { checked, state, pages, other }`, `description { text, byAgent }` or `decorative` or `described: false`, `collections`, `alwaysKeep`, `draft`; top level `total`, `nextOffset`, `notChecked` (unreadable sources) and a `note` when `.editor/media.json` is unreadable. Pages fit 40 KB by fewer entries, never fewer fields. Records are read through slice 15's `readSiteMediaRecords`, so starting collections show before the first save. **`preview_media`**: a picture (JPEG, PNG, WebP, GIF, AVIF, SVG) drawn at most 512 px on its longest side, WebP (JPEG where the browser cannot encode WebP), at most 96 KB base64, returned as MCP image content plus its sizes; unsaved SVG text previews as the editor has it. Documents, video, audio and other files are refused by the Worker before queueing ("files/menu.pdf is a document (PDF), not a picture; …"). The hub keeps each result up to a per-tool limit (`agentResultLimit`, `shared/agent.ts`) and the tab's acknowledgement route is sized from the largest (`AGENT_RESULT_MAX`); a preview the hub could not keep reports an error. `MEDIA_RECORDS_REFUSED` now names `list_media`. Tool descriptions point to the conventions' Media chapter (slice 22). `docs/mcp.md` lists both tools, `make_component` and the tool count.
- **Commits.** 54964f38 claim; ae611179 build (Sol; runner fixes: the ack route refused anything over 56 KB so real previews stayed pending, a dropped preview reported "applied", hidden files counted as media, unbounded parallel source reads, refusal wording); b16d09ee spec decode without a `data:` fetch (editor CSP); 9226edcb review fix (unsaved SVG text); e848f82f `readSiteMediaRecords` (lead note after slice 15).
- **Tests.** New `tests/agent-media.test.ts` (families with copies and originals, by-agent description, Decorative, collections, Always keep, drafts, Not checked yet, unreadable records, folder and paging, size fitting with UTF-8, kinds and hidden files, workspace reads, starting collections, tab commands and refusals). `tests/mcp-runtime.test.ts`: both tools listed and read-only; `list_media` through the Worker with a report built by the real `mediaListReport` over a site with a family, a description and an unchecked file; `preview_media` image content, PDF/video/audio/`.github` refused without queueing, a full 96 KB preview accepted, oversized results not kept. `native-mcp.spec.ts`: the real tab lists the starter's image with its page use and previews it within 512 px, plus an edited and a new unsaved SVG. `npm run check`, `npm run lint`, unit 2406/2406; browser `native-mcp`, `native-images-tab`, `native-media-library` 39/39.
- **Review (GPT-6.1 Sol).** 1 fixed (unsaved SVG previewed its saved bytes; new unsaved SVG failed), with the suggested browser coverage; 0 rejected. Not re-reviewed: the fix and the records reader change are a few lines each, covered by tests.
- **Bytes.** First paint 346 KB of 355 KB; entry about +0.5 KB gzip (kind and limit helpers in `shared/agent.ts`); the report and preview code is a lazy chunk.
- **Follow-ups.** Raster previews are browser-tested only through SVG (the starter has no raster image); slice 21's `native-mcp-media.spec.ts` smoke test can add a photo. Slice 59 widens the editor's own library to every kind; `list_media` already lists them.
