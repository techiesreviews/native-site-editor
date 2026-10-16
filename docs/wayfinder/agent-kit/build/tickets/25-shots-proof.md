---
title: "Proof: media screens before/after with kit shots --compare dev"
type: task (AFK)
status: closed
assignee: lead
blocked_by: [07-kit-shots-layout, 08-kit-shots-compare, 30-shots-print-findings]
builder: lead
---

## What

- Lead runs `kit shots media-gallery file-details files pages image-popup --compare dev` and shows Lex the contact sheet.

## Files

- none in the repo (output under the main root .scratch/shots/)

## Done when

- Contact sheet shown in chat; layout findings listed.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.

## Done (2026-10-16)

- Shot media-gallery, file-details, files, pages and image-popup at 390/768/1280 × light/dark:
  before = dev at 0a69178a (before slices 122–125), after = dev at 37330db1. 60 shots, 0 failed.
  Output: `/home/ubulex/Projects/native-site-editor/.scratch/shots/ak-25/proof/` (contact.html,
  contact.webp 296 KB, webp copies 9–38 KB, index.json).
- `--compare 0a69178a` refused ("predates kit shots"), because compare runs the base's own tooling.
  The lead overlaid today's kit tooling onto a detached worktree of 0a69178a and shot `before` and
  `after` with steps files into one `--out`. Follow-up: ticket 31.
- Layout findings (after): tap targets crowded on phones (More publish actions next to Publish;
  32 px Files/Pages rows; device-size buttons) and one contrast finding in the image popup's
  "Original" badge (3.7:1). Shown to Lex in chat as a before/after page (desktop light, phone dark).
