---
title: "Media's One bar: a + button and one Filter menu"
type: task (AFK)
status: open
assignee:
blocked_by: [107-tiles-list-phone-bar]
builder: claude
phase: 8
---

## What

Lex's answers to the audit's [Q1 and Q2](../ux-ui-audit.md#questions-for-lex) (2026-10-15).

- A visible "+" button in Media's One bar, beside More, opens the file chooser (same path as "Add new file"); dropping files anywhere still adds them. 44 px target; label "Add files" for screen readers. "Add new file" leaves More.
- The Collections menu becomes **Filter**: collections first, then Show (All, Images, Video, Audio, Documents) and View (Grid, List). Its trigger shows the active choice in short ("All", "Garden · Video").
- More keeps only the tools: Clean up, Improve images, To check, Recently removed, Adding settings (with their counts).
- The picker gets the same + and Filter where it lists media.

## Done when

- Specs: + opens the chooser and the added file shows at the top (slice 103); Filter switches collection, kind and view; More has exactly the five tools.
- Shots of the One bar, Filter open and More open at 390, 768 and 1280, light and dark, before and after (`scripts/agents/shots.sh`).
- `npm run check`, `npm run lint`, unit tests, the touched browser specs; new code stays lazy (boot budget unchanged).
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.
