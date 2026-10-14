---
title: Clean-up suggestions and Always keep
type: task (AFK)
status: open
assignee:
blocked_by: [46-wide-use-scanner]
builder: sol
phase: 4
---

## What

Ticket [10](../../tickets/10-safe-clean-up.md#resolution-2026-10-13) "Always keep" and "What clean-up offers".

- Suggest files nothing uses, Trimmed copies no place uses, and leftover responsive copies whose main image is gone. Every kind can be suggested, downloads included.
- Never suggest **Always keep** files, Not checked yet files, or anything while a file cannot be read.
- Not part of clean-up: duplicates, large files, kept originals.
- Groups with count and size for the review (slice 50); the count for the badge (slice 49).

## Done when

- `tests/media-clean-up.test.ts`: each group, Always keep excluded, unchecked excluded, unreadable blocks all, leftover copies, kept originals excluded.
