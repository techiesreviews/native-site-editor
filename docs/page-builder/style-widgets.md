# Native style widgets

These editor-only leaf controls use native DOM, TypeScript, and existing editor CSS tokens. They do not inject editor scripts, dependencies, or UI into the user's site. Host wiring is not implemented in this slice.

## Grid editor

Import `mountGridEditor` from `src/components/grid-editor.ts` and load `grid-editor.css` in the editor bundle. Call `mountGridEditor(container, options)` with `authored` and optional `computed` property maps, an opaque `expected` snapshot, `isCurrent(expected)`, and `onChange(properties, expected)`. The property map matches the Style panel's `Record<string, string | null>` write contract; null removes an authored declaration. The host supplies breakpoint/state and validates source/context before writing.

The host shows this control for authored or computed `display: grid` / `inline-grid`. A `Make grid` button exists only when the host supplies `makeGrid`; that callback must perform its own explicit display write with captured context. Mounting never writes.

Only `1fr` lists and integer `repeat(n, 1fr)` / `repeat(n, minmax(0, 1fr))` templates, with 1–24 tracks, become editable counts. Named lines, pixel tracks, auto-fit, subgrid, other minmax forms and implicit tracks retain their raw custom status. A custom preview is explicitly schematic. Typing a count does not write: **Replace with N equal columns/rows** explicitly replaces that one property. Gap, column gap, and row gap each commit only their own property on change or Enter; Enter followed by change does not duplicate the same value. Custom counts start blank, so replacement requires entering a count. Computed tracks are labeled computed. Invalid gaps and counts show accessible inline errors and call `onError` once per invalid value; valid commits clear the error. Out-of-range counts do not write. Grid commits use `aria-busy`, `aria-disabled` and read-only inputs while pending to preserve keyboard focus, advance saved state only after success, and permit retry after failure. Stale or disposed completions do not update saved UI.

Both widgets return `{ element, refresh, dispose }`. `readOnly` may be a boolean or a getter. Call `refresh()` after changing a getter's state or current-context status to disable controls immediately; every action also checks both conditions. `dispose()` removes nodes and listeners. `onError` receives synchronous callback failures and rejected write promises. The focal control shows local edits optimistically, advances committed state only on accepted writes, and permits retry after rejection; the host should remount with accepted authored/computed values after a write or error. Captured expected snapshots never advance internally: remount after source edits when `isCurrent` requires a new snapshot.

## Image focal point

Import `mountImageFocalPoint` from `src/components/image-focal-point.ts` and load `image-focal-point.css` in the editor bundle. `mountImageFocalPoint(container, options)` accepts `mode: 'object-position' | 'background-position'`, raw `authored` / `computed` positions, optional `fit` / `size` for explanatory crop context, and the same snapshot/write/readOnly/error contract as the grid leaf. Fit and size never enter the position write map.

`previewAsset` must be `{ dataURL }` containing base64 PNG, JPEG, GIF, WebP, or AVIF bytes resolved by the host. Alternatively, `{ blobURL, hostTrusted: true }` explicitly asserts that the host owns/trusts an HTTP(S)-origin blob URL. SVG data URLs additionally require `{ dataURL, hostTrusted: true }`, asserting host-resolved repository bytes. SVG stays in image mode through `img.src`; no inline SVG DOM is inserted. SVG image mode disables scripts and external resource loading. External URLs, untrusted SVG and other data types are rejected before mounting or setting image src. The host owns blob lifetime; the leaf never revokes host URLs, alters bytes, resolves assets, or fetches remote previews.

The preview always displays the full image using contain, regardless of the site's fit/size. Coordinates map to the contained image's actual rectangle, excluding letterboxes, and clamp to 0–100. A marker shows recognized percentage/keyword positions. Pixel, calc, edge-offset, multi-layer and unparsed values show **Custom position** with blank numeric inputs and no invented center marker. Setting one percentage explicitly replaces the position; an unknown other axis starts at 50%. Out-of-range recognized percentages are clamped for the bounded preview; the status retains the raw value and explains the clamped editing marker. Their source is untouched until an action.

Pointer capture provides local drag feedback. Pointerup submits one final position map when changed. Escape, pointercancel, lost capture, stale/readOnly state, and disposal cancel without committing and restore prior coordinates. Native X/Y inputs commit on change or Enter without duplicate writes; arrows move 1%, Shift+arrows 10%, with clamping. The focused preview supports all four arrows. Disposal releases capture, aborts listeners, disconnects ResizeObserver and removes preview src and nodes.

## Validation and integration limits

Unit tests: `npx tsx --test tests/grid-editor.test.ts tests/image-focal-point.test.ts`.

The isolated browser harness is `tests/style-widgets/fixture.html`; it mounts the actual leaves with an in-memory snapshot/write recorder and generated raster bytes and the actual native starter SVG. It exercises native controls, custom preservation, explicit conversion, gap isolation, single-map pointer commits, contain coordinates, cancellation, keyboard clamping, stale/readOnly guards, disposal and external URL rejection. It does not claim app-host integration.

Run Vite on the reserved free port: `npx vite --host 127.0.0.1 --port 5386 --strictPort`, then `npx playwright test -c tests/style-widgets/playwright.config.ts`. Stop that server after validation. Port 5387 remains available for a separate harness. Durable check/unit/browser logs are saved under `.scratch/t3-continuation/style-widgets-focus-fix-{check,unit,browser}.log`.

The existing workflow worker still owns Style panel visibility, authored-value extraction, snapshot creation/refresh, preview-byte resolution, breakpoint/state routing, source validation, errors and remounting after writes. No app-host files changed. Track drag resizing, image transformations, lightbox and filters are outside this slice.
