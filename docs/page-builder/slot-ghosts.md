# Native slot reports

The Empty slots canvas rail has been removed. `mountSlotGhosts` remains a compatibility no-op: it creates no layer, listeners, geometry observers or actions. Authored slots, their assignments, fallback content and `data-if` conditions remain native source. Instance fields are moving to Structure; host integration remains pending.

Runtime `slot-ghosts` messages still carry `SlotGhostReport | null`. Their host and entry rectangles are iframe viewport CSS pixels, measured from real elements. Hidden outlets differ from visible zero-sized outlets. Repeated names keep zero-based occurrence numbers; browser assignment goes to the first outlet of each name. Reports carry the exact page instance path/node and tag-to-template mapping. The schema validator still rejects wrong context/page/template mappings, invalid indexes, counts and rectangles. Structure reads source and does not depend on these geometry reports.

Runtime reads remain coalesced per animation frame on scroll and mutation bursts; mouse movement does not rescan slots. Queued reads use the latest selection. The reports-only browser fixture covers these reads, real hidden/zero/measured outlets, authored DOM preservation and absent rails. Validator tests cover stale contexts and wrong mappings. With the rail removed there is no public observable host acceptance state, so these tests do not claim an integration proof of the preview's internal stale-report rejection.

Validation:

- `npm run check`
- `npx tsx --test tests/slot-ghosts/validation.test.ts`
- Start `ASE_NATIVE_SAVE_PORT=5616 npx tsx tests/native-save/server.ts`, then `npx playwright test -c tests/slot-ghosts/playwright.config.ts`. Stop that server afterward. The test loads a bare HTML document and imports the production preview, avoiding interference from app startup.

No root source mutation or Undo is performed by slot reports. Structure mutation and host Undo require separate integration checks.
