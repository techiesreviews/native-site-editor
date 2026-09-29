# Handoff: align the native starter repository with the component CSS convention

Written 2026-09-24 from the click-to-select / component CSS slice.

## Objective

Update the GitHub starter repository `techiesreviews/native-site-editor-starter` (private, id `1384109830`, local clone `.scratch/native-starter-live`, initial commit `14e09f7`) so its files follow what the deployed editor (`https://native-site-editor.pages.dev`, deployment `b1202a01`) now expects:

- Sibling component CSS: `src/components/<name>.html` may have `src/components/<name>.css`. It stays out of `.astro-editor/native.json`. The editor loads it on demand and injects it only into that component's shadow roots, after the shared styles.
- Shared styles remain in `.astro-editor/native.json` `styles`.
- Preview links must be `#/route/` hashes to be navigable (Ctrl/⌘+click or **Follow link**).

Acceptance: starter mirrors `fixtures/native-starter` where sensible (at least `src/components/project-card.css` with the same border-left and letter-spacing rules); `README.md` in the starter explains the sibling CSS convention and click-to-select / Ctrl+click / Follow link; manifest still validates (`parseNativeManifest`); starter commit pushed to `main`; the editor doc `docs/NATIVE-PROJECT.md` "Remote State" notes the new starter commit.

## Decisions and constraints

- Convention is fixed: sibling CSS by basename, no manifest change, version stays 1. Do not add a `componentStyles` manifest field.
- Do not modify any Astro checkout, do not install dependencies through the `node_modules` symlink, preserve all uncommitted work in `/home/ubulex/Projects/native-site-editor` (large dirty tree; nothing there is committed for this slice yet).
- Pushing to the starter repo is a remote write: it was created for editor verification, so pushing there is within scope, but confirm the target branch/remote before pushing and never force-push.
- Do not redeploy the editor unless a fix is needed; the sessions Worker is unchanged.
- Real GitHub sign-in and real save through the editor remain unverified; do not claim the starter is published as a website.

## State

- Editor implementation, tests (16/16 native-save, 4/4 style index), build, and Pages deploy are done. See `docs/NATIVE-PROJECT.md` "Current Slice", "Remote State", "Verification".
- Reference fixture: `fixtures/native-starter/` (manifest, pages, components, `src/styles/site.css`, `src/components/project-card.css`).
- Starter clone status unknown beyond `git log` showing only `14e09f7`; verify `git status` and `git fetch` first.

## Done 2026-09-24

Starter `main` is now `3462b9a` (pushed non-force to `origin main`, previous `14e09f7`): adds `src/components/project-card.css` identical to the fixture and expands `README.md` with the layout, manifest keys, shared styles, sibling component CSS convention, `#/route/` hash links, and click-to-select / Ctrl/⌘+click / **Follow link**. `.astro-editor/native.json` untouched and still byte-identical to `fixtures/native-starter`. Recorded in `docs/NATIVE-PROJECT.md` "Remote State". Steps 1–3 below are complete; only step 4 (live owner-flow sign-in on `pages.dev`) remains open and unverified.

## Follow-up 2026-09-24: one folder per component

Convention changed at Lex's request: every component now lives in `src/components/<name>/`, with the folder, the `<name>.html` template, and the custom-element tag sharing one name, and `<name>.css` beside the template. This required no editor behaviour change — `COMPONENT_PATH` already allowed nested paths and the CSS lookup is a plain `.html`→`.css` swap — only comment and error-message wording in `src/native-manifest.ts` and `src/components/native-preview.ts`.

- `fixtures/native-starter` restructured; stylesheets added for `site-header`, `site-footer`, `card-note`; `src/styles/site.css` untouched.
- Test path literals updated; `tests/native-manifest.test.ts` now asserts both flat and nested component paths validate. `native-selector.spec.ts` scoping assertion strengthened: header shadow root now has its own stylesheet, so it asserts card rules stay out of the header rather than that the header has no styles.
- Verified 2026-09-24: `npm run test` 172/172, `npm run check` clean, `npx playwright test -c playwright.native-save.config.ts` 16 passed. Editor not redeployed; the deployed build predates these fixture changes but its behaviour is unchanged.
- Starter `main` is `6ef0a28`, identical to the fixture file for file.

## Next action

1. In `.scratch/native-starter-live`: `git fetch && git status`; diff its files against `fixtures/native-starter`.
2. Add `src/components/project-card.css` (copy from fixture) and any other divergence worth mirroring; update starter `README.md` with the convention.
3. Commit, push to `origin main`, record the commit SHA in `docs/NATIVE-PROJECT.md` (editor repo) under "Remote State".
4. Optional: sign in on `pages.dev` with the configured GitHub App against the starter to verify component CSS loading live; this is the still-open owner flow.

## Read

- `docs/NATIVE-PROJECT.md` — current slice, limits, remote state.
- `src/main.ts` `loadNativeComponentStyles`, `public/native-preview-runtime.js` `requestComponentStyles` — how the sibling CSS is discovered (basename replace `.html` → `.css`, looked up in the branch tree).
