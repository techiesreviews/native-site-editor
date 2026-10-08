# Add panel

The Add panel lists authored section components and user-saved plain HTML sections as live thumbnails and adds one to
the page by a click or by dragging it onto the canvas. It replaces the small picker that the
plus buttons between sections used to open.

## What the user can do

- **Open it** with **Add** in Page Structure. It docks at the left of
  the workspace, over the page structure, and stays open while you work: click the canvas,
  select another section, add several sections in a row. Close it with **×**, **Esc** or
  **+ Add** again.
- **Open it for one gap** with the plus between two sections. It works like the old picker:
  the title says exactly where the section goes ("Goes before “Work”"), the search has focus,
  arrows move through the items, Enter adds, Esc goes back to the plus, and the panel closes
  after adding.
- **See what you get.** Components render at the canvas's width with the
  site's own stylesheets, the component's stylesheet and its fallback content, scaled down.
  Items are grouped by the first word of their tag when several share it (`section-hero`,
  `section-split` → **Sections**: Hero, Split) and put in the order a page usually has them
  (hero and intro first, contact last). Search matches the name, the tag and the group.
- **Click to add.** From **+ Add**, a click adds the section right after the selected section
  (or after the section around the selected element), else at the end of `<main>`. The panel
  shows specific destinations before you click; the routine “Goes at the end” line stays hidden.
- **Drag to add.** Drag an item onto the canvas: the gaps of the target's parent show as
  lines and the one under the pointer as a band ("Add “Hero” here"); the frame scrolls near its
  top and bottom edges; **Esc** or a release off the canvas cancels. A drop is the same edit
  as a click on that gap's plus.
- **Start an empty page.** A page whose `<main>` has nothing in it shows **Start with a
  section** over the empty area, with available authored or saved sections as thumbnails (a click adds
  one) and **Browse all sections** (the panel). Unsaved Intro, Features, Split and Contact defaults
  are not offered there or in Add. The empty area is also a drop target ("Release
  to add Hero"). The plus at the end of that `<main>` gives way to it.
- **See what changed.** After any insert (panel, plus, empty state, drag) the new section is
  selected, scrolled fully into view and outlined in the component violet for a moment (a
  static outline under reduced motion). The code pane shows its source, and ⌘Z undoes it.

## How it works

- `src/page-builder/add-panel.ts` (+ `add-panel.css`): the panel. The list is built once per set
  of components; search hides items, so thumbnails are not reloaded while typing.
- `src/page-builder/thumbnail-doc.ts` (pure): the thumbnail document. It is the markup the
  insert would write (`instanceMarkup`), inside the page's own `<main …>` start tag, with every
  component expanded as a declarative shadow root (`<template shadowrootmode="open">`) holding
  the shared and component CSS (with the `::slotted()` twins the preview uses) and its template,
  recursively. Images and CSS `url()`s become the data URLs the preview already read. Scripts,
  `on*` attributes, `javascript:` URLs and refreshes are stripped.
- `src/page-builder/thumbnail.ts`: shows that document in an iframe sandboxed with
  `allow-same-origin` only, so **no script runs** (not the site's, not the runtime's) and the
  editor can measure the section to crop and scale it. The document carries its own CSP
  (`default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:`) on top of
  the editor's, so it reaches nothing. No inline scripts anywhere, so the editor's
  `script-src 'self'` holds.
- `src/page-builder/insert-target.ts` (pure): where a click goes (`defaultInsertPoint`) and
  which gap a drag is over (`pointAt`), both picked among the runtime's insert points.
- `src/page-builder/insert-drag.ts`: the drag. The editor holds the pointer (captured on the
  item) and asks the runtime to scroll (`scroll-by`); the drop band is the plus layer's drag
  display (`showDrop` in `src/components/insert-controls.ts`).
- `src/page-builder/canvas-overlays.ts`: the empty state and the highlight, in a layer over the
  frame (editor chrome, never part of the page).
- `src/page-builder/page-builder.ts`: wires these to the preview; `native-preview.ts` passes on
  insert points and selections and exposes `attachAddButton`.
- Runtime (`src/components/native-preview-runtime.js`): insert points also carry their container's
  `tag`, and the end-of-`<main>` point says `empty` (no element and no text) with its `height`;
  an empty `<main>` gets a preview-only `min-height` so the empty state has room; a
  `scroll-by` message scrolls the page (smooth unless reduced motion).
- `src/main.ts`: the **+ Add** button in the top bar and the dock area (the workspace's left
  edge, the sidebar's width).

## Tests

- `tests/page-builder-add.test.ts`: grouping, names, search, suggestions, click and drop
  targets, and the thumbnail document (CSP, declarative shadow roots, CSS order and imports,
  `::slotted()` twins, data URLs, nothing that runs, a template that uses itself).
- `tests/native-save/native-add-panel.spec.ts`: + Add, live thumbnail in a script-less frame,
  absence of HTML peeks and code toggles, click after the selected section with the panel staying and the
  highlight, drag onto a gap, Esc cancelling a drag, one undo step, a plus opening the panel for
  its gap with keyboard and closing after.
- `tests/native-save/native-page-sections.spec.ts`: the new-page test now adds through the
  empty state (the end-of-`<main>` plus is hidden there). `native-insert.spec.ts` passes
  unchanged against the panel.

## Known gaps

- Native elements share the catalogue with section components. Grid and Columns remain
  unavailable until layout CSS integration is complete.
- Thumbnails show the template's fallback content; a slot whose fallback is not text (a list,
  another component) shows what the template has.
- Templates with slots that the preview hides when empty are shown as written.
- Touch dragging uses the same pointer events but was only tried with a mouse.

## Review fixes

- While History shows an earlier version, nothing is added: the panel closes, "+ Add" is
  disabled, the runtime's insert points (counted in the old markup) are ignored, and any insert
  is refused, until Back to latest.
- With an element of a component's template selected (the selection's file is the component),
  a click adds after the page element that instance renders in: the runtime's `select` message
  carries that element's page index path as `pageNode`.

## Native preview and destination feedback

Native thumbnails use a 320px viewport and a compact aspect ratio so text stays
readable. Component thumbnails keep the full canvas viewport. An Image with no
available thumbnail asset shows a picture icon in editor chrome. The supplied
thumbnail document, page HTML and insertion markup stay unchanged.

Unavailable items are dimmed and remain keyboard reachable. Focusing, clicking
or dropping an item at a refused destination explains the refusal in the visible
position text. The header follows the currently hovered or keyboard-focused item;
leaving it, hiding it in search or reopening for a gap restores the general
destination. Hover derives only the active item's destination. Opening, source
refresh and selection/point changes update all availability states. Clicks and
drops always derive a fresh point, so stale availability cannot permit insertion.

`tests/native-save/native-add-panel-ux.spec.ts` checks native text readability,
the Image fallback, disabled feedback, hover derivation counts, changed source
availability and refused drops.
