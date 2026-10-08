# Phase 5.20: Cards controller

Base: `ea213c7` (slice 11 head). Slice 13 of `p5-controller-plan.md`.

`src/controllers/cards-controller.ts` adds `createCardsController(ports)`. Its port type is `CardsControllerPorts = CardsDeps`, from `src/page-builder/cards.ts`, so there is no second port definition. The controller owns the `cards` instance (`mount()`, `mounted()`), which was main's `let cards` and `mountCards()`. It also provides the preview's `CardGridHandlers` (`preview`), which refuse with "Open a native site first." before mounting as before. `controls(selection, source)` returns the edit bar's card controls; card move arrows are filtered out by the pure `withoutCardMoves`. The controller also supplies the Pages adapters `cardOffer`, `cardsLinkingTo` and `createWithCard`. Card operations are unchanged in `createCards`.

The controller is created once at module level with the same live ports `mountCards()` passed (getters for site, source, editor and preview; `ensureOpen` with its generation, open-file and mount re-check; `saveNewDraft`/`dropNewDraft`; `applyNativeChange`; `applyNativeOperation`). `mount()` runs where `mountCards()` ran, so each workspace mount still gets fresh card operations.

Main keeps the port bodies, which are draft store, restore and transaction code. It also keeps edit bar assembly: the section/master gate stays in main and only the card controls come from the controller. Preview creation passes `cardsController.preview`. Pages' `createWithCard` and `cardsLinkingTo` ports and the Pages tree `cardOffer` now point at the controller. Main loses 12 lines (8,095 to 8,083).

Net gain is small. Most of the old `mountCards()` was the port object, and those ports are host state and transactions, so they stay in main. What moved is the lifecycle, the pre-mount refusals and the move-arrow filter, all now unit tested. No new runtime import reaches the initial chunk: `createCards` was already static in main, and the controller's other imports are type-only.

## Verification

Node `24.21.0`:

- `npm run check`: passed.
- `npm test`: 1,112 passed (1,109 + 3 new in `tests/cards-controller.test.ts`), zero failures. The new tests cover pre-mount refusals and empty offers, mounting, and the move-arrow filter (button arrows removed, other kinds kept).
- Strict test TypeScript check of `tests/cards-controller.test.ts`: passed.
- `npm run build:ui`: passed. `npm run test:budget -- --no-build`: 347 KB gzip before first preview paint (budget 350 KB), unchanged.
- `git diff --check`: passed.

Browser (port 5236, flock, one worker):

- native-cards, native-card-paths, native-card-paths-starter, native-delete-card-race, native-create, native-lazy-panels: 43 passed, 9 skipped, 0 failed. The specs contain no explicit skips; the cause of the 9 skips was not traced.
- `@smoke`: 32 passed, 0 failed.
