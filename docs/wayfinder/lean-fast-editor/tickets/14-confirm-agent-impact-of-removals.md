---
title: Confirm the agent/MCP and shared-code impact of the removals
type: research (AFK)
status: open
assignee: claude (research subagent)
blocked_by: [07-what-is-left-after-removals]
---

## Question

With the removal boundaries fixed (ticket 07), does anything outside the style panel, collections and Page Fields depend on what goes? Known so far: no MCP tool mentions collections or the style panel, but the style cascade (`src/style-cascade.ts`, `shared/cascade.ts`, `resolveSelectedRules`) is also used by the image focal point (`main.ts:1803`), `linkedRules` (`main.ts:1266`), static sections and slotted CSS, and the MCP measure tool reports matching CSS rules. List what must stay, what moves, and any MCP tool descriptions or conventions text (`worker/site-conventions.ts`) that mention removed features.
