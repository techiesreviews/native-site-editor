---
title: "Connect to MCP copies the prompt on the preview editor"
type: task (AFK)
status: closed
assignee: lead-37
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

## Done (2026-10-24)

- Pressing **Connect to MCP** or **Wait for MCP** now starts the clipboard write inside the press (`navigator.clipboard.write` with a `ClipboardItem` whose text arrives once the token is known), so a slow token or connections check no longer loses the copy. Where that write is not supported or refused, the prompt is written with `writeText` once known; if that is refused too, the problem dot shows, as before. A press that ends with no prompt (failed token request, another site shown) leaves the clipboard as it was. Disconnect MCP starts no copy.
- `tests/native-save/native-mcp-menu.spec.ts`: new spec holds the token request (then the Wait for MCP connections check) for 6 seconds in a browser that refuses copies begun outside the user's press; it failed on the old code (no "Copied") and passes now. The refused-copy spec now refuses both clipboard writes.
