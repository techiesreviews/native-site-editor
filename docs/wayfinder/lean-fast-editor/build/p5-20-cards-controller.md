# Phase 5.20: Cards controller

Base: `a5fd891` (slice 12a, page structure controller), rebased from `311168a`. Slice 13 of `p5-controller-plan.md`.

`src/controllers/cards-controller.ts` adds `createCardsController(ports)`. Its port type is `CardsControllerPorts = CardsDeps`, from `src/page-builder/cards.ts`, so there is no second port definition. The controller owns the `cards` instance (`mount()`, `mounted()`), which was main's `let cards` and `mountCards()`. It also provides the preview's `CardGridHandlers` (`preview`), which refuse with "Open a native site first." before mounting as before. `controls(selection, source)` returns the edit bar's card controls; card move arrows are filtered out by the pure `withoutCardMoves`. The controller also supplies the Pages adapters `cardOffer`, `cardsLinkingTo` and `createWithCard`. Card operations are unchanged in `createCards`.

The controller is created once at module level with the same live ports `mountCards()` passed (getters for site, source, editor and preview; `ensureOpen` with its generation, open-file and mount re-check; `saveNewDraft`/`dropNewDraft`; `applyNativeChange`; `applyNativeOperation`). `mount()` runs where `mountCards()` ran, so each workspace mount still gets fresh card operations.

Main keeps the port bodies, which are draft store, restore and transaction code. Edit bar assembly moved to the page structure controller in 12a. Its port is now `cardControls(selection, source)`, which replaced `get cards()`. Main wires it to `cardsController.controls` through an arrow, because `cardsController` is declared later in the module. The section/master gate stays in the page structure controller, and the move-arrow filter exists only in `withoutCardMoves`. Preview creation passes `cardsController.preview`. Pages' `createWithCard` and `cardsLinkingTo` ports and the Pages tree `cardOffer` now point at the controller. Main loses 8 lines (7,365 to 7,357 on the 12a base).

Net gain is small. Most of the old `mountCards()` was the port object, and those ports are host state and transactions, so they stay in main. What moved is the lifecycle, the pre-mount refusals and the move-arrow filter, all now unit tested. No new runtime import reaches the initial chunk: `createCards` was already static in main, and the controller's other imports are type-only.

## Verification

Node `24.21.0`:

- `npm run check`: passed.
- `npm test`: 1,134 passed (3 new in `tests/cards-controller.test.ts`), zero failures. The new tests cover pre-mount refusals and empty offers, mounting, and the move-arrow filter (button arrows removed, other kinds kept).
- Strict test TypeScript check of `tests/cards-controller.test.ts`: passed.
- `npm run build:ui`: passed. `npm run test:budget -- --no-build`: 348 KB gzip before first preview paint (budget 350 KB), the same as base `a5fd891` measured the same way (348 KB).
- `git diff --check`: passed.

Browser (port 5236, flock, one worker):

- native-cards, native-card-paths, native-card-paths-starter, native-delete-card-race, native-create, native-lazy-panels, native-edit-bar, native-structure: 51 passed, 9 skipped, 0 failed. The specs contain no explicit skips; the cause of the 9 skips was not traced.
- `@smoke`: 32 passed, 0 failed.
