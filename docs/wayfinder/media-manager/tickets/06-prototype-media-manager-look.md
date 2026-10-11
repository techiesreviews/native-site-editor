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

This comparison preceded Lex's choices below. Candidate upload and clean-up policies do not settle their separate tickets.

The claim was committed and pushed under the tracker convention. That started the existing CI workflow; its run ended cancelled with the Deploy step skipped. Further prototype work is committed locally on `dev`, without a push, to respect the instruction not to deploy.


### Choices settled with Lex (2026-10-11)

- **Direction:** Lex chose Collections as the visual basis for refinement. In the compact refinement, Lex changed the starting view to the picture grid, with collections opened when needed.
- **Place in the editor:** Media replaces Images and becomes the place to manage all images, videos, audio, PDFs and other downloads. Files remains for the site's other files.

- **Collection view:** Lex chose a picture grid first, with a switch to a list showing file size and usage.

- **Group name:** Lex chose **Collections**, browsed like folders. A media file may belong to several collections without extra copies. Collection membership is separate from a file's storage location. The term **Media collection** is recorded in `CONTEXT.md`.

- **Finding files:** Lex chose always-visible search and kind buttons for Images, Video, Audio and Documents, with extra filters under **Filters**.

- **Usage badge:** Lex chose a small number with the image. Hover expands the badge to **Used on X pages**.

- **Usage on touch screens:** Lex chose tapping the numbered badge to show the usage text and page names.

- **Files with no uses found:** Lex chose a **0** badge expanding to **No uses found**, plus a filter to find them. A file with other uses, such as a social sharing image, is not included merely because it has zero page uses.

- **Picker:** Lex chose the same collections, search and views in a smaller window, full-screen on phones. The term **Media picker** is recorded in `CONTEXT.md`.

- **Compact opening view:** Lex wants to start by seeing the images, then go into a collection if needed. Media opens on **Images**, with buttons to switch to other kinds and an accessible Collections control. The interface and its workings should be more compact, with fewer repeated headings, toolbars and steps.

### Refined Collections mockup (2026-10-11)

The [refined mockup](../prototype/refined.html) incorporates the choices above and keeps all five screens available: library, adding files with optimise, details, the page picker and clean-up. Published with `html_render` in T3 thread `492d7080-d465-4710-96fd-0516aedb90b7`, attachment `492d7080-d465-4710-96fd-0516aedb90b7-28a968f2-73cb-462c-bc2b-39e9929c3c71-html`.

[Refinement validation](../prototype/refined-validation.md) records phone, tablet and desktop browser checks, the independent source review, and corrections to picker scrolling, cancellation and partly completed uploads. Downloaded Mobbin references remain embedded from local prototype assets.

The proposed small-screen layout has two pictures across on phones and three on tablets, with details on their own screen and the confirmed full-screen phone picker. Lex asked to **make the interface and workings more compact**. This calls for a further refinement of controls and navigation; the ticket remains open until Lex has seen it.

Organisation rules and existing file renames have graduated into [Decide how collections and file names behave](15-collections-and-file-names.md). This follow-up does not reopen the name Collections or the decision to allow several memberships.

### Compact, pictures-first refinement (2026-10-11)

The refined mockup now opens directly on Images. Collections opens from the grid when needed. Repeated screen navigation, headings and upload steps have been removed; search and kinds remain visible, while filters, file count and grid/list share a toolbar. The picker opens directly on compatible files. Phone details use a shorter preview and disclosures for usage and memberships; clean-up uses short suggestion rows while retaining review and confirmation.

Published with `html_render`, title **Media manager: compact, pictures first**, in T3 thread `492d7080-d465-4710-96fd-0516aedb90b7`, attachment `492d7080-d465-4710-96fd-0516aedb90b7-2db4ce96-bec3-486d-93f7-07b9bd338f18-html`. The [validation record](../prototype/refined-validation.md) covers the compact screens, independent review and corrections to search scope, collection counts and returning to the latest file view.

**Awaiting Lex's reaction to this compact version, including phone and tablet presentation. The ticket remains open.**
