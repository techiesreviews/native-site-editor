---
title: "Where the edit bar sits on a phone, so it doesn't cover the element above (follow-up on 43)"
type: task (AFK)
status: closed
assignee: am-46
builder: claude
blocked_by: [43-phone-edit-bar-fixes]
---

## Goal

Ticket 43 decided "the bar never covers the element above it", but no fix was made. At 390 px the bar sits 8 px above a paragraph, and its "Paragraph" label and controls cover the bottom line of the card above (the "Read about Meadow Row Allotments" link on the starter). Every placement above an element covers whatever sits just above it, and today's rule (F-bar-01) only protects the selection. A placement decision is needed before anything is built. Shots: `.scratch/ux/am-43-builder/20261029/editor-F-bar-03-390-{light,dark}-size-strip.webp` (main checkout).

## Question for Lex (answered 2026-10-29, see Decided behaviour)

On a phone, when the space above the selected element is full of other content, where should the edit bar go?

- **A. Keep it above (today).** It may cover a line of the element above for as long as the selection lasts. This reverses ticket 43's decided behaviour ("the bar never covers the element above it").
- **B. Scroll the page so the bar gets clear space above or below.** The page moves a little when you select something. Where there's no clear space (a dense page), it falls back to A.
- **C. Dock it to the bottom of the canvas on phones**, like a keyboard toolbar. It never covers page content near the selection, but it sits further from what you selected.

No default: until Lex chooses, the bar stays as it is today, and 43's decision stays open rather than reversed.

Also for Lex: ticket 43 waived its "test fails before the fix" rule for F-bar-01, because there was no app fault (its UX check selected `main`, which has no bar by design). A phone spec now pins the behaviour. Accept the waiver, or say what should fail first.

## Decided behaviour (Lex, 2026-10-29: option C)

"Make it work the same as other word editors on mobile": on a phone the edit bar is a toolbar docked to the bottom of the screen, like the formatting toolbar in Google Docs or Word on mobile.

