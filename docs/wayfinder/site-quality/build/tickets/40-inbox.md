---
title: "The Inbox in the top bar"
type: task (AFK)
status: closed
assignee: fleet-lead
builder: claude
blocked_by: []
---

## Goal

An Inbox behind one icon in the slim top bar that collects what needs the user ([ticket 05](../../tickets/05-grill-automatic-fixes.md#resolution-2026-10-26); CONTEXT.md term **Inbox**). Its place in the top bar comes from atomic-catalogue slice 66 (the slim top bar), which this build's gate covers. Size: L.

## Decided behaviour

- The icon sits in the place catalogue slice 66 left for it, built from catalogue parts (icon button, menu or popover, empty state).
- A small dot on the icon when something waits; never a number.
- Each item says what needs doing and where; clicking it goes to the spot (page, element, pin or setting) and closes the Inbox.
- Items disappear by themselves once fixed; there is no "mark as read".
- An item can carry a wave-off action named for what it means (for example "Decorative"); wave-offs are stored in the repo (`.editor/config.json`), so other editors and agents see them.
- Empty: the icon shows no dot and the list says nothing is waiting, in one short line.
- This slice ships the Inbox with a small item interface that slices 41, 43 and 44 fill. No toasts, no explainer text.

## Files

Expected (confirm while designing): `src/inbox/` (model and view), the top bar from catalogue slice 66, `shared/native-project.ts` (wave-offs in the config), `src/catalogue/parts.ts` (frame), tests and a new `tests/native-save/native-inbox.spec.ts`.

## Done when

- With a fake item source, the dot shows, the item opens its spot, fixing the cause removes it, and a wave-off survives a reload.
- `kit shots` light and dark, 390 and 1280 wide.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-40 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-40 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- One second opinion on the final version (`grok-4.7` or `gpt-6.1-sol`).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.

## Done (2026-11-14)

Built as Orbit card TOOLS-222 from the agreed mock-up 05 v2 (https://preview-editor.techies.tools/mockups/site-quality/05-slim-top-bar-v2), together with the first part of [slice 41](41-inbox-site-improvements.md).

- Behaviour: a 28 px tray button between History and Publish (`src/workspace-shell.ts`, `src/style.css`), an orange dot on it while something waits (never a number), a panel under it headed "Inbox" with one row per item (icon, what, where), "Checking pages…" until every page is read and "All done" with a check when nothing waits. A row goes to its spot and closes the panel; items go by themselves once fixed. On a phone the tray leaves the bar: the Menu button and its new Inbox row wear the dot, and the row opens the panel. Dots in Pages (after the page's name) and Media (a waiting picture's tile).
- Item interface: `src/inbox/inbox-item.ts` (`InboxItem`); slices 43 and 44 add their kinds there.
- Wave-off: Decorative, on pictures stored in the site only (Lex, 2026-11-14). It writes what Media's own Decorative writes, `alt=""` on the page and the place's Media record, as one Undo step, so it is in the repository for other editors and agents without a separate `.editor/config.json` entry.
- Boot bundle: only the button, a small host (`src/inbox/inbox-host.ts`) and the hide rule load at boot; the checks, list, dots and panel load once the pages are read or the panel opens. `kit size`: `RESULT: ok size boot 354 KB (±0 KB) vs dev@7c8471c, budget 355 KB`.
- Tests: `tests/inbox-site-items.test.ts`, `tests/top-bar-menu-rules.test.ts`, the browser spec `tests/native-save/native-inbox.spec.ts` (dot, the item's spot, a fix clearing it, Decorative after a reload, the Media tile's dot, the page title's item, the phone Menu). `tests/inbox-decorative.test.ts` (Decorative writes only on the session it was pressed in, through `forEachAwait`); `kit unit --affected`: `RESULT: ok unit 3218/3218 (210 files)`; `kit specs native-inbox.spec.ts native-top-bar.spec.ts native-media-library.spec.ts`: `RESULT: ok specs 3/3 passed`; `npm run check` and `npm run lint` pass.
- Evidence: `kit ux --features F-inbox-01,F-inbox-04,F-inbox-05`: `RESULT: ok ux 1 features tried, 1 scripted findings, 3 fine, 0 looks off, 0 broken`; `kit shots` light and dark at 390 and 1280 on the real starter (nothing waiting) and on `fixtures/native-starter` (a picture waiting); the mock-up next to the build on the branch `evidence/tools-222-inbox`.
- `kit lighthouse` and `kit site-rules`: not run, as the Inbox changes no site output (it reads pages; Decorative writes what Media already writes).
- Done when 1: met — with the fixture's real item (a hero picture without alt text) rather than a fake source, `tests/native-save/native-inbox.spec.ts` shows the dot, the item opening its spot, a description removing it, and Decorative surviving a reload.
- Done when 2: met — `kit shots` light and dark at 390 and 1280 (real starter and `fixtures/native-starter`), all `RESULT: ok shots … 0 failed, 0 layout findings`.
- Feature list: F-inbox-01 to F-inbox-05 in `docs/agents/features.md`.
- Differences from the mock-up and this ticket: the light panel uses the editor's shared panel surface (as History and the menus do) rather than the mock-up's white; the mock-up's "Agent question" and "Setup" rows are slices 43 and 44, not built; Decorative is written to the page and the Media record, not to `.editor/config.json`; the item's place in Pages and Media is a dot, not a score ring (slice 63); the checks live in `src/inbox/site-items.ts`, not `shared/site-score/` (slice 41's follow-up); `src/catalogue/parts.ts` is unchanged, the panel reusing the theme tokens and the popover's own Escape and outside-click handling.
- Commits: Inbox: the items found on the site's pages and the phone Menu's row; Inbox: the tray in the top bar, its dot, its panel, and dots in Pages and Media; Inbox: browser spec for the dot, the item's spot, a fix clearing it, Decorative after a reload and the phone Menu; Inbox: only the button and a small host in the boot bundle; Inbox: the features list, CONTEXT.md and the code map name it; Inbox: theme tokens for its dots, row spacing and Decorative's line; Inbox: the browser spec checks the dot on a waiting picture's Media tile; Site quality tickets 40 and 41: Done sections for the Inbox; Inbox: review round 1 fixes; Inbox: review round 2 fixes; Inbox: review round 3 fixes; Site quality ticket 40: review round 4 follow-ups; Inbox: second look fixes; Inbox: Decorative writes only over the page text its row was found in.
- Review decisions (Claude Opus, high): fixed R1-1 (no old site's rows after a switch), R1-2 (Decorative only for a file the site holds), R1-3 ("All done" only once known), R1-6 (Decorative's proof survives its waits), R1-7 (reduced motion), R1-8 (a place for the panel without anchors), R1-4 (this Done), round 2's P1 (a picture from another address no longer keeps the panel busy: the verdict mirrors the edit bar's warning) and its P3 (a save's re-read keeps the list). Declined R1-5 (an item-source seam now): slices 43 and 44 bring the sources it would serve, so the seam is designed with them rather than guessed; `InboxItem` is the interface they extend. Declined the `src/main.ts` reformatting nit: those lines were joined to keep `main.ts` under its line ceiling (`tests/main-ts-ceiling.test.ts`). Declined the 400 ms nit: the debounce's window is shorter than any switch's page reads. Round 3 (only P3): fixed the list freezing after a failed re-read (the same session goes on checking the pages it holds), a stored picture whose Media record never arrives (judged by its alt text after ten looks), the untyped test fakes and the unguarded `item.media`.
- Second opinion (`kit review --second gpt`, gpt-6.1-sol): fixed its four P1s: Decorative now marks only the waiting use when another use of the file on the page has words (by its element); pictures shown only through `srcset` or a `<picture>`'s source are listed as the edit bar warns about them (without Decorative, which Media marks by src); Decorative names the page source it was pressed on and Media refuses the write when the page changed since; a title's row opens Page settings only while the session and the opened page hold. Its re-check on the final version is quoted in the PR. Claude's review after these fixes (only P3): fixed Decorative's proof (it now writes only over the page text its row was found in); declined moving the `<picture>` source rule into one helper shared with the edit bar now (an img nested deeper than a `<picture>`'s direct child is rare markup; a follow-up); with one use described and two waiting, Decorative takes one press per waiting use, as F-inbox-03 says.
- Follow-ups: an item-source seam with slices 43 and 44; R4-1 (P3, rare path): when the Media rules take longer than ten looks, a stored picture judged by its alt text is not looked at again once the rules arrive until the next change (a slow re-look, or the media controller asking the Inbox to check when its rules load); browser specs for Undo after Decorative, a site switch, the busy state's focus, focus kept on a redraw, a site with only a picture from another address, a save's re-read held or failing, and a unit test of the ten-look cutoff with mock timers (review validation gaps).

