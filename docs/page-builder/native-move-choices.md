# Native element move plans

`src/page-builder/native-move-choices.ts` is a pure source helper for an ordinary
HTML Move menu and sibling keyboard actions. It does not write drafts, change
selection, register history or modify the preview. The main workflow remains the
single host writer.

- `nativeElementMoveChoices(source, from)` returns `{ label, destination }` choices
  for compatible other containers, at their end. Labels include the HTML tag,
  decoded `#id` and `aria-label` when present, plus an element path to distinguish
  repeated containers. The current parent, selected element, descendants, opaque
  boundaries and illegal destinations are excluded.
- `nativeElementMovePlan(source, from, { parent, index })` returns either
  `{ status: "moved", edit, selection }`, `{ status: "stayed", reason }` or
  `{ status: "refused", error }`. `reason` is `"already-position"` for a legitimate
  adjacent gap that leaves the element in place. Invalid HTML, paths and content
  rules produce `refused`, not a successful no-op.
- `nativeElementSiblingMove(source, from, "up" | "down")` uses the same result.
  A valid element at the first/last sibling boundary returns `stayed` with
  `reason: "edge"`. Invalid and opaque selections are refused.

Every candidate and successful plan uses the existing `nativeMoveEdit`; its strict
balanced-source and browser content rules remain authoritative. The small source
index only enumerates paths and labels. Full document paths start inside the body,
exclude scripts and refresh metadata, and do not enter template/custom/foreign
boundaries.

The destination refers to the original source's element-child gap. `selection`
refers to the resulting source: it accounts for removal of an earlier sibling
shifting the destination container, nested destination paths and same-parent
insertion indexes. It never searches for markup, so identical siblings retain an
accurate selected path.

The host must derive a fresh plan from its effective source and apply it with
`applyGuardedSourceEdit(currentSource, plan.edit)`. The edit carries its complete
source snapshot and original replacement bytes; stale sources return `undefined`
and must be refused before a host write. Repository, branch and generation guards,
one-step Undo and selection updates remain host responsibilities. The core move
operation preserves neighbouring comments and whitespace-sensitive pre/raw text,
including their line endings, while reindenting ordinary structural markup.

`tests/native-move-choices.test.ts` covers destination labels and exclusions,
identical siblings, parent index shifts, ancestor moves, sensitive bytes, stale
snapshots and invalid/opaque/table/form/interactive cases. A headless Chromium
check resolves the returned path against the actual resulting DOM without a server.

The shared `nativeMoveDestinationValid` gate also proves adjacent-gap no-ops before
returning `stayed`; metadata and opaque selections cannot masquerade as edges.
Choices can be derived lazily when a menu opens, then freshly revalidated on use.

The bounded source guard refuses known browser repair classes: nested document
wrappers, misplaced table parts, non-space colgroup character tokens (after entity
decoding), nested ruby annotations in the same ruby scope, definition-item
closure, and invalid form/interactive nesting. Explicit table parents, whitespace
and comments in colgroup, ordinary sibling ruby annotations and a nested ruby's
separate scope remain supported. This is a conservative balanced-source guard,
not a complete HTML parser; unsupported or repaired sources are refused rather
than assigned potentially different browser element paths.
