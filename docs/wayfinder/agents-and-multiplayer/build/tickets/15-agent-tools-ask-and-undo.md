---
title: "Agent tools: ask first, undo its own change"
type: task (AFK)
status: closed
assignee: am-15
builder: claude
blocked_by: [10-exact-part-edits, 13-pin-conversation]
---

## Goal

An agent can ask Lex before it acts, and undo what it did ([mock-up](../../prototypes/10-asking-agents.html)).

## Decided behaviour

[Ticket 06, item 5](../../tickets/06-grill-asking-with-a-pin.md#resolution-2026-10-24) and [ticket 13](../../tickets/13-grill-undo-with-several-editors.md#resolution-2026-10-25):

- `ask_user` puts an orange question pin on an element and returns when Lex answers in the pin card.
- `discard_change` undoes one of the agent's own changes by request id.
- Lex can undo an agent's change with one click from its pin card, or from its chip when it worked without a pin.

## Files

Expected (confirm while designing): `shared/agent-tool-table.ts`, `shared/agent-requests.ts`, `worker/mcp.ts`, `src/agent-tools-edit.ts`, `src/components/agent-pins.ts`, `src/agent-presence.ts`, `src/guarded-edit/commit.ts` (undo of one receipt), `docs/mcp.md`; tests and a spec.

## Done when

- A spec: an agent asks, Lex answers in the pin, the agent continues.
- An agent discards its change and the page is back as before.
- Lex undoes an agent's change from its pin card.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-15 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-15 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).

## Done (2026-10-30)

- **Ask first (`ask_user`).** An agent names a page (default: the one shown) and an element id from get_page, with a question of at most 60 characters. The tab keeps it as a request of its own: the question opens its thread and is its reply, the agent is on it, so its pin is orange with the question and the card names the agent (`agentQuestion`, `shared/agent-requests.ts`; the element from `agentElementAt`, `src/agent-site.ts`). The call is held up to 25 s, like wait_for_requests, until Lex answers in the pin's card; it then returns the answer and the request with its thread, and the agent is on the pin (seen, in its colour) until it answers it with reply_to_request. While an ask waits, a watchdog's wait_for_requests leaves its answer to it; an ask that ran out of time returns `answer: null`, and asking again with `request` waits again (the answer is given again until the agent replies). A dismissed question is refused. The relay and the transport give ask_user the 25-second wait budget and the same wait slots (`worker/agent-relay.ts`, `src/agent-transport.ts`). An agent stopped while its ask waited still gets an answer it took (`src/agent-stops.ts`).
- **Undo of one change.** Each agent change's drafts before and after it are kept in the tab as its receipt commits, text, page, file and Media changes alike (`src/agent-changes.ts`, the latest 40 and 16 M characters, in memory: a reload forgets them). Its undo is a guarded edit that puts the drafts before it back whole (`restore`, in `src/guarded-edit.ts` and `src/guarded-edit/commit.ts`), as one step of its own that Undo and Redo take back and forth. It runs only while every file is still as the change left it; otherwise it is refused, naming the file. The page shown stays open when it is still there; otherwise the change's page, then the home page.
  - `discard_change` (new edit tool, atomic, `next`: check with screenshot_preview): `change` is the requestId of one of the connection's own changes. Another connection's change, or one not kept, is refused in preparation (`shared/agent-edit.ts`). Another site or branch shown is refused on the live page.
  - Lex's Undo: a done (or answered) pin whose reply's requestIds this tab still keeps has Undo in its card. One click puts back the agent's changes for it, newest first, and the button then reads Undone (disabled). A refusal shows in the card. No toast (`src/components/agent-pins.ts`, `src/agent-site-host.ts` `undo`/`undoable`, wired through `native-preview.ts`, `workspace-mount.ts`, `agent-menu-host.ts`, `main.ts`).
  - Not built: Undo from an agent's chip when it worked without a pin (decided behaviour, not in Done when): follow-up [ticket 49](49-undo-from-the-agent-chip.md).
- **Instructions.** The server's instructions name ask_user and discard_change in one sentence (3,773 characters in all). `docs/mcp.md` lists both tools (40 tools).
- Files beyond the expected list: `shared/agent.ts`, `shared/agent-edit.ts`, `src/agent-changes.ts` (new), `src/agent-site.ts`, `src/agent-site-host.ts`, `src/agent-media-actions.ts`, `src/agent-menu-host.ts`, `src/agent-stops.ts`, `src/agent-transport.ts`, `src/agent-watch.ts`, `src/components/agent-menu.ts`, `src/components/native-preview.ts`, `src/guarded-edit.ts`, `src/workspace-mount.ts`, `src/main.ts`, `worker/agent-relay.ts`, `worker/site-conventions.ts`, `docs/agents/code-map.md`. `src/agent-presence.ts` needed no change.
- Tests:
  - New `tests/agent-ask-user.test.ts`:
    - the question pin, held until the answer, and the reply that closes it;
    - a watchdog's wait during the ask gets nothing; once the ask ran out, the watchdog gets the answer;
    - asking again with `request`;
    - refusals: dismissed, missing element, long question;
    - the `asked` action;
    - an answer kept for a stopped agent.
  - New `tests/agent-changes.test.ts` (memory workspace, real receipt):
    - a page edit, a created file and a deleted file undone whole, then Undo and Redo;
    - a change typed over since is refused with nothing written;
    - which page opens after;
    - the 40-change cap;
    - discard_change's preparation and its command's refusals and success.
  - `tests/agent-tool-table.test.ts` (order, next line, atomic list, fingerprint), `tests/agent-tools-edit.test.ts` (discard_change's refusal listed), `tests/mcp-runtime.test.ts` and `tests/agent-menu-host.test.ts` updated.
  - New `tests/native-save/native-agent-ask-undo.spec.ts`, over the real MCP: the agent asks on the hero heading, the pin is orange with its question, Lex answers in the card, the held ask_user returns the answer and the pin turns the agent's. The agent edits the heading and replies done with its requestId. Undo on the done pin's card puts the heading back and reads Undone. An edit then discarded with discard_change leaves the page as before, and a second discard is refused.
- Feature list: F-agent-13 added.
- `RESULT: ok doctor 11/11 checks passed`. `RESULT: ok unit 3815/3815 (255 files)` (`kit unit --affected`). `RESULT: ok specs 6/6 passed` (native-agent-ask-undo, native-agent-pins, native-agent-presence, native-mcp-menu, native-mcp, native-several-agents). `npm run check` and `npm run lint` are clean; boot bytes 344 KB of 355 KB (`npm run test:budget`). `kit specs --affected` and `kit shots` were not run here.

- Review round 1:
  - Whether a change is undone is read from the drafts now, never recorded (`walk`, `src/agent-changes.ts`). The editor's Undo of the pin's Undo brings the agent's change back, the card offers Undo again, and discard_change works on it again. A second discard of an undone change is refused as "undone already".
  - The pin's Undo puts back all of the request's changes as one step, newest first by the order they landed (whatever order the agent listed its requestIds in), whole or not at all: one refused leaves every file as it was (`undoAgentChanges`). The step is said in the status line only, no toast, since the card shows Undone (`quiet` on a guarded edit's plan). Its workspace is proved through the guarded edit (`guard`), so another site or branch shown meanwhile writes nothing.
  - The card's Undo shows whenever this tab keeps the changes (a file changed since is refused in the card, naming it), reads its state each time it is drawn, and has no tooltips (S1, S3).
  - ask_user: a wake during its read looks again at once instead of ending the wait; only the connection whose agent is on a question takes its answer (409 otherwise, the pin stays that agent's).
  - Kept changes are keyed by account too; a change with no connection is not kept.
  - Follow-up: [49 Undo from the agent's chip](49-undo-from-the-agent-chip.md), listed in the build README.
  - Tests:
    - `tests/agent-changes.test.ts`:
      - two changes of one file, ids in either order, undone as one quiet step, and Ctrl+Z brings both back;
      - whole or nothing;
      - already discarded: the Undo does nothing;
      - an await race: another branch shown at each await, nothing written;
      - Ctrl+Z and Redo following the state;
      - typed fakes.
    - `tests/agent-ask-user.test.ts`:
      - another connection refused;
      - a wake during the read;
      - await races of a new ask and of taking an answer.
    - `tests/agent-media-commit.test.ts`: a Media change is kept and its undo restores all three of its drafts.
    - `native-agent-ask-undo.spec.ts`:
      - with another change on top, the card's Undo is refused in an alert naming index.html, still enabled, no toast;
      - after discard_change of that one, Undo works and reads Undone with no toast;
      - the editor's Undo brings the agent's heading back and the card offers Undo again.
  - Shots (`kit shots --spec .scratch/am15-shots.spec.ts`, real starter, 1280 and 390 wide, light and dark): the orange question pin, its card, the done card with Undo, and with Undone. UX review against the rulebook:
    - the question pin reads in both themes, the agent's chip above it;
    - Undo and Clear sit together as text actions; Undone is disabled with its label alone;
    - no toast after the pin's Undo (the first shots showed "Undid Copy editor's change." as a toast, now quiet).
    One thing to look at: Undo and Clear are small text buttons at 390, as Clear already was.
  - `RESULT: ok doctor 11/11 checks passed`. `RESULT: ok unit 3824/3824 (255 files)` (`kit unit --affected`). `RESULT: ok specs 8/8 passed; 179 more run in kit pr` (`kit specs --affected`). `RESULT: ok specs 4/4 passed` (native-agent-pins, native-mcp, native-guarded-history, native-several-agents). `RESULT: ok shots raw spec`. `npm run check` and `npm run lint` are clean. Boot bytes after round 1: 344 KB of 355 KB, as before it (`npm run test:budget`).

- Review round 2:
  - An agent's discard_change is said in the status line only, no toast, as the pin's Undo is: every undo plan is quiet (`discardPlan`).
  - A pin's Undo offers and undoes only its own agent's changes: of the ids its reply names, those its agent's connection made (`request.agent.grant`, `keptChanges`). Another connection's ids, or a pin with no agent, offer nothing.
  - discard_change's refusal for a change not kept no longer gives "undone already" as a reason (an undone change stays kept and is refused as such later).
  - ask_user stops reading once its call is cancelled. Its loop already ended then (the request tools' proof includes the signal); the check is now explicit before and after the hold.
  - Tests:
    - `tests/agent-changes.test.ts`:
      - a pin naming another connection's change offers nothing;
      - a move (old path, new path, a rewritten link) undone whole, with Undo and Redo back and forth.
    - `tests/agent-media-commit.test.ts`: the Media change's undo runs through the guarded commit (memory workspace holding its drafts; `putDraft` on the fake), and all three drafts go in one step.
    - `tests/agent-ask-user.test.ts`: a cancelled ask stops at once (at most 2 reads) and takes no answer.
    - `native-agent-ask-undo.spec.ts`:
      - the agent's discard sets the status line and shows no toast;
      - with the done pin's card still open, Ctrl+Z after its Undo brings the agent's heading back, and the same card offers Undo again.
  - `RESULT: ok doctor 11/11 checks passed`. `RESULT: ok unit 3827/3827 (255 files)` (`kit unit --affected`). `RESULT: ok specs 4/4 passed` (native-agent-ask-undo, native-agent-pins, native-mcp, native-guarded-history). `npm run check` and `npm run lint` are clean. Boot bytes 344 KB of 355 KB (`npm run test:budget`), unchanged.

- Review round 3:
  - The pin card's refusal is in Lex's words: "index.html changed since Copy editor's change. Nothing was undone." No change id, no edit tools. discard_change keeps the agent's wording (`discardPlan`'s reader, "user" from `undoAgentChanges`).
  - The pin's Undo takes the workspace of the click before any wait (`scope` passed in; `shown` proves it before the undo and through its guarded edit).
  - After the pin's Undo the focus stays in the card: on Undo while it can be pressed, on Clear once it reads Undone. It does nothing when another card opened meanwhile.
  - discard_change's two replies share one message (`discardedMessage`).
  - Tests:
    - `tests/agent-changes.test.ts`:
      - refusals in the user's words and the agent's;
      - a click whose site was left writes nothing;
      - past 16 M characters the older change goes and the newer stays.
    - `tests/mcp-runtime.test.ts`: ask_user with no element, and with a 61-character question, refused by the Worker with no command sent to the tab.
    - `native-agent-ask-undo.spec.ts`:
      - the alert's exact words, without the id or "edit tools";
      - Undo focused after a refusal;
      - Clear focused after Undone.
      Ctrl+Z inside a card is the card's, by the editor's rule for dialogs, so the spec moves the focus out of the still-open card before pressing it.
  - `RESULT: ok doctor 11/11 checks passed`. `RESULT: ok unit 3830/3830 (255 files)` (`kit unit --affected`). `RESULT: ok specs 8/8 passed; 179 more run in kit pr` (`kit specs --affected`).
  - native-agent-pins, native-guarded-history and native-mcp together: `RESULT: fail specs 1 of 3 failed: native-mcp.spec.ts` (its Ask agent history-after-reload test timed out at 120 s). Run alone, native-mcp passed: `RESULT: ok specs 1/1 passed`.
  - `npm run check` and `npm run lint` are clean. Boot bytes 344 KB of 355 KB, unchanged.
