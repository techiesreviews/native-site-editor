# Optional slots in the native preview

`createNativePreview` mounts the editor-only `mountSlotGhosts(pane, frame, options)` overlay. `NativePreviewHandlers.onSlotGhostFill?: (target: SlotGhostFillTarget) => void` is an optional leaf callback. Main does not yet connect this callback to source editing or Undo.

The exported target has `context`, `pagePath`, `tag`, `templatePath`, `hostNode: number[]`, and `name`. It identifies a page-authored custom-element instance and a slot name, never an individual outlet. The root adapter must capture and recheck the source text/revision, current preview context, mapped page/component, and exact instance before calling the separately owned guarded `fillInstanceSlot` seam. Do not use `occurrence` to create independent same-name assignments.

Runtime `slot-ghosts` messages contain `report: SlotGhostReport | null`. Reports contain the target fields (except `name`), a real `hostRect`, and `entries: { name, occurrence, slotNode, assigned, hidden, rect? }[]`. Occurrences are zero-based within each name. Node arrays use source element-child indexes excluding legacy injected styles. Rectangles are iframe viewport CSS pixels. The host validates bounded paths, strings, counts, finite consistent rectangles, context, active page, and tag-to-template mapping before showing controls; every click rechecks current state. Hidden and zero-sized empty outlets remain available in the compact Empty slots rail on the visible host's lower edge. Same-name outlets share one button with an outlet count. Fallback content does not count as assignment.

Only real slots in the selected component's shadow root are reported. Selection within a page-authored component resolves that component instance. A component authored inside another template has no exact page-source instance and produces no report. Invisible, zero-sized, offscreen, disconnected, or standalone-template hosts produce no controls. Reports update on selection, rendering, slot changes, scrolling, resizing, and page DOM changes. The overlay clears on context changes, selection clearing, invalid reports, history viewing, deactivation, and disposal. Escape dismisses the rail and returns focus to the preview.

The overlay lives outside the iframe, clips to frame/pane viewport bounds, scales frame CSS pixels to editor pixels, and accepts pointer events only on actual buttons. It neither inserts DOM into the page nor changes light DOM/source indexes. Runtime reporting stays in the editor preview runtime; exports need no ghost HTML, CSS, or editor runtime.

Validation:

- `npm run check`
- `npx tsx --test tests/slot-ghosts/validation.test.ts`
- Start Vite on `127.0.0.1:5446`, then `npx playwright test -c tests/slot-ghosts/playwright.config.ts`; stop that server afterward.

The browser fixture uses the actual `createNativePreview` and sandboxed native runtime. It checks assignment/fallback, hidden and zero outlets, name deduplication, instance callback, light DOM preservation, frame scaling/clipping/hit testing, invalid reports, selection changes, Escape, refresh, disconnection, and disposal. Root source mutation and Undo require later integration tests.
