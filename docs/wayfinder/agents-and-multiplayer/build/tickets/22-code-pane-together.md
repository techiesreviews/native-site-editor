---
title: "Code pane: typing together and carets"
type: task (AFK)
status: closed
assignee: am-22
builder: claude
blocked_by: [21-shared-copy-per-file]
---

## Goal

Typing together in the code pane, with others' carets.

## Decided behaviour

[Ticket 12](../../tickets/12-prototype-typing-together-poc.md#resolution-2026-10-25) and [ticket 08](../../tickets/08-grill-shared-editing-mechanism.md#resolution-2026-10-24):

- The Monaco code pane binds to the shared copy (`y-monaco`).
- Others show as a thin caret in their colour with a small circle on top: their first letter, or for an agent a tiny icon of its program (Claude, OpenAI, Gemini, …; from `clientInfo.name` or the helper).
- The full name shows on hover, and a selection shows as a light tint.
- The caret look is shared with slice 23 ([Lex's reference](../../prototypes/12-caret-circle-reference.png)).
- Mock-up approved by Lex (2026-10-27): [13-code-pane-and-undo.html](../../prototypes/13-code-pane-and-undo.html)

## Files

Expected (confirm while designing): `src/components/source-editor.ts` (+ CSS), `src/components/monaco.ts`, a new `src/components/live-carets.ts` (+ CSS, shared with 23), the agent icons as small inline SVGs, `kit deps add y-monaco`; a two-context spec.

Notes for the build (am-22, 2026-10-31):

- Boot stays within 355 KB (`kit size`; about 346 KB now). Carets, `y-monaco`, `y-protocols` and the agent icons load only when a live room opens, in the lazy live-text chunk, never at boot.
- Live sharing stays off by default (`LIVE_SHARING_KEY` in `src/live-text.ts`, slice 21); do not change that. Specs switch it on per context.
- Slice 21 shares the open file through its draft store entry, and slice 24's per-person Undo lives in the draft-store history with Monaco's stops. Check whether a `y-monaco` text binding would bypass that history; if it would, keep the text path as it is and use awareness (from `y-protocols`) and Monaco decorations for the carets, and record the choice in Done.
- Slice 24 follow-up: `canUndoAuthor` walks the whole document on each call. Ask it only when `onAuthorUndo` fires, at most once per frame for all carets, never per keystroke per caret.
- The caret and its name tag: a short fade in and out with no movement under reduced motion (animation), a name tag whose undo icon is a real button with keyboard focus, a visible focus ring, a screen-reader name, and a touch target of at least 24 px (44 px at touch widths). Theme tokens only; no toasts or explainer text; state shows on the caret itself.
- Where the ticket leaves a choice open and it is easy to undo later, take the safe, cheap way and list it under "Choices left open, taken the safe way (for Lex's Tuesday pack)" in Done.

## Done when

- A spec: Lex and Anna type in the code pane; each sees the other's caret with circle and letter, the name on hover, and an agent's icon circle.
- Moved here from slice 24 (am-24, 2026-10-31): Anna's caret name tag in the code pane ends with an undo icon while `LiveText.canUndoAuthor` (src/live-text.ts) says her change can be taken back; clicking it runs `LiveText.undoAuthor` and the spec shows her words gone in both tabs and Lex's still there. The caret names the author by the Yjs client id its own changes carry.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-22 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-22 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).

## Done (2026-10-31)

Others' carets show in the code pane while a file is shared. Each is a thin line in its colour with a small circle on top: the person's first letter, or for an agent a tiny icon of its program (Claude, OpenAI, Gemini, or a plain one, by its MCP client's name). Hover or keyboard focus opens the circle into the full name; a selection shows as a light tint. While `LiveText.canUndoAuthor` says the author's latest change can be taken back, the open tag ends with an undo button (a real button: focusable, focus ring, "Undo Anna's change" for screen readers, a 24 px press area, 44 px on touch); clicking it runs the name-tag Undo for everyone, as this pane's own Undo step. A caret fades in and out (opacity only); the tag's opening reveal runs only without reduced motion. Theme presence colours only; no toast.

- Text path: kept as it was. A `y-monaco` binding writes remote changes straight into Monaco's model, past the draft store's history and slice 24's per-person Undo, so it is not used and `y-monaco` is not added. Carets travel in the live room's own presence (src/live-room.ts `setPresence`/`onPeers`), which already is the room's awareness, so `y-protocols` is not added either.
- Where a caret is: each tab tells the room its author (the Yjs client id its own changes carry, the same id the name-tag Undo takes), its GitHub name and its caret as Yjs relative positions, at most every 50 ms. Others read them in their own copy, so a caret stays by the same words while anyone types. Others' text moving your caret along sends nothing.
- `canUndoAuthor` is asked only when `onAuthorUndo` fires (or a new caret appears), in one animation frame for all carets, once per author.
- Loading: `src/components/live-carets.ts` and its CSS load with Yjs, only once someone else has the file open, never at boot. Boot is unchanged: `kit size` RESULT: ok size boot 347 KB (±0 KB) vs dev@626f989, budget 355 KB.
- Code: `src/live-text.ts` (caret presence, `CaretShare`, `loadCarets` port), `src/components/live-carets.ts` + `.css` (Monaco content widgets and decorations; `caretFlag` builds the tag for slice 23 to reuse), `src/components/source-editor.ts` (`showCaretPane`/`caretPanes`/`watchCaretPanes`: the pane registry, typed only), `src/components/code-editor.ts` (each editable code pane registers itself).
- Tests: `tests/live-text.test.ts` adds a carets test (no carets loaded while alone; Anna's caret read at Lex's and kept on her words as he types; the caret's author is the id her changes carry and its Undo takes back only her words; an agent's caret names its program; carets go when the file closes). New spec `tests/native-save/native-code-carets.spec.ts`: Lex and Anna type in the code pane; each sees the other's caret with circle and letter, the name on hover; an agent connected over MCP joins the room from Node and shows its program's icon and name; Anna's tag at Lex's ends with an undo that takes her words away in both tabs and leaves Lex's. The test server (`tests/native-save/server.ts`) now lets agents into live rooms as the Worker does.
- Second pass, after review: the tag's background alone is clipped to the circle, so the circle and the undo each take presses over at least 24 px (44 px on touch). A tap on the circle opens the tag and keeps focus there: Monaco hears touches at the document and would take focus into the code, and the tag focuses without scrolling Monaco's inner layers. The tag opens on the side of the caret with room for it and cuts the name to that room with an ellipsis, so its undo always shows inside the pane, at 390 px too. The tag is a named group for screen readers. Hover raises a tag only where hover is real. A caret that comes back while fading out asks again for its undo; focus on a tag that goes returns to the code. The circle's letter is the first character a reader sees (accents and emoji whole, "ß" one letter), and names are cut by character. A caret whose author id another participant here also claims (or this tab's own) offers no Undo.
- Tests (second pass): `tests/live-carets.test.ts` (each program's mark; first letters); `tests/live-text.test.ts` adds a contested-author test and a `forEachAwait` test that stops the file at every await of loading the carets (no carets start, no caret told). `native-code-carets.spec.ts` adds a phone test (390 px, touch, reduced motion): a long name by the pane's right edge; a tap opens the tag with focus kept; the undo stays inside the pane and presses 21 px around its centre reach it; the tag's reveal does not animate; by keyboard (Ctrl+M, Tab) the tag opens with a focus ring, Tab reaches the undo, Enter takes back Lex's changes latest first, and focus stays on his tag.
- Third pass, after review: this tab's caret is read from its pane each time the room is told, so a caret placed before the copy caught up is told where it is in the shared text. A tag on the pane's top visible line (scrolled or not) sits below its caret, and tags place themselves again on every scroll. The circle has a pressed state. A right-to-left name shows whole beside its circle, in its own direction. A caret position someone says is accepted only in this file's text: a position naming another type is dropped before Yjs looks it up, so no one can make empty types in others' copies. The undo's screen-reader name uses the whole name ("Undo Claude Code's change").
- Tests (third pass): `tests/live-text.test.ts` adds a joiner whose caret was placed before catch-up (told on the same word in the shared text) and a caret said in another named type (not drawn, no type made; this test fails without the check). `native-code-carets.spec.ts` adds Anna's selection as a tint over the same words at Lex's (gone when she collapses it), her caret on the top line Lex's scrolled pane shows (circle inside the pane, tag below), and her caret going when she leaves. The phone test's fixed wait is now tied to `TYPING_SETTLE_MS` and says why no state can be watched.
- Fourth pass, after review: a tag is measured once Monaco shows it (a new caret stays hidden until its first render) and places itself after every render, so a tag with no undo (an agent's) also opens on the side with room, and a caret that first appears on a scrolled pane's top line has its tag below. The circle's press area reaches up from the caret's line (down for a tag below), so a press beside the caret on its own line stays a press in the code. The undo has a tooltip as well as its screen-reader name. Hover and pressed states use the theme's `--hover` and `--selected`. With two panes on one file, closing the one whose caret the room was told hands over to the other still open. A name of only invisible characters shows as "Someone" (or "Agent").
- Tests (fourth pass): `tests/live-carets.test.ts` adds right-to-left names and names of nothing visible. `native-code-carets.spec.ts` adds an agent appearing for the first time on the top line of Lex's scrolled pane while claiming Anna's author id (circle inside the pane, tag below, her tag's undo off until it leaves, then back); and on the phone, an agent's tag (no undo) at the pane's right edge staying inside the pane with more than a letter of its name, then going when the agent leaves.
- Validation (fourth pass): `kit unit --affected` RESULT: ok unit 2882/2882 (177 files); `kit unit tests/live-carets.test.ts` RESULT: ok unit 4/4 (1 files); `npm run check` and `npm run lint` clean; `kit specs native-code-carets.spec.ts` RESULT: ok specs 1/1 passed (twice in a row); `kit specs --affected` RESULT: ok specs 20/20 passed; 172 more run in kit pr; `kit specs native-live-text.spec.ts` RESULT: ok specs 1/1 passed.
- Validation (third pass): `kit unit --affected` RESULT: ok unit 2880/2880 (177 files); `npm run check` and `npm run lint` clean; `kit specs native-code-carets.spec.ts` RESULT: ok specs 1/1 passed (three times in a row); `kit specs --affected` RESULT: ok specs 20/20 passed; 172 more run in kit pr; `kit specs native-live-text.spec.ts` RESULT: ok specs 1/1 passed. An earlier affected run failed once in this spec (a caret inside a fold in Lex's pane, so its name read empty); the spec now unfolds and shows both carets first.
- Validation (second pass): `kit unit --affected` RESULT: ok unit 2878/2878 (177 files); `kit unit tests/live-carets.test.ts` RESULT: ok unit 2/2 (1 files); `npm run check` and `npm run lint` clean; `kit specs native-code-carets.spec.ts` RESULT: ok specs 1/1 passed (twice in a row); `kit specs --affected` RESULT: ok specs 20/20 passed; 172 more run in kit pr; `kit specs native-live-text.spec.ts` RESULT: ok specs 1/1 passed.
- Shots: `.scratch/am22-shots/` (code pane at 1280 and 390, light and dark: carets closed, tag open with undo, undo focused).
- UX review of the shots against the UX rulebook (Opus): U5 pass (at 390 the tag cuts the name to "An…" and its undo stays in the pane); U6 pass (press areas 24/44 px, hover only in the hover media query); U7 pass (focus ring on the tag and the undo); U8 pass (no reveal under reduced motion; fades only); L2 colours pass (presence tokens only). Left: the code pane's own resize grip can sit over a caret at the pane's right edge on a phone.

Choices left open, taken the safe way (for Lex's Tuesday pack):
- Colours: four presence colours (the agents' theme tokens), chosen by author id so every tab shows the same person in the same colour; two people can share a colour.
- Names and author ids are what each participant says of itself; the relay vouches for neither. A second claim of an author id present takes the Undo off both tags; a claim of an author who has left is not caught. Having the relay stamp each peer's login is left for later.
- Your own caret is told from the code pane whenever it is open, focused or not; the page's carets come with slice 23.
- On the first line the tag sits below the caret; two carets at one spot overlap, the one hovered or focused on top.
- On a phone the tag opens on tap (focus), not always open.
- The circle and its sizes keep the mock-up's geometry (18 px circle, 16 px undo): the theme has no caret tokens; the press areas use `--size-icon` and `--size-tap`.
- A caret inside folded code is not shown until the fold opens.

Feature list: added F-code-08 (Others' carets in the code pane); F-canvas-15 now points to it.

Commits: "docs: 22-code-pane-together notes for the build (lazy load, sharing stays off, safe defaults)", "Code pane: typing together and carets", "Review fixes round 1", "Review fixes round 2", "Review fixes round 3", "Review fixes round 4", "docs: 22-code-pane-together UX follow-ups", "docs: 22-code-pane-together commits by subject", "Spec: mark the carets spec's settle wait as a deliberate fixed wait", "Review fixes round 5" and this commit.

UX review (F-code-01, F-code-08, F-canvas-15): F-code-08 and F-canvas-15 fine. F-code-01 showed the block-insert flash ("Heading added. Into Section … after Div", with Undo) over the code pane's bottom lines and over the page at 390 px (HS1, S4, U5). It comes from `src/controllers/block-insert-controller.ts` and `src/page-builder/block-insert.ts`, which this slice does not change: left for a ticket of its own.

Not done (review nits): no native tooltip removed from the name (it shows a cut name whole); no Esc from a focused tag back to the code (the tag is not a menu, and Tab and a click in the code leave it); no retry of a failed carets load (it is tried again when the file is shared anew). Declined: the relay stamping each peer's login and peer id (worker and relay changes, a ticket of its own), and caret tokens in `src/theme.css` (outside this slice's files; the press areas use `--size-icon` and `--size-tap`).

### UX follow-ups

- UX (looks off): F-code-01 at 1280 px the code pane shows syntax colours in light and dark and starts with the head and sections folded, but a pop-up "Heading added. Into Section "Recent work" › after Div" notice with Undo appears after the action and sits on top of the code lines, and at 390 px the same notice covers the bottom of the canvas above the edit bar (.scratch/ux/am-22/20261031-190443-smiPdj/editor-F-code-01-1280-light-code-strip.webp)
- UX (looks off): F-code-01 at 390 px the canvas bar's breadcrumb buttons are 26×24 px and crowd each other (HS18: 44 px on touch). The breadcrumb (`src/components/canvas-bar.ts`) is not changed by this slice (.scratch/ux/am-22/20261031-191614-a87fR8/editor-F-code-01-390-light-code-strip.webp)
