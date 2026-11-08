---
title: "Synced session: Share live"
type: task (AFK)
status: closed
assignee: fleet-lead
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
- Mock-up approved by Lex (2026-10-27, after his changes): [14-share-live.html](../../prototypes/14-share-live.html)

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

## Done (2026-11-08)

- Share to edit in the project menu (`src/components/repository-menu.ts` `shareItems`, `src/live-session.ts` `createShareControl`): it starts a synced session on the page shown and copies its link, `/live?s=<token>#k=<key>&site=<name>&by=<login>`. The item itself says "Link copied" for 2.5 s with the menu still open (no toast); a copy the browser refuses shows the link in a read-only field to copy by hand. While sharing, the menu offers Copy edit link and Stop sharing, and each guest shows by initial beside the project tile. Every share makes a new token and key. Opening another project or branch stops sharing (`check` after each load); a room that refuses (signed out, no access) says "Couldn't share" on the item.
- The session (`startSharing`): each session has its own relay instance and room, named from the token (`worker/agent-relay.ts` `liveSessionObjectName`). Lex's tab holds it open through `/api/live/share` (editor sign-in and repository access, as file rooms); guests join through `/api/live/guest` with the token alone, and only while a sharing tab is in (`LiveRooms.admits`: agents and guests both need an editor in the room; only an editor makes a key). The room key travels after `#` and is used as given (`src/live-room.ts` `key` option): no handover, so the server never holds it. When the sharing tab leaves (Stop sharing or the tab closing), the relay closes the guests' sockets and the link refuses: a plain request answers 410 "This edit link has ended." (`/live/admits` on the session's Durable Object).
- What guests are sent: each render of the page on show, with every asset their copy lacks (`src/components/native-preview.ts` `mirror`), in parts that fit a room frame and in order (`sessionWire`); only the shown page's body, never the site's other pages, and nothing while History shows an earlier version. A guest who joins, or a reconnect, gets the whole page again. With nobody in, no copy is made.
- What guests send: the text typed in their copy, letter by letter; Lex's tab writes it as its own text change (`guestTextEdit` through the page's own text edit path), so it is his unsaved change and his Undo takes it back, one step per guest's typing. Only text of the page on show counts. Each render tells every guest how much of their typing is written, so their copy keeps the letters still on their way.
- The guest page (`live.html`, `src/live-guest.ts`, `src/live-guest.css`): "Edit <site> with <login>", a name and Join; then a top bar with the site and who is here (the sharer marked, the guest as "you") over the same sandboxed preview frame the editor uses. It loads the frame and the live room only (about 18 KB gzipped, the room code once joined): no sign-in, Save, files, settings or agents exist there. Stop sharing turns it into "This edit link has ended."; a link cut short says "This edit link is not complete." The preview frame's document moved to `src/components/preview-frame-doc.ts` so both pages use it (the build's runtime bundling follows it in `vite-preview-runtime.ts`); `vite.config.ts` builds both pages.
- Not built here: carets on each other's page and the author outline on a picture or look change (the decided behaviour's caret and outline lines), guests changing pictures or sections, a guest's own Undo, and guests moving to another page themselves (they follow Lex's). A brief network drop of Lex's tab ends the session for its guests (the relay sees the sharing socket close).
- Tests: `tests/native-save/native-share-live.spec.ts` (Lex shares; a guest with no sign-in opens the link, types a name and edits the heading; Lex sees it in his page, source and stored draft; the guest page has no Save, publish, settings, files or agent controls and called only `/api/live/guest`; Stop sharing ends the guest's page, the link answers 410 and a late guest is refused; a link cut short); `tests/live-room.test.ts` a synced session's room (a guest refused before the sharing tab, the link's key used with no handover and never crossing the relay, guests closed and refused once the sharing tab leaves); `tests/live-session.test.ts` (link parsing, big renders in parts and in order, a lost frame, one session at a time ending when another project opens or the room refuses). The test server answers the two new routes (`tests/native-save/server.ts`, `fake-websocket.ts`).
- Validation: `RESULT: ok unit 3303/3303 (204 files)`; `RESULT: ok specs 8/8 passed` (native-share-live, native-page-together, native-live-text, native-agent-live, native-code-carets, native-components, native-drop-containers, native-elements-compat); `npm run check` and `npm run lint` clean; `RESULT: ok doctor 11/11 checks passed` (with 5 kit setup pieces reported missing, outside this slice).
- Feature list: F-repo-09 Share to edit. Code map: a Synced sessions row.
