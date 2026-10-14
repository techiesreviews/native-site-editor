---
title: Alt text specs after Descriptions and Decorative
type: task (AFK)
status: open
assignee: claude (mm-83 runner)
blocked_by: [13-descriptions-and-decorative]
builder: claude
phase: 1
---

## What

Follow-up to slice [13](13-descriptions-and-decorative.md). Since slice 13 landed (fab89ba4), two browser tests fail on plain `origin/dev`:

- `tests/native-save/native-structure.spec.ts` (about line 134): after emptying an image's Alt text it expects the status "Image marked decorative" but sees "Alt text removed".
- `tests/native-save/native-block-bars.spec.ts` (about line 76): after Escape closes the image chooser, it times out finding the Edit bar's "Alt text" button.

Map ticket [13's resolution](../../tickets/13-what-agents-may-do.md#resolution-2026-10-13) decided that old empty descriptions count as **not described yet** until the picture or place is marked **Decorative**, and that the editor remembers that mark because `alt=""` alone cannot tell the two apart. So emptying the Alt text no longer means Decorative; Decorative is its own Edit bar toggle.

For each failure, decide whether the test is stale (slice 13's new wording or flow is the decided behaviour: update the spec) or slice 13 broke something (fix the code).

## Done when

- Each failure is classified as a stale test or a regression, with the reason.
- Both specs pass, three runs in a row, on the default fixture group.
- `npm run check`, the unit suite and `npm run lint` are green.
