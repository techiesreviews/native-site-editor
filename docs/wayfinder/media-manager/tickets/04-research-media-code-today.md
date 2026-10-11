---
title: Research today's media code and what to keep
type: research (AFK)
status: open
assignee: claude (research subagent)
blocked_by: []
---

## Question

Map everything in the editor that touches media files today, so later tickets and the handoff know what to keep, merge and delete. Cover: every entry point (edit bar Choose image… and alt text warnings, canvas double-click and drop, the Images tab, Structure slot and component panel Upload image…, Site settings image upload, file tree uploads and drops) and which code path each takes; `src/page-builder/media-library-view.ts` (what it does, how dense it is, natural seams to split it on); the legacy parts of `media-workspace.ts`; `media-optimise.ts`, `media-markup.ts`, `media-references.ts`; `.editor/media.json` (its shape and what it stores); how bytes go from IndexedDB through Publish and `/api/blob`; how rename rewrites references; how Delete unused decides (and every blind spot: `.json`, `.js`, `.xml`, `_redirects`, runtime URLs, component templates, files in folders other than `images/`); how Undo groups media actions into one draft batch; the MCP tools in `worker/mcp.ts` and the site conventions text about images; the unit and e2e tests that cover media; and `docs/page-builder/media.md`, `images-pane.md`, `asset-references.md`. Give file:line references and end with a list of what is reusable as is, what needs reshaping, and what is dead.
