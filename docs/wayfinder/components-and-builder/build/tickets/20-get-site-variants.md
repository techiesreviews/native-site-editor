---
title: "MCP: get_site lists variants"
type: task (AFK)
status: open
assignee:
blocked_by: [12-variant-parser-site-css]
builder: sol
phase: 2
---

## What

Ticket [05](../../tickets/05-what-agents-are-told.md) §5: `get_site` (`worker/mcp.ts:309`) lists each component's variants using the shared parser (slices 11–12) on the component CSS and the site stylesheets, in the Worker. No `set_variant`.

## Done when

- `tests/mcp-runtime.test.ts`: `get_site` returns each component's variants (attribute, values, yes/no, conditions) for a fixture with component, site and global variants.
