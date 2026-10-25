---
title: "Each open file has a shared copy"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [20-live-rooms-relay]
---

## Goal

A file open by two or more participants is held as a Yjs copy that merges everyone's changes, while drafts stay in the browser as today.

## Decided behaviour

[ADR 0003](../../../../adr/0003-shared-editing-over-a-store-nothing-relay.md) decisions 1 and 2 and its Proven section:

- Yjs on plain source text.
- The starting text enters under a client id derived from the file's Git blob sha.
- A late joiner catches up from a participant who is online.
- Drafts (`src/draft-store.ts`) follow the shared copy.
- Yjs loads only when a live room opens.

## Files

Expected (confirm while designing): a new `src/live-text.ts`, `src/draft-store.ts`, `src/native-site-runtime.ts`, `src/main.ts` (wiring only, ceiling test), `kit deps add yjs y-protocols`; unit tests and a two-context spec `tests/native-save/native-live-text.spec.ts`.

## Done when

- A two-context spec: both edit one file and end identical; a late joiner catches up; two people opening an empty room at once do not double the text.
- `kit size` shows boot unchanged and Yjs in a lazy chunk.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-21 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-21 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- Big, delicate slice: one second-opinion review of the final version (`ASE_REVIEW_MODEL=grok-4.7` or `gpt-6.1-sol` `kit review --ticket <this ticket>`), within the weekly budget.
- `kit size` RESULT quoted.
