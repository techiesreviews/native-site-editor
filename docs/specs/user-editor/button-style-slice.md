# Button Style Slice

Supersedes the earlier BUTTON-01 variant names. Prepared buttons expose four style values: Primary, Secondary, Outline and Link.

Only explicit project-owned button metadata enables the control. The fixture metadata maps a prepared button base class to site-owned CSS classes: Primary is the base style, Secondary adds `secondary`, Outline adds `ghost`, and Link adds `no-bg`. The editor edits only the selected button's literal `class` value, preserving unrelated classes, attributes, hrefs and rich label markup.

Dynamic classes, spreads, ambiguous variant tokens, repeated source mappings, and missing base CSS hide the control. Missing variant CSS disables that option. Styling remains ordinary project CSS after the editor is removed.

The project-owned `.astro-editor/button-styles.json` is optional and is not a server-managed integration file. The starter uses nested `.btn, .button` CSS, retaining `.button` as a compatibility alias. Hover, focus, small and large rules remain nested; editor font-size changes preserve those children.

Draft recovery restores verified class, label, href and closing-tag ranges before subsequent visual edits. Style edits are one Undo step; choosing the current style creates no history entry.

## Validation — 23 September 2026

- 127 unit tests pass, including class-token preservation and nested CSS declaration edits.
- 16 browser checks pass across button styles, links, typography and heading recovery (15 together, plus the authored Secondary → Primary recovery case). They cover native buttons, legacy `.button` and `.btn`, missing metadata/CSS, dynamic classes, narrow toolbar geometry, source output, Undo/Redo, no-op history and reload followed by further edits.
- TypeScript checks, UI production build, Worker deployment dry-run and plain Astro build pass. Generated integration sources match the fixture and retain historical official hashes; project-owned button metadata remains outside the managed file list.
- Screenshots and source evidence: `.scratch/heading-bar/button-style-*.png` and `.scratch/heading-bar/button-style-source.txt`.

Saved-draft mounting now replays from the original preview rather than treating all restored changes as a single code edit. This avoids shifting later headings twice. Browser text-selection assertions use DOM Range text because flex layout inserts visual line breaks in Selection text.

Deployed on 23 September 2026 after Lex’s explicit deployment request. Editor source `e8cd898` is deployed as Cloudflare version `b96a1cc0-4938-41c3-88a5-50a4e99dfda0`, with the existing browser structural preview flag preserved. The served `/assets/index-DEFOZfO7.js` matches the local release (SHA-256 `b27d2f5ade1b6d065d778e1e164b2b128c2e538c2889d4e824831b62a949c0ea`).

Starter main commit `9a0f36e1b2d9abcf2180fb46a0a19c0965d1e305` changes only annotation integration, button metadata and site CSS; page content is preserved. [Deployment run 35833908228](https://github.com/techiesreviews/astro-editor-starter/actions/runs/35833908228) succeeded, and the main preview revision endpoint matches the commit. Live browser checks verified the prepared metadata and computed styles of all four variants. Evidence: `.scratch/button-style-release/live-starter.png`.

The existing shared-browser draft was left untouched. Refresh loads the new editor; an older draft preview may need rebuilding before it contains the new starter integration. The developer-facing button-duplication freeze remains parked.
