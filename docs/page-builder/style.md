# Style panel

The Style tab at the right edge of the canvas opens a docked panel. Select an
instance on the canvas or in Page structure. Every native HTML class appears as a
chip. The pressed chip identifies the one class rule being edited; choosing
another chip keeps the selected breakpoint, state and open sections. The selector
and stylesheet path are visible below the chips. The code panes stay underneath
the canvas and panel.

The panel covers Layout, Spacing, Size, Typography, Background, Border and Effects, including transform and transform origin.
Spacing opens first. Click a side of the box model to type a CSS value; bare numbers
become pixels. Drag a pixel value horizontally to scrub it, or use Alt+arrow keys
(Shift changes the increment to 10px). Each ring has its own linked-sides toggle.
A scrub commits once on release. Variables and non-pixel units remain editable by
typing; scrubbing never silently converts them to pixels.

Authored values appear normally; computed values appear muted as defaults. Font
families include the site's `@font-face` families and `--font-*` presets. Colour,
spacing and type controls offer the site's variables, writing `var(--name)`.
Columns accepts either an integer from 1 to 24 or a CSS grid template. Clear a
field to remove its explicit declaration. CSS shorthand values are expanded for
display; removing a longhand does not erase an existing shorthand.

Add class is available for every selected element. It appends one token to the
native HTML class attribute, preserving the other tokens in their original order
and leaving other attributes intact. An existing token is a no-op: even its
source quotes and entity spelling remain unchanged. A new token becomes active
and its HTML edit is one Undo step. Class chips do not remove classes.

HTML character references are decoded before tokenising the attribute on HTML
ASCII whitespace. A non-breaking space remains part of a single token. Writing
the attribute escapes its decoded values once. Unicode and punctuation in class
names remain native class names; CSS selectors escape them where required.
Styling never writes an inline `style` attribute. The writer prefers a matched
local CSS rule whose selector is exactly `.activeclass` or `.parent .activeclass`,
choosing the most specific matched parent rule and then source order. Other
selectors remain available in the existing cascade pane. Without such a rule,
the panel appends `.activeclass` to a local stylesheet linked by the page.

The dock starts folded and restores its saved width when opened. Its default
width is 280 pixels. Drag its left grip to resize, or click it to fold and restore.
Enter and Space toggle the grip; Left grows the dock and Right shrinks it in
10-pixel steps, or 40 pixels with Shift. Home folds and End uses the available
maximum. Width and the last open width persist in local storage. The dock clamps
to its parent width and reserves canvas space on narrow screens. Escape, the
header close control and the original Style opener use the same fold state.

All sizes edits the base rule. Tablet ≤768 and Mobile ≤390 write inside a matching
`@media (max-width: …px)` block. Existing matching blocks are reused; compound
conditions are kept separate. The selected rule's layer is retained when creating
media and state rules. State chooses none, `:hover` or `:focus-visible`. Hide on
this size writes `display: none` within the selected media/state scope.

Global styles lists the site's local `:root` variables by Colours, Typography,
Spacing and Other. Changes edit their original rule, including selector lists and
nested layers. Colour aliases resolve using the site's variables, so editor
palette tokens cannot change the site's swatches.

Each committed change uses one verified Monaco source edit and the existing
preview pipeline. Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z in the panel use the shared source
undo/redo history. Escape collapses the panel and restores focus to its opener.
There is no decorative animation; reduced-motion users get the same stable UI.
The chrome uses `src/theme.css` tokens in both colour schemes.

## Integration

- `src/components/style-panel.ts` and `.css`: dock, controls, variable presets,
  global styles, class chips, box model and keyboard/pointer handling.
- `src/components/style-panel-resize.ts` and `.css`: shared grip/press behaviour,
  width persistence, accessible keyboard sizing and observer cleanup.
- `src/page-builder/css-write.ts`: source-only rule scanning, class-rule location,
  declaration edits, media/state insertion, indentation/CRLF preservation and
  variable discovery/resolution.
- `src/page-builder/breakpoints.ts`: `getCurrentBreakpoint()`,
  `setCurrentBreakpoint("all" | "tablet" | "mobile")`,
  `subscribeBreakpoint(listener)` (returns unsubscribe), and `breakpointWidths`.
  The canvas device switcher can subscribe to and set this shared state. This
  slice does not resize the canvas when the selected editing breakpoint changes.
- `src/main.ts`: imports, panel mounting beside the preview, a source/cascade
  adapter, source edits through `applyNativeChange`, and refresh hooks for source
  changes and selections. Existing cascade rendering is retained.
- `public/native-preview-runtime.js`: `emitSelection` additionally reports the
  panel's computed CSS properties, including properties with no author declaration.

## Validation

`tests/css-write.test.ts` covers 40 cases: comments, quoted punctuation and URLs,
CRLF, spaces/tabs, missing semicolons, duplicate declarations, `!important`, nested
rules/layers, condition isolation, state rules, rule indexes, class escaping,
variable aliases and breakpoint subscriptions.

`tests/native-save/native-style-panel.spec.ts` covers ten browser flows: padding
source/preview/undo, a variable preset and global colour edit, tablet/state/hide
rules, Add class without inline CSS, linked sides plus scrub undo, light/dark
screenshots plus Escape, scoped transforms, stale detached controls, and malformed
CSS rejection, and repeated focused selects and presets. Screenshots are `.scratch/style/panel-light.png` and
`.scratch/style/panel-dark.png`; both were viewed during implementation.

The full validation results and inherited-suite failures, if any, are recorded in
the implementation handoff. Logs are under `.scratch/style/`.

## Limits

