# Button Insertion Slice

## Removed by request — 23 September 2026

Editor commit `5b0c2ca` removed the `Add another button` toolbar control and its source-writing quick-add behavior by user request. It was deployed with `VITE_BROWSER_STRUCTURAL_PREVIEW=1`. Cloudflare Version ID: `a868d64b-f520-4ab5-8775-b3e37e4317e4`; rollback target: `8a19134f-8709-459c-b474-0ced5a4be5d4`. Prepared button metadata can remain in connected projects for annotation or future consumers, but the editor no longer exposes a quick-add entry point and no longer writes a new prepared button from the preview toolbar.

Existing prepared buttons remain editable as ordinary mapped buttons. Users can still edit a selected button's label, link, and supported style variant. Source-panel structural preview remains available for code edits, and the preview status and class font-size live-patch fixes remain unchanged.

## Validation — 23 September 2026

- `npm run check` passed.
- `VITE_BROWSER_STRUCTURAL_PREVIEW=1 npx playwright test -c playwright.browser-structural-preview.config.ts --workers=1` passed: 8 tests.
- `VITE_BROWSER_STRUCTURAL_PREVIEW=1 npx playwright test -c playwright.button-insertion-recovery.config.ts --workers=1` passed: 3 tests.
- `VITE_BROWSER_STRUCTURAL_PREVIEW=1 npm run build` passed before release review.
- `VITE_BROWSER_STRUCTURAL_PREVIEW=1 npm run deploy` succeeded for Version ID `a868d64b-f520-4ab5-8775-b3e37e4317e4`.
- Live `https://astro.techies.tools/` served byte-for-byte matching `dist/index.html` and `dist/assets/index-DFfWld7W.js`. Bundle SHA-256: `e12e70e630c3ea0e21ba98fa07a63ab68a3db7867739eb151375866cfb7792f3`; index SHA-256: `9826acd94c41e7185aa6b8f58b5a4547e04ad1842cbbb6e33348cb3e10b3dd93`.
- The live bundle contains none of `Add another button`, `Add button`, `applyPreviewAddButton`, `findPreparedButtonSlot`, `onAddButton`, `preview-edit-bar__add-button`, `This slot cannot add a button safely.`, or `The button slot changed. Select the button again.`

These 11 focused browser checks confirm that the edit bar has no `Add another button` control even with valid `.astro-editor/button-slots.json` metadata, existing mapped buttons still expose Link and Button style controls, existing mapped button label/href/class style edits still update the source and live preview, and the 390px edit bar remains within the preview pane without the quick-add control.

## Historical release — 23 September 2026

Editor commit `fded1e5` restored the `Add another button` quick-add control behind explicit slot metadata and deployed it with `VITE_BROWSER_STRUCTURAL_PREVIEW=1`. Cloudflare Version ID: `8a19134f-8709-459c-b474-0ced5a4be5d4`; rollback target: `e7906d1e-06d4-4a9d-83ca-720a10ba5ba4`.

That historical implementation enabled the control only through explicit project-owned metadata in `.astro-editor/button-slots.json`. Version 1 metadata named one source path, a literal parent element, allowed children, and the prepared button base class. The starter fixture declared a single `div.button-wrapper` slot in `src/pages/index.astro` and allowed only `button` additions.

Insertion added a fixed Primary prepared button immediately after the selected button:

```astro
<a class="btn" href="/">Learn more</a>
```

The inserted button did not copy the selected button's label, link, or style. After the structural preview acknowledgement, the preview focused the new button and selected the full `Learn more` placeholder. The operation was one Monaco history step and worked without a draft build.

Historical validation for `fded1e5`:

- `npm test` passed: 142 tests.
- `npm run check` passed.
- `VITE_BROWSER_STRUCTURAL_PREVIEW=1 npx playwright test -c playwright.browser-structural-preview.config.ts` passed: 8 tests.
- `VITE_BROWSER_STRUCTURAL_PREVIEW=1 npx playwright test -c playwright.button-insertion-recovery.config.ts` passed: 4 tests.
- `VITE_BROWSER_STRUCTURAL_PREVIEW=1 npx playwright test -c playwright.heading-bar.config.ts preview-status` passed: 4 tests.
- `VITE_BROWSER_STRUCTURAL_PREVIEW=1 npx playwright test -c playwright.heading-bar.config.ts no-bg-freeze` passed: 2 tests.
- `VITE_BROWSER_STRUCTURAL_PREVIEW=1 npx playwright test -c playwright.heading-bar.config.ts button-style-draft button-size-draft` passed: 4 tests.
- `npm run test:browser-structural-types` passed.
- `npm run test:browser-structural-overlay` passed.
- `VITE_BROWSER_STRUCTURAL_PREVIEW=1 npm run build` passed through the Wrangler dry-run before deploy, and `VITE_BROWSER_STRUCTURAL_PREVIEW=1 npm run deploy` deployed the same build.
- Live `https://astro.techies.tools/` served byte-for-byte matching `dist/index.html` and `dist/assets/index-BM7dCu-P.js`. Bundle SHA-256: `eb3f4daa11e078fc358bf3303fe4cef3e3fad1c443c18f3c5fe7b566fbef5886`; index SHA-256: `19780e6c660d143d1f04b6c20190698379e57cde61549ffd50dc5a3fcd5110c0`.

## Previous starter metadata release — 23 September 2026

- Editor source commit `700dad677bc6` deployed with `VITE_BROWSER_STRUCTURAL_PREVIEW=1`; Cloudflare Version ID `1b0ec890-e6a0-4d86-a7ab-39b48f57156a`. Previous rollback Version ID remains `9c731c89-535c-47cb-83b7-55cfa8bd2ac1`.
- Live editor `https://astro.techies.tools/` served the same `index.html` as local `dist/index.html`, and live `/assets/index-HU1Hy7is.js` matched local `dist/assets/index-HU1Hy7is.js` byte-for-byte. Bundle SHA-256: `d3ed0d6d84e98c57ff287e21753cccb625f98a496d132f9b82ae175aad171507`.
- Starter `techiesreviews/astro-editor-starter` main moved from `e0ed4e108e2d` to `a96d06124db7dbb8045bd7d2e19fbb7d795920bd` with only `.astro-editor/annotate.mjs` and `.astro-editor/button-slots.json` changed. GitHub Actions run `35852183646` completed successfully, and `https://main-astro-editor-starter.lexvd.workers.dev/.astro-editor/revision.json` reported commit `a96d06124db7dbb8045bd7d2e19fbb7d795920bd`.
- Starter source preservation: `src/pages/index.astro` SHA-256 stayed `e05692a33b47cf7cc3a8f75e1ce2ae703ede0635a39556f35d0b47fe4271c1f6` before and after the starter metadata update, with one `div class="button-wrapper"`.
- Starter live preview HTML contains `data-ase-button-slot-parent="src/pages/index.astro:418:587"`, `data-ase-button-slot-parent-class="button-wrapper"`, `data-ase-button-slot-allowed="button"`, and `data-ase-button-slot-base="btn"` on the starter buttons.
