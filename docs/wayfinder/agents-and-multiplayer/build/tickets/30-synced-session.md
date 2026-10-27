---
title: "Synced session: Share live"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [23-page-typing-together, 24-per-person-undo, 25-agents-join-merge, 26-save-several-editors]
---

## Goal

People without an account edit with Lex through a link. Stage 3 starts only after stage 2 is released.

## Decided behaviour

[Ticket 07](../../tickets/07-grill-synced-session.md#resolution-2026-10-24) and CONTEXT.md "Synced session":

- Share to edit in the project menu, then Copy edit link, copies a link: a session token plus the key after `#` (labels changed by Lex on 2026-10-27; no Live badge).
- A guest types a name and edits text, pictures and sections on the pages in the session.
- Only Lex saves, publishes, changes files or settings, and uses agents.
- The session lasts while his tab is open; Stop sharing or closing the tab ends it and kills the link. Every share makes a new link.
- Guests' changes become his unsaved changes. Typing shows only the guest's caret, which stays while she is in the session. A styling, picture or look change briefly shows an outline in her colour with her author chip (Lex, 2026-10-27).
- While a guest types, her caret shows in the page text in her colour, and she sees Lex's. It uses the shared caret look from ticket 23 and mock-up 13 (Lex, 2026-10-27: "we see the caret when people are typing somewhere").
- Mock-up approved with changes by Lex (2026-10-27), changes applied, confirm 3 Nov: [14-share-live.html](../../prototypes/14-share-live.html)

## Files

Expected (confirm while designing): `src/components/repository-menu.ts` (Share live, Stop sharing), a new `src/live-session.ts`, a new guest page entry (a lean route that loads the preview and the live room only), `worker/app.ts` (guest route and token check), `worker/agent-relay.ts`, `src/main.ts` (wiring only); a two-context spec with a guest.

## Done when

- A spec: Lex shares; a guest opens the link, types a name and edits a heading; Lex sees it as his unsaved change. Stop sharing ends the guest's session and the link refuses.
- A guest cannot reach Save, files, settings or agents.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-30 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-30 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- Big, delicate slice: one second-opinion review of the final version (`ASE_REVIEW_MODEL=grok-4.7` or `gpt-6.1-sol` `kit review --ticket <this ticket>`), within the weekly budget.