Styling currently requires a linked local stylesheet. A site with only embedded
or external CSS must add a local stylesheet in source first; the panel does not
create or link a stylesheet automatically. New state rules are authored but the
panel does not force hover or focus in the canvas. The CSS writer deliberately
edits simple matched class selectors rather than rewriting selector lists,
relative nested selectors, or component `:host`/`::slotted` rules.

## Host integration still required

The leaf modules are usable with the recovered host adapter, but its asynchronous
source checks and the canvas device connection must be completed when the shared
host files are integrated. The style panel passes an optional `expected` context
as the fourth argument of `write` and the third argument of `variable` and
`addClass`. A stale detached control is rejected before calling the adapter.
The writer also accepts `expectedSource`; it rejects a changed source even when a
replacement rule has the same selector at the same offset.

In `src/main.ts`, update the recovered `createStylePanel` callbacks as follows:

1. Include `generation`, repository ID and branch in `nativeStylePanelContext().key`
   ahead of the existing selection path/node/class key. This distinguishes an
   identical selection in another repository or branch.
2. In `write(properties, breakpoint, state, expected)`, capture the context,
   generation, target and `context.files[target.path]` **before** `openSecondary`.
   After it resolves, require the generation and context key to match, no
   `versionView`, and the CSS source to equal that captured source. Pass
   `expectedSource: source` to `writeCssProperties`. Do not recompute a source
   location from a newer file using the old `target.start`.
3. In `variable(variable, value, expected)`, capture the generation, context and
   `context.files[variable.path]` before opening the stylesheet. Require the same
   generation/context/source afterwards and pass that source as `expectedSource`.
   Keep `variable.selector` and `variable.ruleStart` from the captured variable;
   the writer refuses a missing or mismatched explicit rule location.
4. In `addClass(name, expected)`, require the current context key and page source
   to equal the supplied context before locating and editing the selected HTML
   element. Route this through the corrected `setAttributeEdit` implementation.
5. On rejection announce that the target/source changed and ask for a fresh edit;
   do not retry against a different selection. Preserve the existing verified
   `applyNativeChange` edit and undo path.

For shared canvas sizing, integrate in `src/components/canvas-bar.ts`, whose
`setWidth` currently owns the width and device buttons. Use the same
`breakpoints.ts` state, with `desktop` mapped to `all`. Derive the scope for custom
widths: ≤390 is `mobile`, ≤768 is `tablet`, and wider/fill is `all`. In `setWidth`,
call `setCurrentBreakpoint` with a local `fromCanvas` guard. Subscribe once to
breakpoint changes: when not `fromCanvas`, apply `widthFor` for the corresponding
canvas device. This guard keeps a custom 420px canvas from snapping to 768px when
it publishes the tablet scope. Initialise from the remembered canvas width and
unsubscribe in `destroy`. Keep the existing width storage and custom-width field;
the panel and device controls then describe one shared responsive editing scope.

## Recovery checks

The recovered six browser flows passed before changes on port 5276. Added
regressions cover transform/media/state source writes, detached field callbacks,
and refusing an unfinished stylesheet. The CSS unit suite also covers malformed
structure, stale source/rule locations, comments within values and literal comment
punctuation within strings. The light and dark screenshots were regenerated and
visually inspected. Shared `main.ts` and preview runtime changes are deliberately
outside the leaf-module commit; their integration and the asynchronous host race
must be verified separately.

Focused controls advance their source snapshot after a successful edit only when
its resulting CSS exactly matches the writer's expected text and all other site
sources, selection identity and target remain unchanged. This permits repeated
select/preset changes without accepting an intervening external source edit.
Duplicate declarations retain the last important declaration when any declaration
is important; otherwise the last declaration remains the editable one.

Adding a class preserves the existing quoted attribute’s raw entity spellings,
whitespace and quote character. Only the new token is HTML-escaped and appended;
an unquoted value is quoted when needed. A duplicate leaves the source unchanged.
Selector matching collapses only CSS whitespace outside strings, comments and
escapes, so distinct attribute values and escaped class names remain distinct.

Search styles filters native property controls by label, CSS property, section,
or familiar terms such as “round corners”. Matching sections open while searching;
clearing restores their previous folds. Typing filters the existing controls,
keeping their focus and captured source context. The catalogue includes positioning,
flex and grid sizing, overflow, typography and image positioning. Numeric defaults
add pixels only to individual length properties; ratios, line height, order and
flex growth remain unitless. Every edit still passes native CSS validation.

Right-click a property, or press Shift+F10 while it has focus, to choose a compatible
site variable. Candidates retain their authored value and stylesheet path; duplicate
names remain separate entries. Compatibility uses native CSS validation and only
unambiguous variable chains. This list does not predict the cascade. Choosing writes
`var(--name)` as one undoable CSS edit; it does not convert colours to hex.
Arrow keys move through the menu, Escape restores field focus, and leaving the menu
closes it. A captured choice cannot write after its source or selection changes.

Variable definitions share a fresh workspace with both code panes. Opening a
definition validates the repository, page, component graph, complete source snapshot
and original requester model around asynchronous work, then reveals the actual CSS
source offset. Code completion and hover use the same definitions and provenance.

The selected class is shared: edits apply to every matching element, rather than
only the clicked element. The target card keeps its native selector and CSS path
visible. Show in code reveals that target explicitly, without switching the code
pane when a class chip is selected. A changed target refuses the captured link.

Variable menus show names above their original values and source paths. Up/Down
move between choices; Right opens the definition action, Left returns to its choice,
and Tab or Escape returns to the field. Refresh restores field focus only for the
same selection. When no workspace is available, the browser context menu remains
available. Search has a separate icon and one explicit Clear control.
