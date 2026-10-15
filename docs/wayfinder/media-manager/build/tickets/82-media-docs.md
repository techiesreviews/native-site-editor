---
title: Rewrite the media docs
type: task (AFK)
status: closed
assignee: claude (mm-82 runner)
blocked_by: [81-github-pages-and-rules]
builder: sol
phase: 7
---

## What

Research 04 found `docs/page-builder/media.md` and `asset-references.md` partly out of date (`media.md:22-24`, `:116-117`, `:147-148`; `asset-references.md:6-8`, `:47-51`). Each slice updated what it changed; this slice rewrites them whole for the finished build.

- `docs/page-builder/media.md`: adding, families, markup, the popup, clean-up, video and audio, sub-folder sites.
- `docs/page-builder/images-pane.md`: the Media screen (keep the file name so links hold ★, or rename with every link updated).
- `docs/page-builder/asset-references.md`: the wide scanner, rename, Replace everywhere, the prefix.
- `docs/mcp.md`: every media tool, checked against the server's list.
- Use the `CONTEXT.md` terms; plain English.

## Done when

- Every code path and symbol named in the three docs exists (spot-checked by `grep`); `docs/agents/code-map.md` and its test still pass.
- The map's Decisions and ticket 14 record the finished build.

## Done (2026-10-15)

- **Behaviour.** Docs only. `docs/page-builder/media.md` (adding, Adding settings and limits, Keep original, Image families and `.editor/media.json` fields, placed-picture markup, the image popup and Social image, Clean up and Recently removed, video/audio/Online videos/downloads, Improve images, sub-folder sites and batches), `images-pane.md` (the Media screen; file name kept so links hold: tiles and One bar, newest first, collections, File details, the picker, list view and phones, code entry points), `asset-references.md` (the wide use check, Rename everywhere, Keep the old address working, Replace everywhere, Files operations, the Site address prefix) and `docs/mcp.md` (36 tools from 34 registrations; every media tool's inputs checked against `worker/mcp.ts`) are rewritten for the finished build (slices 01–81 and fix slices 84–103), from every closed ticket's Done section and the code. Covers the lead's list: newest first with the Added date (103), the shared player-file writer and the stylesheet reader that cannot loop (101), Online video stills in their video's family (100), Site address in Site settings → General and site-wide sub-folder support (76–81).
- **Decisions recorded.** The map's Decisions and wayfinder ticket 14's Comments record the finished build and Lex's 2026-10-15 decisions: no HEIC reader for Chrome/Firefox (they are asked to save as JPEG; `build/mm-29-heic-decoder` stays parked) and no `@mediabunny/aac-encoder` (files whose sound cannot be converted are offered unchanged).
- **Commits.** f9ce1712 claim; 2586695a rewrite (Sol, with the runner's fixes: decision lines placed in order, a quoted label that does not exist reworded); 997a84f5 review fix; close.
- **Tests.** A scratch checker (`.scratch/check-doc-symbols.mjs`, not landed) verified every backticked name in the four docs: 202 names (paths exist, code names found by grep, record fields in `shared/media-records.ts`, tool names and inputs in `worker/mcp.ts`), 45 relative links and every heading anchor: zero misses. The runner also checked the visible labels and numbers quoted in plain text against `src/`. `tests/code-map.test.ts` and `tests/mcp-runtime.test.ts` 47/47; `npm run check`, `npm run lint` (302 tickets) pass. No browser specs: no code changed.
- **Review (GPT-6.1 Sol, read-only, one round).** 1 P2 fixed: Replace everywhere does rewrite paths in `_headers` (without the new-version mark), which the doc said it left alone. Nothing rejected. Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-82/`.
- **Bytes.** Docs only: boot and lazy chunks unchanged (0 bytes).
- **Follow-ups.** None. Ticket 89 (UX/UI audit by the lead) follows.
