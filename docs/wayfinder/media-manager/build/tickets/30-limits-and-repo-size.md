---
title: Limits, warnings and repo size
type: task (AFK)
status: open
assignee: claude (mm-30 runner)
blocked_by: [23-one-preparation-path]
builder: sol
phase: 2
---

## What

Ticket [07](../../tickets/07-one-upload-path.md#resolution-2026-10-13) "Limits and failures"; research [02](../../tickets/02-research-optimising-every-media-kind.md#resolution-2026-10-11) §8.

- Hard cap: 20 MiB per stored file (`/api/blob`); a larger source may be prepared first.
- **Large download** note above 1,000,000 bytes for images and 10,000,000 for video, audio and other downloads; adding continues.
- If preparation fails, ask before adding the unchanged file only when it suits a website and fits the cap; otherwise give format advice.
- Repo size: shown in Adding settings ★, with warnings at 500 MB and 900 MB (GitHub Pages stops at 1 GB).

## Done when

- `tests/media-limits.test.ts`: cap, both warning sizes in decimal bytes, the failure rules, repo size thresholds.
