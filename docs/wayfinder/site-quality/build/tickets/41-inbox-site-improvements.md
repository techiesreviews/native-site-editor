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
- Done when, as of this part: 1 (a fixture site with one of each problem lists each once with the right spot; fixing one removes it): met for every kind built (partly open: a button with no name is not listed yet), by `tests/inbox-site-items.test.ts` and `tests/native-save/native-inbox.spec.ts`. 2 (the matching `kit site-rules` "needs words" rules reported, not failed): not met yet, so the ticket stays open (it is a follow-up below).
- Review decisions: the no-agent wording on Fix with AI and Fix all with AI ("No agent connected") stays, as Lex asked for it on the card ("when no agent is connected, the button shows that on itself") although UX rule S3 says a disabled choice says nothing.

### Follow-ups

Left open from the reviews, each once (the disconnect, its grace for a reply being saved, and letting the request go are fixed):

- P3: a request whose site or branch was switched away while Thinking stays in that site's records; `link.dismiss` goes through the agent controller's current menu, not the one used when asking.
- P3: the action strip's busy look copies the Button part's disabled look for `aria-disabled`; the Button part could carry that state itself.
- Test gaps: a `tests/inbox-list.test.ts` for focus and caret kept through a redraw, and for a redraw when `keep` returns true; `forEachAwait` tests for `write` and `goToShared`; a browser spec for a shared row whose part shows only on a page not open; browser specs for the settle table's dismissal, timeout and disconnect rows; a host test of `onConnection(false)` reaching `connectionChanged()`.
- Validation gaps (gap): R3-15 still open: still no unit test for a stale refusal after `keep` moves the item.
- Validation gaps (gap): R3-14 still open: still no test of the row refusals for Use H3, No speech or Decorative.
- Validation gaps (gap): R3-13 still open: this is the umbrella for R2-1 to R2-4 and R2-12 to R2-14. R2-13 (R3-2) is now resolved. The rest are still open, as listed under R3-1, R3-3 and R3-7 to R3-10.
- Previous findings (P3): R3-12 still open: `src/inbox/inbox.ts` did not change this round. `refusals` is still cleared only when the row leaves the list (`:209`), when its button is pressed (`:279`, `:292`), or when the site changes (`:206`). So a refusal can outlive the check that made it wrong.
- Validation gaps (gap): R3-10 still open: still no browser specs for the settle table's dismissal, timeout and disconnect rows. Follow-ups line 68 does list this.
- Validation gaps (gap): R3-9 still open: still no `forEachAwait` tests for `write` or `goToShared`. Follow-ups line 68 does list this.
- Validation gaps (gap): R3-8 still open: still no unit test for `goToShared` with a failed outer step or a missing node.
- Validation gaps (gap): R3-7 still open: no spec shows an open panel following the agent as it connects and leaves.
- Previous findings (P3): R3-6 still open: `namedInside` (`src/inbox/site-items.ts:89`) is still a copy of `nativeNamedDescendant`. It is also no longer listed in Follow-ups (see the new defect below).
- Validation gaps (gap): R3-3 still open: `tests/native-save/native-inbox-ai.spec.ts` was not touched. No browser spec shows an Accept refusal on its row.
- Validation gaps (gap): R3-1 still open: this round changed only `src/inbox/inbox-agent.ts`, `tests/inbox-agent.test.ts` and the ticket. No browser spec covers a site switch while Thinking… is shown.
- Spec (P3): 339f500bb:docs/wayfinder/site-quality/build/tickets/41-inbox-site-improvements.md:64 — P3 ticket: the commit says ticket 41's follow-ups are "listed once". The list is now clean, but it leaves out items that are still open: the `namedInside` copy (R3-6); a row's refusal outliving its check (R3-12); the test gaps for the Accept refusal on its row (R3-3), a site switch while Thinking… (R3-1), the panel following the agent (R3-7), `goToShared` with a failed step or a missing node (R3-8), the Use H3, No speech and Decorative refusals (R3-14), and a stale refusal (R3-15). Lex reads Follow-ups as the work still to do, so these would drop out of sight. Fix: add two P3 lines (the `namedInside` copy; a refusal kept after the row's check changes) and add the six tests to the "Test gaps" line.
- Validation gaps (gap): Still open as written above: R3-1, R3-3, R3-7, R3-8, R3-9, R3-10, R3-14, R3-15.
- Validation gaps (gap): R5-17 still open: `tests/inbox-fixes.test.ts` did not change. Still no test of Accept all where only some rows are still this Accept's own when the write is refused (`src/inbox/inbox-fixes.ts:133-137`).
- Validation gaps (gap): R5-16 still open: the changed test (`tests/inbox-site-items.test.ts:274`) covers only a part that is hidden and nowhere shown. It has no case with one hidden instance followed by a shown one, so it does not check that `partChain` skips the hidden one and returns the shown one's offset.
- Validation gaps (gap): R5-15 still open: R3-1, R3-3, R3-7, R3-8, R3-9, R3-10, R3-14 and R3-15, as under R5-1.
- Previous findings (P3): R5-14 still open: ticket 41's Follow-ups lines 69-81 still hold the reviews' own words ("Validation gaps (gap): R3-15 still open…", "Spec (P3): 339f500bb:…") rather than follow-ups written for Lex. This round did not touch the ticket.
- Validation gaps (gap): R5-12 still open: `src/inbox/inbox-fixes.ts` did not change. `keep` (`:210`) still keeps `refused` when it follows a moved item, and no test covers that.
- Validation gaps (gap): R5-11 still open: there is still no test of the row refusals for Use H3, No speech or Decorative. `tests/native-save/native-inbox.spec.ts` did not change.
- Validation gaps (gap): R5-10 still open: this is the umbrella entry. R2-1 to R2-4, R2-12 and R2-14 are still open, as listed under R5-2, R5-3 and R5-5 to R5-8.
- Previous findings (P3): R5-9 still open: this round changed only `sharedParts` and `goToShared` in `src/inbox/inbox.ts`. `refusals` is still cleared only at `:209` (the session changes), `:212` (the row leaves the list) and `:282`/`:295` (its button is pressed again). So a refusal can still outlive the check that made it wrong.
- Validation gaps (gap): R5-8 still open: there are still no browser specs for the settle table's dismissal, timeout and disconnect rows.
- Validation gaps (gap): R5-7 still open: there are still no `forEachAwait` tests for `write` or `goToShared`.
- Validation gaps (gap): R5-6 still open: there is still no unit test of `goToShared` with a failed outer step or a missing node.
- Validation gaps (gap): R5-5 still open: there is still no spec of an open panel following the agent as it connects and leaves.
- Previous findings (P3): R5-4 still open: `namedInside` (`src/inbox/site-items.ts:89`) is still a copy of `nativeNamedDescendant` (CODING_STANDARDS.md, UI parts: "Reuse before new").
- Validation gaps (gap): R5-3 still open: `tests/native-save/native-inbox-ai.spec.ts` did not change. No spec shows an Accept refusal on its row.
- Validation gaps (gap): R5-2 still open: there is still no browser spec for a site switch while Thinking… is shown.
- Validation gaps (gap): R5-1 still open: this round added no test for R3-1, R3-3, R3-7, R3-8, R3-9, R3-10, R3-14 or R3-15. Only `tests/inbox-site-items.test.ts` changed, and only its template case.
- Standards (P3): 509d98cb0:src/inbox/inbox.ts:35 — P3 fault: a row's `shared.pages` now includes pages that hold the part only inside a hidden `<template>`. Fix with AI still names `shared.pages[0]` as the page the element is seen on: `ports.route(item.shared?.pages[0] ?? item.page)` at `src/inbox/inbox.ts:184`, sent to `agentElement`. Pages are listed in site order. So when the first page has the part only in a template and a later page shows it, the agent is pointed at a route where the element is not shown. If the agent inspects that route, it finds nothing. Before this round `pages` held only pages that show the part, so this is new. `goToShared` already handles the case: it picks a page where `partChain` finds the part (`:69`). Fix: give the agent the same page. Either share one small helper ("the first page that shows the part") between `goToShared` and `element()`, or carry the pages that show the part next to `pages` on `shared`. Rare path, small cost.
- Validation gaps (gap): R5-1 to R5-3, R5-5 to R5-8, R5-10 to R5-12 and R5-15 to R5-17: still open, as above.
- Validation gaps (gap): New: there is no test that `sharedParts` and `goToShared` keep apart the pages a change reaches and the pages that show the part (`src/inbox/inbox.ts:33-36` and `:68-69`). The new unit test checks `componentPages` alone. Add a test that drives the Inbox with fake ports: `a.html` holds `<template><site-header></site-header></template>`. `b.html` holds `<site-header></site-header>`. The header's template holds an `<img>` with no alt. Expect one row with `shared.pages` equal to `["a.html", "b.html"]` and the line "Site header · changes 2 pages". Go to the row with `a.html` open. Expect `open("b.html")`, then `editComponent("site-header", { path: "b.html", … }, [note])`. If R5-18 is fixed, also expect the agent request's route to be `b.html`'s.
- Spec (P3, second look): 509d98cb0:src/inbox/inbox.ts:35 — P3 fault: `shared.pages` includes pages where the part exists only inside a hidden template, but the AI request uses its first page as the visible route at line 184. A hidden first use therefore points the agent at the wrong page. Ticket 41 requires the request to identify the item’s element. Fix: choose a page where `partChain` finds a shown instance, as navigation already does.
- Spec (P3, second look): a22c3267c:src/inbox/inbox-fixes.ts:210 — P3 fault: a fresh check can update a suggestion’s source while retaining “The page changed since it was checked.” Confirmed with the real fixes module: Accept then succeeds without changing the suggestion. The manual-action refusal map has the same problem at `inbox.ts:212`. This leaves misleading feedback beside the action (UX rule S4). Fix: clear source-related refusals when a fresh check replaces the source they describe.
- Spec (P3, second look): 2118964b4:src/inbox/inbox-agent.ts:76 — P3 race: request cleanup calls the agent controller’s current menu. After switching sites while Thinking, the original request can remain pinned in the old site. Ticket 41 describes suggestion requests being let go after use. Fix: retain cleanup bound to the request’s original workspace.
- Standards (P3, second look): a22c3267c:src/inbox/inbox.ts:286 — P3 race: Decorative, No speech and Use H3 check their session before waiting, but their failure handlers write refusals and announce errors without checking it again. An old action can therefore add its error to a newer site’s matching row. CODING_STANDARDS.md, “Async writers”: re-check the same proof after every await and before every write. Fix: check the captured session before calling `refuse` in both handlers.
- Standards (P3, second look): 2118964b4:src/inbox/inbox.css:108 — P3 style: the screen copies the Button part’s disabled appearance for `aria-disabled`. CODING_STANDARDS.md, “UI parts,” requires missing variants to live in the part’s own files. Fix: support `aria-disabled` in Button’s disabled, hover and active rules, then remove this copy.
- Validation gaps (gap, second look): Add list tests for focus and caret preservation during redraw, focus after a row disappears, and redraw when `fixes.keep()` drops a suggestion.
- Validation gaps (gap, second look): Add a browser fixture with problems on different pages while Home stays open. Check background-page fixes and Undo, plus navigation to a shared part shown only elsewhere.
- Validation gaps (gap, second look): Add a hidden-first-page/shared-part case: expect the correct page count, navigation to the shown instance, and that same route in the AI request.
- Validation gaps (gap, second look): Add browser cases for connecting and disconnecting with the panel open, dismissal, timeout, and switching sites while Thinking.
- Validation gaps (gap, second look): Add refusal tests for Accept, Decorative, No speech and Use H3: verify row feedback, clearing after a fresh check, and no late error reaching another session.
- Validation gaps (gap, second look): Add `forEachAwait` coverage for `write` and `goToShared`, including a failed outer component step. Add Accept-all coverage where only some states still belong to the pending write when it fails.
