---
title: "Editor CSS: component-based on the Techies Framework layers, Button first, board shows its CSS"
type: task (AFK)
status: closed
assignee: fleet-lead
builder: claude
blocked_by: [67-tweak-panel]
---

## Goal

Lex (2026-11-11, Orbit card TOOLS-207): "I rather have direct access to all relevant css for this component … instead of everything living in ui/dom.ts and style.css. I want to use my own techies.tools framework to edit this directly in css, component based, so each component gets its defaults. So using layers to determine the priority."

## Decided behaviour

- A short plan maps today's CSS onto the layers `tokens`, `elements`, `components` plus the editor's own unlayered screen CSS, one CSS file per component with its own `--<component>-*` defaults, and orders the migration slices: [css-layers-plan.md](../../css-layers-plan.md).
- Pilot: the Button in its own component CSS file on the components layer, with `--btn-*` defaults after the Framework's `.btn` shape. The editor looks the same (`kit shots --compare dev`); the boot budget of 355 KB holds with no waiver (Lex's decision B).
- On the design board, selecting the Button shows its CSS file in the right panel, readable and editable live: edits apply to the Live cell only, Reset puts it back, and "Send to agent" copies the changed CSS. It replaces the Tweak fields for parts that have their own CSS file. No toasts or explainers.
- The generated framework files are never edited by hand; the editor keeps its own layered files.

## Files

`src/ui/parts/button.css` (new), `src/style.css`, `src/theme.css`, `src/utilities.css`, `src/live-guest.css`; `src/catalogue/css-file.ts` (new), `src/catalogue/css-panel.ts` (new), `src/catalogue/component-css.ts` (new), `src/catalogue/main.ts`, `src/main.ts`, `src/catalogue/board.ts`, `src/catalogue/board.css`, `src/catalogue/parts.ts`, `src/catalogue/tweak.ts`, `src/catalogue/tweak-panel.ts`; `scripts/agents/one-offs.mjs`, `scripts/agents/one-offs.json`; `tests/editor-css-layers.test.ts` (new), `tests/catalogue-css-file.test.ts` (new), `tests/one-offs.test.ts`, `tests/native-save/native-catalogue-board.spec.ts`; `docs/wayfinder/atomic-catalogue/css-layers-plan.md` (new), `docs/agents/code-map.md`.

## Done when

- The plan is in the repo docs.
- The Button's whole look lives in `src/ui/parts/button.css` on the components layer with its `--btn-*` defaults; no other editor stylesheet holds its rules.
- `kit shots --compare dev` shows the editor unchanged; `kit size` shows the boot at 355 KB or lower.
- Selecting the Button on the board shows its CSS file; an edit changes the live cell only, Reset puts it back, Send to agent copies the changed CSS.

## Done (2026-11-11)

