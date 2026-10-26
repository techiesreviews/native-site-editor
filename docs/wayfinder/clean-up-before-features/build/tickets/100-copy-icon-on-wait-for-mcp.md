---
title: "A copy icon beside Wait for MCP"
type: task (AFK)
status: closed
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

## Done (2026-10-26)

- Behaviour: while the project menu's MCP button offers Wait for MCP, the Phosphor `copy` icon (14 px, `icon--after`, `aria-hidden`) sits right after the label in its colour; the brief "Copied" confirmation, Connect to MCP and Disconnect MCP show no icon. The button's accessible name is unchanged, so existing specs need no change; no CSS added (the shared `icon--after` rule in `src/icons.css` places it). `src/components/agent-menu.ts`; `docs/agents/features.md` F-agent-02 Good/Files updated.
- Checks: `npm run check` green; `kit unit --affected` 720/720 (28 files). No new tests (Lex).
- Shots: `kit shots --steps .scratch/wait-for-mcp.json --width 390,1280` (light, dark): `.scratch/shots/lead-100/20261026-130921/contact.webp` in the main checkout. The icon reads as part of the label in both themes, like the ↗ on the links above it. Layout findings are the menu's existing 32 px tap targets at 390 px, unchanged by this ticket.
- Commit: cdb7af8e8 (code and docs).
