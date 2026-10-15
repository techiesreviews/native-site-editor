---
title: Rewrite the media docs
type: task (AFK)
status: open
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
