# Compact Structure slots

The Structure tree shows every authored element of a page as a native row, in
source order. Each element kind has a Phosphor Regular icon. The kind name remains
available to screen readers. Component rows keep their separate diamond marker.
Children assigned to a component slot, simple or rich, stay real
rows: the slot is a purple badge on the row, never a grouping, and unknown slot
names stay ordinary rows.

- Selecting a row only marks it and selects the element in the preview. It never
  opens fields or takes focus from the canvas. A canvas selection unfolds the
  rows above its row once; a later source render keeps manual folds.
- A slot's pencil (`Edit <Slot>`), F2 on its row, or its badge opens one inline
  editor at the slot's first assigned root (the badge selects that root) and
  focuses its first field. Escape or Close shuts that editor and returns focus to
  the row.
- A slot filled only by text (`<x-card>Hello</x-card>`) gets an ordinary,
  editable slot row anchored to its instance: no element index and no Move.
- A slot with nothing assigned (`!filled`) shows a dim restoration row: an
  optional slot has a visible Show checkbox, a defaulted slot a pencil. Showing
  or first editing it moves the editor onto the new element. A refused Show
  leaves the row closed and arms nothing.
- A Show waits for a fresh paint before its editor settles: with the
  `pageSource` handler, `paintedSource` must equal the current page bytes, and
  the painted children must hold the slot's actual assigned nodes with the same
  slot name. A stale paint neither opens a wrong row, spends the focus request,
  nor forgets the pending Show. A paint of unknown freshness also keeps it
  waiting. A paint proven current that still lacks those nodes (the markup was
  reshaped, or the `slot` attribute's raw whitespace differs: slot names match
  exactly, as in the browser, and are never trimmed or rewritten) drops the
  request and announces it, so no later render opens the editor or takes focus.
  If focus moved elsewhere (the canvas caret) in the meantime, the editor opens
  without taking it.
- `main.ts` does not pass `pageSource` yet. Until it does, the app has only the
  path-plus-slot-name check: `paintFresh` stays undefined, so a stale paint
  cannot be told apart and a pending Show may settle on it.
- Only text, link and image slots have an editor. Content slots (rich or several
  roots) keep their full native subtree; their badge selects the first root.
- An editor whose anchor disappears (Hide, or a source change such as Undo or
  Redo) is forgotten, so it never reopens unasked. The tests swap the source by
  hand as a stand-in for Undo/Redo; they do not drive the real history journal.
- Enter applies a field and returns focus to its row.
- Row actions use the shared fade (`row-action-overlay.css`): an instance row
  hosts its own; a slot row's label hosts the pencil, visibility checkbox or
  Reset, so the badge stays uncovered. Buttons are the overlay's direct
  children and inert at rest; hover or keyboard focus reveals them over the
  row's own background (resting surface, hover/focus, then current), within
  140ms or at once for keyboard and reduced motion. Hover and current are
  translucent tints, so Structure adds an opaque layer of its real surface
  under the shared tint layer: the fade ends in the row's actual composited
  colour and hides the text beneath. That surface is the sidebar's
  `--surface-subtle` (`.sidebar` in `style.css`); a host on another surface
  sets `--structure-surface`. The pixel tests load the real `theme.css` and
  `style.css` and nest Structure in `.sidebar` as the app does. A 280px sidebar
  has 240px of content; `.page-structure`'s -10px side margins make the tree
  260px and rows 252px (240px, 200px, 220px and 212px at the middle
  breakpoint). The same test also proves the opposite: with the base layer
  hidden, or painted in `--panel-surface`, the sample differs from the row,
  and at rest it shows the text's ink. Keyboard focus on the row or its badge reveals the actions;
  neither hover nor focus opens an editor. Coarse pointers place them in the
  row flow with 44px targets. A missing slot's Show stays visible.
- Hide and Show checkboxes keep their small box inside a label that gives
  coarse pointers a 44px target; a tap on it never selects the row.
- In the inline editor, captions sit above full-width fields, so a 280px
  sidebar shows `Button text`, `Link / URL` and a URL such as
  `/about/#contact` whole.
- An instance row's icon actions: Attributes (inline), Edit component (opens the
  shared template) and Disconnect this instance.
- Pointer drag moves only among the pressed row's real siblings and maps the gap
  to the target's native index; a lone row refuses.

Field writes keep the component tools' source guards: sessions open on first
focus and reject foreign source, template, scope or model changes.

Tests: `tests/native-save/native-structure-compact.spec.ts`, plus the migrated
mock baselines `native-structure-slots.spec.ts` and
`native-structure-rich-slots.spec.ts` (their harnesses paint the parsed source
and, like `main.ts` today, pass no `pageSource`).
