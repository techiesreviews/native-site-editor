---
title: Vendor the new starter for the preview editor
type: task (AFK)
status: closed
assignee:
blocked_by: [05-starter-skip-link, 06-starter-btn-class, 15-starter-variant-examples, 17-starter-agents-components-chapter, 58-starter-card-looks, 60-starter-tone-rules, 65-starter-card-link-rule]
builder: sol
phase: 7
---

## What

The preview editor's Start your site reads a vendored starter (`STARTER_SOURCE: native-static`, `wrangler.preview.jsonc`), still `v6a9ca44`, from before the starter had components.

- Add `public/native-static-starter/v<sha>/` from the head of the starter's `dev` branch, which holds every starter slice (decided at handoff, 1), following `docs/native-starter-source.md` (files as `.asset`, `manifest.json`), with `components/` and `AGENTS.md`; update `NATIVE_STARTER_VERSION` (`worker/starter.ts:132`) and the doc; remove the old folder.
- New sites now ship `AGENTS.md` ([05](../../tickets/05-what-agents-are-told.md) §2): drop its exclusion in `tests/native-starter.test.ts:63`. Check the file-count and size limits in `worker/starter.ts`.
- The template's `main` (production) is not touched: it takes the starter's `dev` only when Lex says ship, together with the editor.

## Done when

- `tests/native-starter.test.ts` and `native-static-starter-create.spec.ts` (`@native-static` group) pass on the new version.
- On preview, Start your site → Starter site gives the components, tones and `AGENTS.md`; screenshots.

## Done (2026-10-09)

- `public/native-static-starter/v6a20035/` vendors the starter's `dev` head `6a20035` (39 files byte for byte: routes, `components/`, `styles/` incl. `tones.css`, `images/`, `robots.txt`, `AGENTS.md`; settings inline); `v6a9ca44` removed; `NATIVE_STARTER_VERSION` and `docs/native-starter-source.md` updated. Limits unchanged (40 of 100 files, 156 KB).
- `tests/native-starter.test.ts` now expects `AGENTS.md`, every route's component files and the one module loader script; `native-static-starter-create.spec.ts` checks routes only (component templates are not pages), allows the loader without JS, and renders the components with JS on the plain byte server.
