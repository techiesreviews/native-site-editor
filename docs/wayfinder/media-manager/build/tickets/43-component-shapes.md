---
title: Components open on their own shape
type: task (AFK)
status: closed
assignee: claude (mm-43 runner)
blocked_by: [39-image-button-and-popup]
builder: sol
phase: 3
---

## What

Ticket [09](../../tickets/09-prototype-crop-and-focus.md#resolution-2026-10-13) "Components, sharing and backgrounds".

- When a component's CSS gives its picture a fixed shape (`aspect-ratio`, `object-fit` on the slot's image), the popup opens on that shape, labelled "Card's shape (4:3)".
- Other shapes stay available with a note that this item will look different from the others.
- A component template's own fallback picture has no image popup. CSS background images get no crop or focus point.

## Done when

- `tests/component-shapes.test.ts`: reading a fixed shape from component CSS (`:host` rules, nested rules), no shape when none is set.
- Nightly in `native-image-popup.spec.ts`: a starter card's image opens on "Card's shape".

## Done (2026-10-15)

- **Behaviour.** A page image slotted into a component whose own CSS fixes its picture's shape (a plain `aspect-ratio` ratio with `object-fit: cover` winning on the slotted image) opens the image popup on that shape: the shape menu's first entry "<Component>'s shape (4:3)" (e.g. "Photo card's shape (4:3)", "Section split's shape (4:3)"), the frame and focus dot at that ratio; the edit bar badge reads "<Component>'s shape". Choosing any other shape shows "This <Component> will look different from the others." Original writes inline `aspect-ratio: auto; object-fit: contain`, so the whole picture shows despite the component, and reads back as Original. Choosing the component's shape again removes the inline `aspect-ratio`/`object-fit` and keeps the focus. An inline `aspect-ratio` (even a matching one) or an `object-fit` other than cover counts as the place's own shape; an inline `cover` alone does not. Images outside shaped components are unchanged. Done, Undo and Replace work as in slice 39 (Replace keeps the component shape).
- **Reading the shape** (new lazy `src/page-builder/component-shapes.ts`, no DOM): the component's own CSS only (folder `components/<tag>/<tag>.css`, else flat `components/<tag>.css`, folder first as `nativeConventionComponents`), each selector through its `::slotted()` twin or its own `::slotted()`: the slot's side matched against the template's real `<slot>`, the argument against the page image among its real siblings; `:host`/`:host(<compound>)` against the instance's attributes; nested rules flattened; `@media`/`@supports`/`@container` rules left out; state rules (`:hover`, `:focus` …) left out of the resting shape; `@layer` order and `!important` resolved by `shared/cascade.ts`. `component-css.ts` gains `flatRulesWithLayers`, `hasStatePseudo`, exported `matches`/`Match` and `:host` matching (unused by Make component, which sets no host).
- **Checked, unchanged.** A component template's own fallback picture has no popup: in `components/` files the Image button opens the picker (slice 39); on a page, clicking an instance's fallback picture selects the instance, with no Image button (asserted in the spec). CSS background images get no popup (the popup takes `<img>` only).
- **Commits.** 3f547db3 claim; 3d54b895 build (Sol); baa5423b review 1 fixes; 20f77eb1 review 2 fixes; then this close.
- **Tests.** New `tests/component-shapes.test.ts` (19: selectors incl. `:host`, `:host([attr])`, nested `& img`, explicit and slot-qualified `::slotted()`, labels, no shape when none/without cover/`auto` overrides, conditional rules, layers incl. statement order, anonymous and nested layers and `!important` reversal, state rules, attribute colons, real siblings, default slot, the page helper, flat and folder components, the actual starter's `section-split` 4:3). `image-popup-rules` (entry, badge, note, frame changes, inline cover) and `place-frame` (the two writes) extended. Nightly `native-image-popup.spec.ts`: a seeded `photo-card` (4:3 cover) image opens on "Photo card's shape (4:3)" with its badge, Square shows the note and writes `aspect-ratio: 1 / 1`, the component's shape removes it (renders 4:3), one Undo each, Original writes `aspect-ratio: auto`, reads back Original; an instance's fallback has no Image button. The default fixture has no shaped component, so the browser case seeds one; the real starter's `section-split` is covered by the unit case. `npm run check`, `npm run lint`, unit 2,943/2,943; browser popup, components, image markup, media picker, MCP media 47/47 (build), popup + components 25/25 after each fix round.
- **Review (GPT-6.1 Sol, read-only `review.sh`), 2 rounds.** Logs: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-43/round-1/` and `round-2/` (`run.log`: model gpt-6.1-sol, sandbox read-only; `result.md` starts `REVIEW_STATUS: complete`). Round 1 fixed 3 (P2): slot-qualified `::slotted()` not matched; `:hover` rules counted as resting; `@layer` precedence lost. Round 2 fixed 4 (P2): flat components not found; structural pseudo-classes ignored the image's page siblings; an inline `object-fit: cover` alone hid the component shape; colons in attribute values read as states. Rejected 0. Not re-reviewed after round 2: small, unit-tested fixes.
- **Bytes.** `test:budget` 347 KB gzip before first preview paint (budget 355 KB), as on dev; boot +0 (all new code in the lazy image-popups/image-popup chunks).
- **Follow-ups.** Agents' `frame_image` (slice 45) does not know component shapes: `shape: "original"` on a shaped component's slot image removes the inline shape, so the component's shape shows, and the read reports Original. A later agents slice could pass the component context to `framePlace`/`readPlaceFrame`. Slice 41: the shape menu's first entry may be the component's (`PopupShape` kind `component`); keep it when adding Free.
