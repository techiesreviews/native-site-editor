---
title: "Outside changes fold in"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [32-github-push-to-tabs]
---

## Goal

What Lex sees when a page changes outside the editor.

## Decided behaviour

[Ticket 09, items 1 and 2](../../tickets/09-grill-outside-changes-live.md#resolution-2026-10-24):

- With no unsaved changes, the page updates in place with a brief outline and an author chip that fades, and no message.
- With unsaved changes, a three-way merge against each draft's starting text; different lines merge by themselves.
- On a true clash the latest version shows, and Lex's clashing words stay one Undo away.
- In a live room, the outside change enters as one more participant.
- Mock-up for Tuesday 3 Nov: [15-outside-changes-and-preview-link.html](../../prototypes/15-outside-changes-and-preview-link.html)

## Files

Expected (confirm while designing): a new `src/outside-merge.ts`, `src/draft-store.ts`, `src/live-text.ts`, `src/agent-presence.ts` (the author chip), `src/guarded-edit/commit.ts`; unit tests for the merge and a spec.

## Done when

- Specs: a push to an open page with no drafts updates it with the chip; a push touching other lines merges into drafts; a clash shows the latest and one Undo brings back Lex's words.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-33 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-33 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
