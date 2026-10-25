---
title: "Saving with several editors"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [21-shared-copy-per-file]
---

## Goal

Save to GitHub with shared changes.

## Decided behaviour

[ADR 0003](../../../../adr/0003-shared-editing-over-a-store-nothing-relay.md) decision 6 and [ticket 08](../../tickets/08-grill-shared-editing-mechanism.md#resolution-2026-10-24):

- Whoever presses Save to GitHub saves everyone's changes in those files.
- The commit names every author (people and agents), as `Co-authored-by` lines where an address is known, otherwise by name in the message.

## Files

Expected (confirm while designing): `src/controllers/save-publish-controller.ts`, `worker/publish.ts`, `src/live-text.ts` (authors per file); tests.

## Done when

- A test: two authors' changes saved by one person become one commit naming both.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-26 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-26 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
