---
title: Win back boot budget headroom
type: task (AFK)
status: closed
assignee: claude (mm-84 runner)
blocked_by: [49-media-tab-badge]
builder: sol
phase: 1
---

## What

After media phases 0 and 1 the editor's boot bundle measures about 349 KB gzip of the 355 KB budget (`npm run test:budget`, enforced in CI), while stage 2 (adding and preparation) and later stages still need small boot hooks.

Win back headroom with **no behaviour change**: move code that first paint does not need out of the boot bundle into lazily loaded chunks (dynamic `import()`). Candidates: media, agent, collections and usage helpers that slipped into boot; rarely used dialogs; settings panes. Find the biggest boot contributors from the build output (chunk contents, source maps); add no dependencies.

Parallel slices 14 (file details), 17 (drop to add) and 52 (rename engine) touch the media chunk: keep churn in their files to the minimum the move needs.

## Done when

- `npm run test:budget` measures boot at **343 KB or less** (before and after reported precisely, in bytes).
- Nothing the user sees or does changes: `npm run check`, unit tests, `npm run lint` and the full native-save suite (`scripts/agents/full-suite.sh 3`) pass, failures matched against `tests/known-failures.json`.
- No new dependencies; every moved module loads on the action that needs it, and what first paint still needs stays in boot.

## Done (2026-10-14)

- **Behaviour.** None changed; code first paint does not need now loads with the action that needs it. `src/native-settings.ts` (new): the Site, Page and Navigation settings actions (`nativeSettingsController`, `applyNativeSiteSettings`, page choices, the 404 page) load with the settings dialog. `src/setup-actions.ts` (new): create site, the wizard's create, find and preview, and writing a starting point or the site's name or address load with Get started, the wizard, Start your site and the setup checklist; thin wrappers in `main.ts` await it and refuse when the repository changed meanwhile. The Pages tree (inside the Pages dropdown, closed at boot) is created when the dropdown first opens or New page runs; `pages-tree.css` stays in boot so nothing shows unstyled. `src/page-builder/palette-catalog.ts` (new): the palette's action, site and native-element commands and the shortcut list register when the palette or shortcut sheet first loads (only those two read the registry; registration order unchanged). Bodies moved as they were, with `ports.` prefixes.
- **Commits.** e04e685a claim; ae7b22e1 the moves (built by Sol); f1f54139 review follow-up test; close.
- **Tests.** `npm run check`, `npm run lint`, unit 2481/2481. `tests/guarded-edit-reads.test.ts`: the scanner's one real `waits` entry (main.ts `ensureNativeTextIndex`, called by open404) went away because open404 now reaches it through a port; the test lists a test-only wait so the exemption stays covered. Palette specs import `nativePaletteCommands` from `palette-catalog.ts`. New browser case in `native-palette.spec.ts`: New page from the palette while the Pages tree chunk is held, then the title field is focused and takes typing. Palette specs 21/21. Full suite (3 shards): 924 passed, 1 failed (`native-manager-action-fades:197` hidden Restore, the Files tab flake slices 09 and 49 recorded; 12/12 on rerun), 60 skipped.
- **Review (GPT-6.1 Sol).** No defects. Gaps: a held Pages chunk with New page (added); the same with a repository switch before release (not added: the `startNewPage` stamp and the mount's host check refuse it, as every lazy host does); a failed Pages chunk load (not added: it goes through the shared `lazyModule` and chunk-recovery path every lazy module uses, covered by `tests/chunk-recovery.test.ts`). Known and accepted: a `showRow` focus arriving while the Pages tree first loads renders the tree without that focus.
- **Bytes.** Cold bytes before the first preview paint (median of 3, `100/20`): **357,050 → 348,950 (−8,100 B)**, i.e. 348.7 KB → 340.8 KB of the 355 KB budget (14.2 KB headroom). Boot `index` JS 241 KB → 231 KB on the wire; `index.css` unchanged.
- **Follow-ups.** Slice 14 also edits `src/main.ts`; this slice's hunks there are the moved settings, setup and Pages tree code. Next candidates if more room is needed: the `html-entities` table (13 KB gzip, static from boot), `refusal-note.ts`, `publish-menu.ts`/`repository-menu.ts` bodies.
