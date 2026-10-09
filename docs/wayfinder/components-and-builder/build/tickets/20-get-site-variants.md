---
title: "MCP: get_site lists variants"
type: task (AFK)
status: closed
assignee:
blocked_by: [12-variant-parser-site-css]
builder: sol
phase: 2
---

## What

Ticket [05](../../tickets/05-what-agents-are-told.md) §5: `get_site` (`worker/mcp.ts:309`) lists each component's variants using the shared parser (slices 11–12) on the component CSS and the site stylesheets, in the Worker. No `set_variant`.

## Done when

- `tests/mcp-runtime.test.ts`: `get_site` returns each component's variants (attribute, values, yes/no, conditions) for a fixture with component, site and global variants.

## Done (2026-10-09)

- `get_site` gives each component `variants` (and `variantWarnings` when any), read in the Worker by `worker/site-variants.ts` from the component CSS, the linked stylesheets with their imports and the site's scripts, drafts applied, saved texts batched (`SiteFiles.texts`). A read failure leaves variants out with a note; missing imports are skipped. `scriptSetAttributes` in `shared/variants.ts` feeds the component-CSS exclusion.
- Built by Sol, restructured by Claude (reading moved out of `worker/mcp.ts`). Commits 91e83f5, review fixes after.
- Tests: `tests/mcp-runtime.test.ts` (component, site, global and script-excluded variants with conditions; drafts, failures, no reads without a native site, batched reads), `tests/variants.test.ts` (script-set attributes).
