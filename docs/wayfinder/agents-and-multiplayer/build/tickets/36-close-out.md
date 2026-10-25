---
title: "Close-out: checklist, docs, delete the proof of concept"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [31-collaborators-join, 33-outside-changes-fold-in, 35-hot-preview-link]
---

## Goal

Finish the build.

## Decided behaviour

- Lex's webhook checklist is done and a test push reached a tab.
- `CONTEXT.md` has Live room, Preview link and Helper; `docs/agents/code-map.md` and `docs/mcp.md` are current.
- ADR 0003 status is set to accepted.
- The throwaway Worker is deleted: `npx wrangler delete --name am-typing-together-poc` (ticket 12; it also serves `/mockups/`).

## Files

Expected (confirm while designing): `CONTEXT.md`, `docs/agents/code-map.md`, `docs/mcp.md`, `docs/adr/0003-shared-editing-over-a-store-nothing-relay.md`.

## Done when

- `tests/code-map.test.ts` passes.
- The delete command's output is quoted in Done.
- The lead tells Lex the stage-3 preview is ready for his end check.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-36 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-36 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