- **The plan:** [css-layers-plan.md](../../css-layers-plan.md) maps today's CSS onto `tokens`, `elements`, `components` and the editor's unlayered screen CSS, one file per component in `src/ui/parts/` with its `--<name>-*` defaults, and orders seven slices (the Button first; icon and text buttons; the atoms that already have a file; tokens; elements and the old foundation; molecules; screen layout after the top bar work).
- **Layers:** `src/style.css` starts with `@layer tokens, elements, components;`; the bare `button`, `a` and `select` rules sit on `elements`; a disabled bare button still fades, a Button does not (`button:disabled:where(:not(.button))`, same specificity as before).
- **The Button:** its whole look is in `src/ui/parts/button.css` on `components`, nested, with `--btn-min-block-size`, `--btn-radius`, `--btn-padding-block`, `--btn-padding-inline`, `--btn-background`, `--btn-hover-background`, `--btn-text-color`, `--btn-font-size` and `--btn-font-weight` (tokens only; 14 px is `--space-s` + `--space-4xs`); `secondary` changes only the hooks. Disabled has hooks of its own (`--btn-disabled-background`, `--btn-disabled-text-color`, defaults given in place). Removed from `src/style.css`, `src/theme.css` (and its unused `--foundation-action`) and `src/utilities.css` (with the old site foundation `.section`, `.container`, `.image`, `.content` and its examples, which nothing in the editor or on the board used, and a body font `style.css` overrides). `src/main.ts` imports the file. The live-share guest page, which never loaded the Button, colours Join itself (`src/live-guest.css`).
- **Looks the same:** `kit shots --compare dev` pixel-identical on editor, site-settings, media-gallery, media-select, file-details, image-popup, picker, files, pages, cleanup, improve-images, add-panel, structure and catalogue at 390/768/1280, light and dark (one stale cached "before" retaken fresh; 1-unit anti-aliasing noise on 5 px of the pages tree). After the rebase onto dev at b623ca5: `kit size` boot 355 KB (±0) of 355 KB; the boot JS is byte-for-byte the same size (637 969) and the boot CSS is 116 507 bytes, 19 495 gzip, against 116 958 and 19 592 on dev. Accepted, as hover only: an open image button in Site settings (`.site-settings__image[aria-expanded="true"]`) keeps its pressed colour on hover instead of the plain secondary hover, as its screen rule now wins over the layered hover.
- **The board:** selecting the Button shows `src/ui/parts/button.css` in a CSS section in place of Tweak. The board loads each component file as a style of its own (`component-css.ts`); the live cell draws in a shadow root with the board's other styles, the file as edited and the forced-state copies of both, so an edit (a deleted rule, a selector naming other buttons) stays in that cell and the State option shows edited states. A brace, quote, comment or `url(` that does not close is named beside the field and the cell keeps the last good file; Reset; Send to agent copies the changed lines and the whole file and says Copied. Other parts' Tweak fields leave the components layer out.
- **One-off count:** a hook in a components-layer file counts as the counted property its name ends in; one that ends in none counts as a local property only with a hand-typed length, time or percentage. `one-offs.json` records the falls.
- **Tests:** new `tests/editor-css-layers.test.ts` and `tests/catalogue-css-file.test.ts`, both seen failing first; `tests/one-offs.test.ts` +1; the board spec's Tweak test moved to the Badge, and a new CSS-section test (edit, delete a declaration, refused brace, State Hover with an edited hover colour, deleted hover rule, `:is(&, .secondary)` kept to the cell, dark, Send to agent, Reset).
- **Review:** four Claude Opus rounds and a GPT second look (gpt-6.1-sol, high). Round 1: fixed P1 the guest page's Join colour, P2 hooks escaping the count, P3 braces read unlike the browser, P3 Copied after a later edit. Round 2: fixed P3 the plan wording, P3 an escaped `)` in `url(`. Round 3: gaps only. GPT: fixed two P1s (a deleted hover rule and a selector reaching out of the live cell), by the shadow root. Round 4: fixed P1 the State option inside the shadow root. After the rebase the review started again (kit pr's round 1): fixed P2 the disabled look resetting the hooks a screen sets, P3 the focus taken back to the shadow host (`delegatesFocus`), P3 the board's typing check inside a shadow root, P3 hooks counted outside the components block, P3 an open `(` or `[` not named, P3 a dead `:active` on the Approve button; the Button's `aria-disabled` look and the two screen copies of it are listed for slice 2 in the plan. Declined: counting `%` and `em` in a hook that ends in no counted property is stricter than a plain declaration, on purpose (the hook's use is unknown).
- Feature list: no change (the editor looks the same; the design board is on the preview editor only and outside the feature list's areas)

### Follow-ups

- Validation gaps (gap): R1-11 still open: `since-last-review.patch` adds no board spec that checks focus stays on the live Button after a state frame redraws.
- Standards (P3): e6e70f49c:src/catalogue/css-file.ts:43 — P3 fault: When more than one opener is left unclosed, the message names the outermost one, which is usually not the one the person forgot. For `.a { color: calc(1px }`, the open list ends as `["{", "("]`, because the `(` swallows the `}`. The message is "A { is never closed", but the real slip is the `(` of `calc(`. Someone reading the note will look for a missing `}`, and the rule does have one. This breaks the house rule against misleading messages (CODING_STANDARDS.md, messages say what is actually wrong). Fix: name the innermost one, `open.at(-1)`, and add `assert.equal(cssProblem(".a { color: calc(1px }"), "A ( is never closed")`.
- Validation gaps (gap): R1-11 (still open): in `tests/native-save/native-catalogue-board.spec.ts`, Tab into the live Button, change an option that redraws a state cell's frame (for example the Row menu's open state), then `await expect(page.locator(".cat-livehost").locator("button.button")).toBeFocused()`. This proves the fix (`takeBack()` plus `delegatesFocus`) works in a real browser.

