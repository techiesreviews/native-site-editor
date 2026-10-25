---
title: "The page: typing goes out letter by letter, carets on the page"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [22-code-pane-together]
---

## Goal

Typing together on the visual page, as in the [demo](../../prototypes/08-typing-together.html).

## Decided behaviour

[ADR 0003](../../../../adr/0003-shared-editing-over-a-store-nothing-relay.md) decision 3 and [ticket 12](../../tickets/12-prototype-typing-together-poc.md#resolution-2026-10-25):

- Typing in the preview reaches the shared copy letter by letter (today it reaches the source on click-away).
- Others' carets show in the page's text with the shared caret look, and no element highlight.
- An agent's change replacing the element someone types in waits until they click away (clean-up slice 52).

## Files

Expected (confirm while designing): `src/components/native-preview-runtime.js`, `src/components/native-preview.ts`, `src/components/preview-protocol.ts`, `src/native-source-location.ts` (source offset to rendered text), `src/components/live-carets.ts`; a two-context spec `tests/native-save/native-page-together.spec.ts`.

## Done when

- A spec: both type in one paragraph on the page and end identical; carets show in the page's text.
- An agent's heading change waits while Lex types in the heading and lands after he clicks away.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-23 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-23 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- Big, delicate slice: one second-opinion review of the final version (`ASE_REVIEW_MODEL=grok-4.7` or `gpt-6.1-sol` `kit review --ticket <this ticket>`), within the weekly budget.
