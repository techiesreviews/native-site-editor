---
title: Vendor the new starter for the preview editor
type: task (AFK)
status: open
assignee:
blocked_by: [05-starter-skip-link, 06-starter-btn-class, 15-starter-variant-examples, 17-starter-agents-components-chapter, 58-starter-card-looks, 60-starter-tone-rules]
builder: sol
phase: 7
---

## What

The preview editor's Start your site reads a vendored starter (`STARTER_SOURCE: native-static`, `wrangler.preview.jsonc`), still `v6a9ca44`, from before the starter had components.

- Add `public/native-static-starter/v<sha>/` from the starter commit that holds every starter slice, following `docs/native-starter-source.md` (files as `.asset`, `manifest.json`), with `components/` and `AGENTS.md`; update `NATIVE_STARTER_VERSION` (`worker/starter.ts:132`) and the doc; remove the old folder.
- New sites now ship `AGENTS.md` ([05](../../tickets/05-what-agents-are-told.md) §2): drop its exclusion in `tests/native-starter.test.ts:63`. Check the file-count and size limits in `worker/starter.ts`.
- Open point 1 in the [spec](../spec.md) decides when the template's `main` (production) follows.

## Done when

- `tests/native-starter.test.ts` and `native-static-starter-create.spec.ts` (`@native-static` group) pass on the new version.
- On preview, Start your site → Starter site gives the components, tones and `AGENTS.md`; screenshots.