- **Phone only.** "Phone" is the editor window being phone-wide (the editor's existing `(max-width: 650px)` phone rule), not the 390 px device frame chosen on a desktop. Desktop and tablet widths keep today's placement exactly (above, below or pinned by the selection, `editBarPlacement`), including a 390 px device frame on a 1280 px window.
- **Docked.** On a phone the bar spans the canvas width at the bottom of the screen, clear of the home indicator (safe-area inset), with its controls in one row that scrolls sideways when they don't fit (no wrapping into a tall block). It does not move with the selection or the page scroll. Its "Paragraph" style name chip stays first.
- **Never covers page content.** The bar takes its own room at the bottom of the canvas (the page ends above it and can scroll fully clear of it); nothing of the page sits under it. It stays clear of the "… Undo" strip (`src/announce.ts`) and the phone sheet's handle: neither covers the other.
- **Keyboard.** When the on-screen keyboard is open the bar sits right on top of it and follows it as it opens and closes, tracked with the VisualViewport API (`resize` and `scroll` of `window.visualViewport`). The phone layout must not flip when the keyboard takes height (the phone sheet needs `min-height: 500px`), so the layout viewport stays put: set `interactive-widget=resizes-visual` explicitly in `index.html`'s viewport meta and lift the bar by the keyboard's height from VisualViewport. Without VisualViewport the bar simply stays at the bottom.
- **The selection stays visible.** When a new selection (or the bar's own height change, or the keyboard opening) would leave the selected element hidden behind the bar or keyboard, the page scrolls just enough to bring it into view above the bar, once per selection, never on the user's own scroll. This replaces today's phone "room scroll" (`roomScroll`) on phones; desktop is unchanged.
- **Menus and fields from the bar** (Text size, Link's address, Variants, Ask agent's note) open upward from the docked bar and stay inside the screen above it and above the keyboard.
- Feedback stays on the controls (no toasts); theme tokens and the existing bar components only, no new colours; modern CSS (logical properties, `env(safe-area-inset-bottom, 0px)`, no `100vh`). Builder: load the good-css and emil-mobile-native skills before writing the CSS.
- Ticket 43 closes with this ticket: its deferred rule "the bar never covers the element above it" is met on phones by docking. Append a short dated note to 43's Done saying so (and that Lex accepted the F-bar-01 waiver, lead 2026-10-29), and set 43 `status: closed`.

## Files

- the edit bar's placement (`src/components/edit-bar-placement.ts`, `src/components/edit-bar.ts`, `src/components/edit-bar.css`) and the canvas it docks into (`src/components/native-preview.ts` and the canvas styles in `src/style.css` if the room for the bar is made there)
- `index.html` (the viewport meta's `interactive-widget`)
- `tests/edit-bar-placement.test.ts` and the edit-bar specs that pin today's phone placement (`tests/native-save/native-edit-bar*.spec.ts`, `native-text-size.spec.ts`), updated to the docked bar on phones
- the F-bar-01 and F-bar-03 shot steps (`scripts/agents/shots/features/F-bar-01.json`, `F-bar-03.json`) if they need a step for the docked bar
- the F-bar-01 entry in `docs/agents/features.md` (its Good line)
- ticket 43 (`43-phone-edit-bar-fixes.md`): Done note and `status: closed`

## Done when

- At 390×844 light and dark the bar is docked at the bottom, covers no page content (the last line of the page can be scrolled clear above it) and the selected element is in view above it, in the F-bar-01 and F-bar-03 UX checks (shots in the Done). A shot at a short phone viewport (keyboard-open stand-in, e.g. 390×500 with VisualViewport smaller than the window) shows the bar right above where the keyboard starts.
- At 1280 px the F-bar-01 and F-bar-03 shots show today's placement unchanged.
- Unit tests in `tests/edit-bar-placement.test.ts` for the pure rules: the docked bar's lift from VisualViewport numbers (keyboard closed, open, page zoomed/scrolled visual viewport), and the scroll that brings a hidden selection into view above the bar (already visible: 0).
- A phone spec (390×844) pins: bar docked at the bottom edge of the canvas, the selected paragraph not under it, and the page's last element reachable above it; a desktop spec still sees the bar by the selection.
- `kit unit --affected`, `kit specs --affected`, `kit doctor` pass.

## Comments

- Lead, 2026-10-29: accepted ticket 43's F-bar-01 waiver (no app fault; the phone spec pins the behaviour). The placement question is in the 2026-11-03 Tuesday pack with C recommended.
- Lex, 2026-10-29: "can we make it work the same as other word editors on mobile?" → option C: on phones the edit bar docks to the bottom of the screen (above the on-screen keyboard when it is open), like Google Docs and Word on mobile; it never covers page content. He also noted that mobile needs many more space changes in general (a later piece of work, not this ticket).

## Done (2026-10-29)

- **Docked on phones.** On a phone-wide window (the editor's `(max-width: 650px)` phone rule) the edit bar is a toolbar in its own row at the foot of the canvas, under the page frame and above the phone sheet's handle: one row, the name chip ("Paragraph") first, then the groups, scrolled sideways when they don't fit. The frame ends where the bar starts, so no page content sits under it and the page's last element scrolls clear above it. It does not move with the selection or the page scroll, and it stays while its selection is scrolled away. Its foot keeps 8 px (plus the safe-area inset) clear of the sheet handle, and the name chip is 24 px tall there. Desktop and tablet widths, including a 390 px device frame on a 1280 px window, keep the placement by the selection unchanged. `src/components/edit-bar.ts`, `src/components/edit-bar.css`.
- **Keyboard.** `index.html`'s viewport meta now says `interactive-widget=resizes-visual`, so the keyboard leaves the layout put. The bar is raised by `dockLift` from `window.visualViewport` (its `resize` and `scroll`) so it sits right on top of the keyboard, or at the foot of a zoomed-in view, never past that view's top. Without VisualViewport it stays at the canvas foot.
- **Selection in view.** When a selection is chosen, the canvas, the bar or the keyboard changes height, or a toast shows, a selection hidden behind the bar, the keyboard or a toast standing on the bar is scrolled into view 8 px above it (`dockScroll`, once per such change, 400 ms after it so a double-click can land; never on the user's own scroll). A selection taller than the room shows its top under the sticky header. This replaces the phone `roomScroll`, which is gone with its test file `tests/edit-bar-room.test.ts`. Ask agent's note stays by the selection, kept above the bar.
- **Toasts.** The docked bar carries `data-toast-avoid`, so a toast shown after it stands above it. A toast that was already showing when the bar docked raises the bar above itself until it goes. Neither covers the other.
- **Menus and fields** from the docked bar (Link's address, Variants, menus) open upward, as tall as the room above the bar allows (80 to 320 px). Text size and Heading level are native selects.
- Tests: `tests/edit-bar-placement.test.ts`: "docked: no lift with the keyboard closed", "… lifted right on top of the open keyboard", "… a zoomed, scrolled visual viewport lifts the bar to its foot, never past its top", "… a selection in view above the bar needs no scroll", "… a selection behind the bar or keyboard scrolls just into view 8 px above it", "… a selection taller than the room shows its top, under the sticky header". `tests/native-save/native-edit-bar.spec.ts` › on a phone: "the bar docks at the canvas foot, clear of the selected paragraph and of the page's end" (390×844: docked at the canvas foot across its width, the frame ends above it, the paragraph placed at the foot scrolls into view above it, the page's footer scrolls clear above it, and the bar stays put). In the same file, the "Heading just added" phone test now polls the bar/strip overlap after both have shown (43's P3 race). The desktop test "the bar anchors to the selected heading …" still sees the bar above or below the selection.
- Shots (main checkout, `.scratch/ux/am-46-builder/20261029/`): `editor-F-bar-01-{390,1280}-{light,dark}{,-bar-strip}.webp` and `editor-F-bar-03-{390,1280}-{light,dark}{,-size-strip}.webp` (`kit shots --steps`, `RESULT: ok shots 14 files, 0 failed` for each). At 390 px the bar is docked at the foot in light and dark, and the selected element is in view above it and above the toast. The F-bar-01 strip shows the new Heading under the "Heading added" toast for about half a second before it scrolls clear. At 1280 px the bar sits by the selection as before. Keyboard stand-in: `keyboard-390x844-vv500-{light,dark}.png`, a 390×844 window whose VisualViewport ends at 500 px (a 344 px keyboard, drawn hatched): the bar ends at 500. `f-bar-03-390x844-{light,dark}.png`: the sized paragraph clear above the "Text size L" toast. The F-bar-01 and F-bar-03 step files needed no change.
- Feature list: F-bar-01's Good line now describes the docked bar on phones.

