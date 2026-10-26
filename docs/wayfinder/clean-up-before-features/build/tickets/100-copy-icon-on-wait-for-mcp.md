---
title: "A copy icon beside Wait for MCP"
type: task (AFK)
status: open
assignee: lead-100 (child thread)
builder: claude
blocked_by: []
---

## Goal

Lex (2026-10-26, after his check passed): "can we add a copy icon besides wait for mcp so that people have an idea that there is something to copy." Only on **Wait for MCP** (Lex chose that over both buttons); Connect to MCP and Disconnect MCP stay as they are.

## Decided behaviour

- While the project menu's MCP button offers **Wait for MCP**, a small copy icon sits beside its label (the Phosphor `copy` icon already in `src/icons.ts`), in the label's colour and size like other icon+label buttons in the editor; decorative (`aria-hidden`), the label stays the accessible name.
- When the label briefly reads "Copied" or another confirmation, and for the other two actions, no icon.
- Nothing else in the menu moves; no explainer text.

## Files

`src/components/agent-menu.ts`, its CSS, `docs/agents/features.md` (F-agent-02 Good/Files).

## Done when

- The icon shows only for Wait for MCP; `npm run check`, `kit unit --affected` green. **No new tests** (Lex: "we don't need tests for that change"); existing specs must still pass in `kit pr`.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Lead-built in a T3 child thread: edit directly (no builder CLI needed for this size), `kit shots` of the menu at 390 and 1280 px light and dark, `kit pr --ticket <this ticket>`.
