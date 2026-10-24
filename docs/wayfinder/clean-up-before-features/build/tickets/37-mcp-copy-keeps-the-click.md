---
title: "Connect to MCP copies the prompt on the preview editor"
type: task (AFK)
status: open
assignee: lead-37 (this session)
builder: claude
blocked_by: []
---

## Goal

Lex (2026-10-24, on preview-editor.techies.tools): "the MCP connect doesn't copy the prompt." `src/components/agent-menu.ts` `copyPrompt()` (~line 699) calls `navigator.clipboard.writeText(...)` only after awaits (`readConnections`, the connect request), so the browser no longer treats the write as part of Lex's click (transient user activation lost; Safari always refuses, Chrome after a delay), the write throws, and only the problem dot shows.

## Decided behaviour

- Pressing **Connect to MCP** or **Wait for MCP** always puts a working prompt on the clipboard and the button confirms ("Copied"), in Chrome, Edge, Safari and Firefox.
- Start the clipboard write synchronously inside the click handler with `navigator.clipboard.write([new ClipboardItem({ "text/plain": promiseOfBlob })])`, where the promise resolves to the prompt once the token is known; fall back to `writeText` where `ClipboardItem` with a promise is not supported. Keep the token-safety rules and the Wait-for-MCP rules from slices 29 and 35.
- If the token request fails, nothing is copied and the button shows the problem (no toast), as today.
- Coordinate with slice 35 (its "Connect to MCP retry race" fix touches the same function): rebase onto it if it landed first.

## Files

- `src/components/agent-menu.ts`
- `tests/native-save/native-mcp-menu.spec.ts` (a spec where the token request is held for several seconds before it answers, and the copy still lands; grant clipboard permissions in the spec context)

## Done when

- The new spec fails before the fix (held token request, then no copy) and passes after; the existing MCP menu specs pass.
- `kit unit --affected`, `kit specs --affected`, `npm run check` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-37 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`.
