---
title: Known limits of the preview preload and the Page Structure editor
status: needs-triage
assignee:
blocked_by: []
---

# Known limits of the preview preload and the Page Structure editor

## What

Accepted when merged; recorded in
[p5-15](../../../wayfinder/lean-fast-editor/build/p5-15-preview-preload.md) and
[p5-slices-handoff](../../../wayfinder/lean-fast-editor/build/p5-slices-handoff.md):

- Preview preload (slice 10b): a deploy can auto-reload a tab showing a
  non-native repo after a native one (drafts flushed, loop-guarded); the
  stale-predicted-read regression test passes with or without its fix.
- Page Structure in-place editing: a change to an unrelated file mid-typing can
  briefly flicker the typed text until the next write; two edit-bar suggestions
  with the same title can refocus the first; the `<br>` allowance does not list
  SVG/MathML or obsolete raw-text elements; the live-patching browser specs use
  a stub, not the real preview runtime.

## Comments

- 2026-10-22: all limits still hold (cbf research 02). The typing flicker and the same-title focus are fixed in [slice 90](../../../wayfinder/clean-up-before-features/build/tickets/90-page-structure-typing-flicker.md) (cbf ticket 04); the `<br>` allowance in [slice 60](../../../wayfinder/clean-up-before-features/build/tickets/60-empty-parts-rule.md); the preload test that passes without its fix in [slice 31](../../../wayfinder/clean-up-before-features/build/tickets/31-native-site-runtime.md). Kept as they are (lead decision): a deploy may reload a tab whose preview is parked (drafts saved first), and the live-patching specs keep their stub.
