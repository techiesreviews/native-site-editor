# P1.6: remove explicit visibility conditions

Explicit `data-if` handling is removed. Automatic empty-slot and wrapper rules
stay unchanged. Changes remain uncommitted on `build/p1-6-data-if`.

## Changes

- `public/native-preview-runtime.js`: removed explicit slot and element conditions.
- `src/page-builder/component-model.ts`: removed explicit conditions from slot
  state, pruning and detach, including special attribute stripping.
- `src/page-builder/card-grid.ts` and `cards.ts`: removed condition-derived
  optional slots and their omission from Add card copies. Placeholder text,
  fallback text, link rewriting, page creation and undo behavior remain.
- `worker/site-conventions.ts` and `fixtures/actual-starter/AGENTS.md`: removed
  the explicit-condition instruction. The actual starter loader uses the same
  automatic rules as the editing preview.
- Adapted mixed unit, native-save and slot-ghost browser coverage. Structure
  harnesses use empty slots where visibility is optional; focused section
  harnesses retain fallback restoration coverage.
- Updated current feature documents and the phase handoff. Historical delivery
  records retain their historical references.

The removed attribute previously hid a template part unless every named slot
was assigned; on a slot, a bare attribute named that slot. Add card also omitted
text leaves in those optional slots. No other source defines an
`only-when-filled` concept.

## Changed files

- `docs/NATIVE-PROJECT.md`
- `docs/adr/0001-the-repository-is-the-site.md`
- `docs/page-builder/README.md`
- `docs/page-builder/add-panel.md`
- `docs/page-builder/cards.md`
- `docs/page-builder/completion-checklist.md`
- `docs/page-builder/components.md`
- `docs/page-builder/slot-ghosts.md`
- `docs/page-builder/ux-research.md`
- `docs/wayfinder/lean-fast-editor/build/p1-5-collections.md`
- `docs/wayfinder/lean-fast-editor/build/p1-6-data-if.md`
- `docs/wayfinder/lean-fast-editor/tickets/15-handoff-plan.md`
- `fixtures/actual-starter/AGENTS.md`
- `fixtures/actual-starter/components/components.js`
- `public/native-preview-runtime.js`
- `src/page-builder/card-grid.ts`
- `src/page-builder/cards.ts`
- `src/page-builder/component-model.ts`
- `tests/card-grid.test.ts`
- `tests/component-model.test.ts`
- `tests/native-save/component-slot-seam.spec.ts`
- `tests/native-save/native-components.spec.ts`
- `tests/native-save/native-conditional.spec.ts`
- `tests/native-save/native-mcp.spec.ts`
- `tests/native-save/native-slot-published-actual.spec.ts`
- `tests/native-save/native-structure-compact.spec.ts`
- `tests/native-save/native-structure-rich-slots.spec.ts`
- `tests/native-save/native-structure-slot-actions.spec.ts`
- `tests/native-save/native-structure-slots.spec.ts`
- `tests/slot-ghosts/browser.spec.ts`
- `worker/site-conventions.ts`

## Preserved rules

A section component whose instance holds authored content hides unfilled slots
with their fallbacks. A bare section instance shows its fallbacks. Other
components retain default fallbacks. A wrapper holding slots, with no text of
its own and no slot output, hides too. The existing host-content gate, slot-name
lookup and duplicate outlet behavior are preserved.

`fixtures/native-starter` contains no explicit-condition references and is
untouched. No commit, push, external write or deployment was performed.

## Validation

- `npm run check`: pass.
- `npm test`: 884 passed, 0 failed.
- `node --check public/native-preview-runtime.js` and
  `node --check fixtures/actual-starter/components/components.js`: pass.
- `git diff --check`: pass.
- `ASE_TEST_PORT=5381 npx playwright test -c playwright.native-save.config.ts
  tests/native-save/native-conditional.spec.ts tests/native-save/component-slot-seam.spec.ts
  tests/native-save/native-structure-compact.spec.ts tests/native-save/native-structure-rich-slots.spec.ts
  tests/native-save/native-structure-slot-actions.spec.ts tests/native-save/native-structure-slots.spec.ts
  tests/native-save/native-mcp.spec.ts tests/native-save/native-components*.spec.ts
  tests/native-save/native-cards*.spec.ts tests/native-save/native-card*.spec.ts`:
  126 passed, 9 actual-fixture skips, 0 failed.
- `ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter ASE_TEST_PORT=5381 npx playwright test
  -c playwright.native-save.config.ts tests/native-save/native-slot-published-actual.spec.ts
  tests/native-save/native-card-paths-starter.spec.ts`: 8 passed, 2 failures. The
  publishing, authored-byte, undo and live-loader checks pass.
- Both actual failures are the light/dark “starter panels' text fields read
  inline” cases at `native-card-paths-starter.spec.ts:126`, expecting a clear
  Title field background while the existing hover rule applies a 0.09-alpha
  background. An isolated unchanged HEAD `b25b7a9` archive reproduces both exact
  failures with `ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter ASE_TEST_PORT=5381
  npx playwright test -c playwright.native-save.config.ts
  tests/native-save/native-card-paths-starter.spec.ts -g 'starter panels'`:
  2 passed, 2 failed. No CSS or that spec was changed.
- `ASE_TEST_PORT=5381 npx playwright test -c playwright.native-preview.config.ts`:
  15 passed, 0 failed.
- `ASE_TEST_PORT=5381 npx playwright test -c tests/slot-ghosts/playwright.config.ts`:
  1 passed, 0 failed.

An initial run was interrupted through its shell; its Playwright child continued.
A reuse attempt overlapped that child and produced state/artifact interference,
then connection refusals after the first server closed. Those runs are not final
validation evidence. Both completed naturally; subsequent runs were sequential
with the original configs. Port 5381 is closed. The temporary reuse config and
isolated baseline archive were removed.

Final logs: `/tmp/p1-6-check.log`, `/tmp/p1-6-unit.log`,
`/tmp/p1-6-browser-clean.log`, `/tmp/p1-6-actual.log`,
`/tmp/p1-6-actual-baseline.log`, `/tmp/p1-6-preview.log`, and
`/tmp/p1-6-slot-ghosts.log`. Earlier scheduling evidence remains in
`/tmp/p1-6-browser.log` and `/tmp/p1-6-browser-final.log`.

Searches find no `data-if` or `only-when-filled` references in `src`, `shared`,
`worker`, `public`, `tests` or `fixtures`. Remaining documentation references are
historical records in the completion checklist, P1.5 build note and phase handoff,
plus this removal record.

## Proposed commit

```text
refactor(editor): remove explicit component visibility conditions

Co-Authored-By: Sol (gpt-6.1-sol) <noreply@openai.com>
```
