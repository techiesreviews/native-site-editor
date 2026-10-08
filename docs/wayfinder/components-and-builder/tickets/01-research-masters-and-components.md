---
title: Inventory the shared masters, page parts and components in use
type: research (AFK)
status: open
assignee: claude (research subagent)
blocked_by: []
---

## Question

Before deciding how `.editor/sections` masters convert to components, what exists today? List every `.editor/sections/*.html` master, `.editor/page-builder.json` `reusableSections`/`pageParts`/page `sections` entry, and `components/*/` component in techies-reviews (`~/Projects/techies-reviews`), the starter (`~/Projects/native-site-editor-starter`) and `fixtures/`. For each master, say which pages use it and whether it would convert cleanly to a custom element with whole-element slots. Map every place in the editor and the Worker that reads or writes masters (`nativeSharedRoot` in `src/main.ts`, `planNativeSharedSection`, `planSavePagePart`, sidecar code, MCP `add_section`, `worker/site-conventions.ts`) and what breaks when they go. Also note what a header/footer loses as a component when JS is off (nav links that live only in a shadow template), and whether slotting the nav links keeps them in the page HTML.
