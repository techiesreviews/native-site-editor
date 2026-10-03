# Native style widgets

These editor-only leaf controls use native DOM, TypeScript, and existing editor CSS tokens. They do not inject editor scripts, dependencies, or UI into the user's site. Host wiring is not implemented in this slice.

## Grid editor

Import `mountGridEditor` from `src/components/grid-editor.ts` and load `grid-editor.css` in the editor bundle. Call `mountGridEditor(container, options)` with `authored` and optional `computed` property maps, an opaque `expected` snapshot, `isCurrent(expected)`, and `onChange(properties, expected)`. The property map matches the Style panel's `Record<string, string | null>` write contract; null removes an authored declaration. The host supplies breakpoint/state and validates source/context before writing.

The host shows this control for authored or computed `display: grid` / `inline-grid`. A `Make grid` button exists only when the host supplies `makeGrid`; that callback must perform its own explicit display write with captured context. Mounting never writes.

Only `1fr` lists and integer `repeat(n, 1fr)` / `repeat(n, minmax(0, 1fr))` templates, with 1–24 tracks, become editable counts. Named lines, pixel tracks, auto-fit, subgrid, other minmax forms and implicit tracks retain their raw custom status. A custom preview is explicitly schematic. Typing a count does not write: **Set equal columns/rows** explicitly replaces that one property. Gap, column gap, and row gap each commit only their own property on change or Enter; Enter followed by change does not duplicate the same value. Invalid gaps and out-of-range counts do not write.

Both widgets return `{ element, refresh, dispose }`. `readOnly` may be a boolean or a getter. Call `refresh()` after changing a getter's state or current-context status to disable controls immediately; every action also checks both conditions. `dispose()` removes nodes and listeners. `onError` receives synchronous callback failures and rejected write promises. The controls show local edits optimistically; the host should remount with accepted authored/computed values after a write or error. Captured expected snapshots never advance internally: remount after source edits when `isCurrent` requires a new snapshot.
