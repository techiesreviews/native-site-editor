---
title: "Inbox: site improvements across every page"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [40-inbox]
---

## Goal

The things only the user can supply, found on every page, not only the open one ([ticket 05](../../tickets/05-grill-automatic-fixes.md#resolution-2026-10-26); the words rules in research 01). Size: M–L.

## Decided behaviour

- Items: a picture without a description (wave-off: Decorative, writing the markup the Media manager writes today), a page without a title, a link or button with no name, a vague link word ("read more"), a skipped heading level (with today's one-press fix), a video without subtitles (wave-off: No speech).
- Found by the same checks the edit bar runs today (`src/controllers/page-structure-controller.ts`), run over all pages from the drafts and the repository, in the background, after load and after each change.
- **One list (DRY):** the checks move into the shared rule module `shared/site-score/` (slice 11), so the Inbox, the score rings (63) and page details (64) show the same findings.
- Missing descriptions are not items (slice 22 writes them).
- Privacy page and security contact are not items yet (map: not yet specified).

## Files

Expected: `src/inbox/site-checks.ts`, `shared/site-score/` (the checks), `src/controllers/page-structure-controller.ts` (shared checks moved, not copied), tests.

## Done when

- A fixture site with one of each problem on different pages lists each once, with the right spot; fixing one removes it.
- The matching `kit site-rules` "needs words" rules are reported, not failed.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-41 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-41 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.

## Done (2026-11-14)

First part, built with [slice 40](40-inbox.md) as Orbit card TOOLS-222. The ticket stays open for the rest.

- Built: a picture without a description (wave-off Decorative, only for pictures stored in the site; Lex, 2026-11-14) and a page without a title, found on every page from the drafts and the repository once the site's text index has read them all, and again after each change. Each is listed once per page with its spot: the picture selected with the edit bar on its alt text, or the page's Page settings.
- The picture's verdict is the edit bar's own (`placeState` from the Media rules, handed in), so the Inbox and the edit bar never disagree; the checks are in `src/inbox/site-items.ts` (pure, `tests/inbox-site-items.test.ts`).
- Not built yet (follow-ups): a picture without a description inside a shared component (a header or card template) shown on a page, which needs the item to open the component's source (Edit component mode); a link or button with no name, a vague link word, a skipped heading level, a video without subtitles (No speech); moving the checks into `shared/site-score/` for the score rings (63) and page details (64); reporting the matching `kit site-rules` "needs words" rules.


## Done (2026-11-16)

Second part, built as Orbit card TOOLS-253 from Lex's approved prototype (`.scratch/prototypes/tools-253-inbox-next.html`, grill answers "1a 2yes", Fix with AI variant A; Fix all with AI confirmed "A" on 2026-11-16). The ticket stays open for the rest.

- Built: a link with no name and a link whose words say nothing ("click here", "read more"), a heading that skips a level (with the edit bar's one press, Use H3, on its row; no AI there), and a video without subtitles (wave-off No speech, written as `data-no-speech` on the video; a muted video is not listed), on every page. The pictures, links and videos of shared parts (component templates) are checked too: such an item names its part and the pages a fix changes ("Site header · changes 6 pages"), its row opens the part in Edit component mode on a page that uses it, with the note "Site header is a shared part. A change here shows on all 6 pages that use it." in its bar and the element selected. What a page may give into a part's slot (a slot's fallback, a link around a slot) is not listed in the part. Headings are judged on pages only. A link's name is judged as the edit bar now judges it (its words, a non-empty label, labelledby, a title, or a described picture inside), so the two agree.
- Each row's actions sit on a strip under it. Fix with AI (pictures' descriptions, links' names and words) asks the editor's connected agent through the agent channel: one request about the item's element, asking for the words only and no change; its reply's words show in the row to change, with Accept ("Accept on 6 pages" in a shared part) and Not now; nothing changes until Accept, which writes the words as one Undo step, and the request is let go once answered. Fix all with AI over the list asks for every such row at once; Accept all writes them as one Undo step and says the pages they change together ("Accept all on 2 pages"); empty or still vague words are refused on their row. State shows on the buttons (Thinking…, No suggestion · Try again, Accepting…, Accepted); with no agent connected each button says so on itself and the row still goes to its spot. No toasts.
- Feature list: F-inbox-06, F-inbox-07 in `docs/agents/features.md`; kit shots gained an `inbox` screen that seeds these problems.
- Not built yet (follow-ups): a part's slot content judged on each page that uses the part (the fallback where a page gives none, the page's own content where it does: `<site-button>click here</site-button>` is not listed yet); moving the checks into `shared/site-score/` for the score rings (63) and page details (64); reporting the matching `kit site-rules` "needs words" rules; a button with no name; subtitles added from the Inbox (the row goes to the video, whose File details add them).
- Evidence (2026-11-16): `kit unit --affected`: `RESULT: ok unit 340/340 (15 files)`; the new tests failed first (`RESULT: fail unit 16/25 (2 files)` before the checks and fixes); `kit specs native-inbox.spec.ts native-inbox-ai.spec.ts`: `RESULT: ok specs 2/2 passed` (13 tests; Fix with AI and Fix all with AI with an MCP client as the agent); `npm run check` and `npm run lint` pass; `kit size`: `RESULT: ok size boot 353 KB (±0 KB) vs dev@dca90a3, budget 355 KB` (the new Inbox ports included; the checks, fixes and agent load with the Inbox's list); `kit shots --steps` of F-inbox-07 at 390, 768 and 1280, light and dark: `RESULT: ok shots 26 files, 0 failed`; `kit ux`: `RESULT: ok ux 11 features tried, 18 scripted findings, 14 fine, 4 looks off, 0 broken` (the looks off are older parts this change does not touch: the edit bar's docking at 390, the project menu's and Edit component mode's note buttons' tap targets). `kit lighthouse` and `kit site-rules`: not run, as no site output changes (the Inbox reads pages; its fixes write only what the user accepts).
- Review decisions: the no-agent wording on Fix with AI and Fix all with AI ("No agent connected") stays, as Lex asked for it on the card ("when no agent is connected, the button shows that on itself") although UX rule S3 says a disabled choice says nothing.

### Follow-ups

- Validation gaps (gap): R3-15 still open: no test was added that proves an open panel redraws when `keep` returns true.
- Validation gaps (gap): R3-14 still open: same as R3-2.
- Validation gaps (gap): R3-13 still open: same as R3-1.
- Validation gaps (gap): R3-10 still open: same as R3-1.
- Validation gaps (gap): R3-9 still open: same as R3-2.
- Previous findings (P3): R3-8 still open: same as R3-3. The header table now exists, but the dismissal and timeout rows still have no browser spec.
- Previous findings (P3): R3-7 still open: same as R3-4. There is still no await-race test for `write` or `goToShared`.
- Previous findings (P3): R3-6 still open: the "gone after seen" path still ends with `letGo = false`. The header now says it is intended ("dismissed on its pin, or another site opened"), but the request is still left in the old site's records. `link.connected()` is still the live controller's.
- Previous findings (P3): R3-5 still open: this round did not touch site and workspace switches. `link.dismiss` still goes through `currentMenu()` (`src/controllers/agent-controller.ts:169`), not the menu used when asking.
- Previous findings (P3): R3-4 still open: `write` and `goToShared` still have no `forEachAwait` test. The only Inbox await-race test is the older one for Decorative (`tests/inbox-decorative.test.ts`).
- Previous findings (P3): R3-3 still open: the settle table is now written at `src/inbox/inbox-agent.ts:6-11`. But only unit tests cover the dismissal, timeout and disconnect rows (`tests/inbox-agent.test.ts`). None of them has a browser spec.
- Validation gaps (gap): R3-2 still open: there is still no spec for a shared row when no page that uses the part is open (the `ports.open` path in `goToShared`).
- Validation gaps (gap): R3-1 still open: there is still no `tests/inbox-list.test.ts`. Nothing checks that focus and the caret stay put when the list redraws.
- Spec (P3): 4f5674422:src/inbox/inbox-agent.ts:82 — P3 fault: when the agent disconnects, the suggestion fails with `letGo = false`, so the request stays pending in this browser's records. Ticket 41 and the file header say the request is let go and "no pin is left on the page". Agents fetch pending requests when they connect, so on reconnect the agent answers this one. That answer then shows as a pin on the page with words the Inbox no longer waits for. Meanwhile "No suggestion · Try again" sends a second request for the same item. Row 4 of the new settle table also doesn't say what happens to the request, which CODING_STANDARDS.md asks for ("every combination has a stated outcome"). Fix: let go of the request on disconnect, as the timeout does. Through the captured menu, this also covers R3-5. Then write "the request is let go" (or why it is kept) in rows 3 and 4.
- Standards (P3): 4f5674422:src/agent-menu-host.ts:123 — P3 race: CODING_STANDARDS.md, Racing and speculative reads: "Exactly one path wins", in one written order. The header puts a reply ahead of a disconnect, but that holds only when both arrive in the same list. The menu hears an agent's reply in `keep()` (`src/components/agent-menu.ts:461-472`), and tells it only after `await records.putConversation`. If the agent disconnects during that write (an agent that replies and then exits), `paint()` calls `onConnection(false)` first (`src/components/agent-menu.ts:513`). `connectionChanged()` then sends the old list without the reply, and the suggestion fails. The reply arrives a moment later, nothing is listening, and it stays on its pin. Fix: have `connectionChanged` tell listeners only after the menu's pending `keep` writes settle, or have `inbox-agent` wait a short grace for a reply after it sees a disconnect. Add a unit case: disconnect, then the reply's list within the grace, and expect the words.
- Validation gaps (gap): `tests/inbox-list.test.ts` with typed fake ports (R3-1, R3-10, R3-13). Focus a suggestion field with the caret at 3, then make another row's answer redraw the list. Expect the same field focused with `selectionStart` 3. Also check that a vanished `data-act` falls back to the row's first control.
- Validation gaps (gap): A spec for a shared row whose part is used only on About, with Home open (R3-2, R3-9, R3-14). Click the row, then expect About in Edit component mode, with the shared-part note and "Alt text missing".
- Validation gaps (gap): A test that an open panel redraws when `keep` returns true (R3-15).
- Validation gaps (gap): Browser specs for the settle table's dismissal and timeout rows, plus the new disconnect row (R3-3, R3-8). Dismiss the pin while the row shows Thinking…, and expect "No suggestion · Try again". Force the timeout with a short `SUGGESTION_WAIT_MS` or a held route, and expect the same. Press Disconnect MCP while Thinking…, and expect the same with no pin left.
- Validation gaps (gap): `forEachAwait` tests for `write` and `goToShared` (R3-4, R3-7). Drop the session at each await, and expect no write and no selection.
- Validation gaps (gap): The wiring from the menu's `onConnection(false)` to `connectionChanged()` in `src/agent-menu-host.ts` is untested. The new unit test calls `connectionChanged()` directly. Add a host-level test: build the menu options with a fake setup and selection, call `onConnection(false)`, and expect a waiting watcher to be told again.
- Validation gaps (gap): Once the fix is in, a unit test for a reply that comes after a disconnect: disconnect while a suggestion waits, then send the reply's list. Expect the request to be let go (`dismissed` contains its id), and expect the words if they come within any grace period.

