---
title: Prototype the media manager's look
type: prototype (HITL)
status: open
assignee: Lex + Codex (prototype)
blocked_by: [01-research-mobbin-patterns, 04-research-media-code-today]
---

## Question

What should the media manager look like, and how does it work as one place? Using the Mobbin patterns, make mockups (published with `html_render`) of the main screens: the library itself, adding files with the optimise step visible, the detail panel for one file, the picker opened from a spot on a page, and the clean-up view. Decide with Lex: whether it replaces the Images tab and takes in media from Files (images, video, audio, PDFs) or sits beside Files; grid, list or both; how search, kinds, folders and tags show; how "used on" and "unused" are shown; whether the picker is the same manager in a smaller frame; and what it looks like on a tablet or phone. Show two or three clearly different directions first, then refine the one Lex picks.


## Comments

### First design comparison (2026-10-11)

Three candidate directions are ready for Lex: **Gallery** (large previews), **Desk** (compact file list) and **Collections** (folders first). The [interactive mockups](../prototype/directions.html) cover the library, adding files with the optimise comparison, details, choosing a file for a page and clean-up. Supporting screens are shared and labelled as such. The [six downloaded Mobbin references](../prototype/references/README.md) are kept with the prototype; it does not use expiring image links.

Published with `html_render` in T3 thread `492d7080-d465-4710-96fd-0516aedb90b7`, attachment `492d7080-d465-4710-96fd-0516aedb90b7-e30cff01-bc01-4603-8d4c-d836e5d8f39d-html`. [Validation and review](../prototype/validation.md) record local browser checks at 360, 728 and 768 px and the independent design review. T3's `html_preview` browser was blocked by the host's AppArmor configuration; local Playwright supplied rendered checks before publication.

**Awaiting Lex's choice. This is not a resolution.** The ticket stays open. Replacing Images, the relationship with Files, views, finding and organising media, usage labels, picker and small-screen behaviour still need explicit decisions with Lex before refinement and closure. Candidate upload and clean-up policies do not settle their separate tickets.

The claim was committed and pushed under the tracker convention. That started the existing CI workflow; its run ended cancelled with the Deploy step skipped. Further prototype work is committed locally on `dev`, without a push, to respect the instruction not to deploy.
