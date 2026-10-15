---
title: Every root address follows the prefix
type: task (AFK)
status: open
assignee: claude (mm-78 runner)
blocked_by: [77-canvas-sub-folder]
builder: sol
phase: 7
---

## What

Decision 7. Convert every writer of root addresses to slice 76's helper:

- Media: `src/page-builder/media-markup.ts:11`, `media-references.ts:221`, `media-library-view.ts:360` (or its successor), `src/main.ts:683,1924`, `card-fill.ts:137,158`, the player and Online video markup, trimmed copies, Improve images.
- Pages and new sites: `native-elements.ts:65`, `shared/native-routes.ts:31-33`, `src/native-create.ts:79`, `shared/starting-point.ts:74,165`.
- Components and styles: `components.ts:1171,1888`, the component loader's `<script src>` (`component-loader.ts:7`), stylesheet links.
- `og:image` and canonical/`og:url` keep full addresses (`site-settings.ts:405`).
- The scanner, rename and Replace everywhere read prefixed addresses through the helper.

## Done when

- The source guard from slice 76 has no allowlist entries left.
- Unit tests of each writer with a prefix; full suite green; domain-root fixtures produce byte-identical output to before.
