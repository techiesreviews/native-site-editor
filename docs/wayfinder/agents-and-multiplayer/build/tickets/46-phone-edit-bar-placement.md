---
title: "Where the edit bar sits on a phone, so it doesn't cover the element above (follow-up on 43)"
type: task (AFK)
status: open
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
