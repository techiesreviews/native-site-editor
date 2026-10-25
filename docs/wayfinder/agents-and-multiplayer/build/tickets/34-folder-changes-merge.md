---
title: "Folder changes merge too"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [33-outside-changes-fold-in]
---

## Goal

Local folders use the same merge instead of "the folder wins".

## Decided behaviour

[Ticket 09, item 3](../../tickets/09-grill-outside-changes-live.md#resolution-2026-10-24). **Waits for the local-folders build** (`docs/wayfinder/local-folders/`, unbuilt on 2026-10-25); the lead re-plans this slice if that build has not shipped when stage 3 starts.

## Files

Expected (confirm while designing): the local-folders source seam once built (`FileSystemObserver` changes feed `src/outside-merge.ts`); tests.

## Done when

- A spec with a fake folder: an outside write to other lines merges into drafts, and a clash shows the folder's version with Lex's words one Undo away.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-34 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-34 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
