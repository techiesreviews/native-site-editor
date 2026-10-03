# Page builder (dev branch)

The `dev` branch turns the visual side of the editor into a page builder, tried out at
https://preview-editor.techies.tools before anything reaches editor.techies.tools. Ideas
are borrowed from Webflow (Add panel, navigator, breakpoints), Framer (insert menu with
live thumbnails, canvas that feels like a design tool) and Etch (native HTML and CSS,
code always one step away). The page builder stays native:

- **The source is the truth.** Every visual action is one readable edit to the site's
  own HTML or CSS files, shown in the code pane as it happens. Nothing is written that a
  person would not write by hand: no editor ids, no data attributes, no generated class
  soup, no runtime in the site ([ADR 0001](../adr/0001-the-repository-is-the-site.md)).
- **Code is never hidden.** Whatever the canvas selects, the code pane can show; whatever
  a panel is about to insert can be read as HTML before it is inserted.
- **Assume nothing about the site.** Features work from what the repository already has
  (its components, its pages, its repeated markup) and degrade quietly when it has none.

## Feel

- Direct manipulation first: drag, click, type on the canvas. Panels support it.
- Fast and calm: motion 120–200 ms ease-out, no bounce; respect `prefers-reduced-motion`.
- Every action undoes with ⌘Z (it is a source edit, so the editor's undo covers it).
- Keyboard reachable: every control focusable, Esc closes, arrows move in lists.
- One look: use the tokens in `src/theme.css` and the rules in `docs/editor-colors.md`
  (panel surfaces, `--current`, `--pressed`, sizes, 12/13/15 px type). Components get a
  single distinct accent across the editor (outline, chip, structure icon):
  `--component` in `src/theme.css` (a violet in both schemes, contrast-checked).

## Slices

Each slice writes its notes in this folder (`<slice>.md`): what it does, how to use it,
what was tested. `docs/NATIVE-PROJECT.md` gets one summary line per slice at merge.
