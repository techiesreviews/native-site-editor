---
title: 11 failing tests in the actual-starter group
status: ready-for-agent
assignee:
blocked_by: []
---

# 11 failing tests in the actual-starter group

## What

`npm run test:browser:actual` fails 11 tests on dev `30a51e0` and later,
independent of the Phase 5 slices (measured on a clean dev checkout during
slice 12b; dev also failed `native-static-sections-host.spec.ts:29` desktop
once):

- `native-card-paths-starter.spec.ts:126` "starter panels' text fields read inline" (light, light-narrow, dark, dark-narrow)
- `native-slot-published-actual.spec.ts:107`
- `native-static-section-save-host.spec.ts:204`, `:276`, `:298`, `:318` (Undo/Redo after the stylesheet pane or Add)
- `native-structure-readiness.spec.ts:37` (default and "code pane hidden")

Sol saw 4 of them on `a47abed`, so some predate today.

## Done when

Each failure is either fixed in the product, or the spec is updated because
the actual starter (`~/Projects/native-site-editor-starter`) changed, with the
reason recorded; the actual group passes on dev.
