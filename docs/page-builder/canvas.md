# Canvas

The preview is a design-tool canvas, and the canvas and the code pane stay visibly linked.
Nothing here writes to the site: breakpoints, labels, the breadcrumb and the spacing
overlay are editor chrome. Selecting through them is the same selection a click makes, so
every edit that follows is still one readable source edit.

## What the user can do

- **Breakpoints.** The bar above the canvas has Desktop (the frame fills the canvas),
  Tablet (768 px) and Mobile (390 px). A framed width stands centred on a dotted canvas
  with a handle on each side: dragging a handle changes the width (both edges move, so
  the frame stays centred) and a pill shows the live width. The width field shows the
  frame's width at all times; type a width and press Enter, or use ↑/↓ (Shift: 10 px).
  A focused handle takes ←/→ (Shift: 50 px), Home (narrowest) and End (fill). Dragging
  or typing to the canvas's width goes back to Desktop. The width lasts for the browser
  session (`sessionStorage`). The width changes with a 200 ms ease-out, none under
  reduced motion.
- **Hover labels.** The hovered element gets a small label at its top-left corner: its
  tag and first class (`section.hero`), else its id, else its tag; a component instance
  shows its tag. Components and what their templates render wear the component accent
  (`--component`), since editing them changes every instance; the page's own elements
  (slotted ones included) wear the selection colour.
- **Breadcrumb.** The bar's left side shows the selection's ancestors, from the page's
  `body` to the selection (`body › main.page › section.hero › h1`), through component
  instances and their templates (`project-card › article.project-card › card-note ›
  p.card-note`). Hovering or focusing a crumb outlines its element with a dashed box;
  clicking selects it, exactly as clicking it on the canvas would; `body` clears the
  selection (the style panel then shows the body's rules). Esc and Ctrl/⌘+↑ in the
  canvas select the parent, and past the top, nothing. While typing into text, the first
  Esc still drops the typing and the next one climbs.
- **Code → canvas.** In a page's or component's HTML, moving the cursor by a click or a
  key selects the element it is in (innermost, from its start tag up to its end tag): the
  edit bar, structure and styles follow, the canvas scrolls only when the element is out
  of sight, and the cursor stays where it is. Typing, undo, selecting a range of text
  and the editor's own reveals do not select, a click on the canvas wins over a cursor
  move still waiting, and a position is dropped when the file changed after it. Hovering a line in the code outlines the element that line belongs to
  with a dashed box and its label.
- **Spacing overlay.** The bounding-box button on the bar shades margin (orange) and
  padding (green) of the hovered element, else of the selection, with the size in px on
  any band 14 px or more wide. It lasts for the session.

## How it is built

| Part | Where |
| --- | --- |
| Pure rules (widths, devices, session value, crumbs, innermost extent, code event) | `src/page-builder/canvas-model.ts` (unit tests: `tests/canvas-model.test.ts`) |
| Bar, stage and side handles | `src/components/canvas-bar.ts`, `canvas-bar.css` |
| Offset in a source → element index path | `src/page-builder/canvas-source.ts` (reverse of `native-source-location.ts`, same parse) |
| Code pane → canvas, debounced (hover 40 ms, cursor 120 ms) | `src/page-builder/code-link.ts`; the editor reports through a `native-code-pointer` window event from `linkToCanvas` in `src/components/code-editor.ts` |
| Wiring | `src/components/native-preview.ts` (bar created with the pane; crumbs from each `select`; `canvas-clear`) |
| Labels, dashed hint box, spacing shading, crumbs, Esc/Ctrl+↑ | the "Canvas" block in `public/native-preview-runtime.js`, called from `updateBoxes` and `emitSelection` |

Runtime messages: the host sends `canvas-crumb` (`action` `hover`/`select`, `index` into
the last crumbs sent, -1 for the body), `canvas-hint` (`request` `{path, node}` or null),
`canvas-code-select` (`request`) and `canvas-spacing` (`on`), and the `theme` message
carries the component colour. The runtime adds `crumbs` (`{label, kind}`, outermost
first) to `select` and sends `canvas-clear` when Esc climbs past the top or the body crumb
is chosen. A code-driven selection is reported as a `refresh`, which reveals nothing in
the code pane.

The overlays are elements on the frame's `<html>` marked `data-native-selection-box`
(`label`, `hint`, `spacing`), never inside the page root, so structure, insert points,
inspection and source mapping do not see them.

## Tested

- `tests/canvas-model.test.ts`: width settling, devices, session value, crumb checking,
  innermost extent.
- `tests/native-save/native-canvas.spec.ts`: breakpoints, centring, page width inside the
  frame, handle drag with the live pill, handle keys, typed width, session memory across
  a reload; hover labels (page and template); breadcrumb, crumb hover and select, Esc and
  Ctrl+↑, body crumb; breadcrumb through nested components; code hover hint, code click
  and arrow keys selecting, typing not selecting; spacing overlay on and off.

## Known gaps

- Hover labels on an element that sits under the edit bar are covered by it.
- The code pane's hover maps a line to its first tag (or the element around it), not
  the exact character under the pointer; the cursor maps the exact offset.
- On a canvas narrower than a device's width (Tablet on a small window), the frame
  takes the canvas's width; it is not zoomed out.
- A typed or dragged width is not part of the site (no media query is written); it is
  for looking at the page at that width.
