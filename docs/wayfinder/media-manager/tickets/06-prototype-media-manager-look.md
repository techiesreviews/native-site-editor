---
title: Prototype the media manager's look
type: prototype (HITL)
status: closed
assignee: Lex + Codex (prototype)
blocked_by: [01-research-mobbin-patterns, 04-research-media-code-today]
---

## Question

What should the media manager look like, and how does it work as one place? Using the Mobbin patterns, make mockups (published with `html_render`) of the main screens: the library itself, adding files with the optimise step visible, the detail panel for one file, the picker opened from a spot on a page, and the clean-up view. Decide with Lex: whether it replaces the Images tab and takes in media from Files (images, video, audio, PDFs) or sits beside Files; grid, list or both; how search, kinds, folders and tags show; how "used on" and "unused" are shown; whether the picker is the same manager in a smaller frame; and what it looks like on a tablet or phone. Show two or three clearly different directions first, then refine the one Lex picks.


## Resolution (2026-10-12)

Lex chose **Canvas — larger pictures with names on them**, including the phone and tablet presentation. The [selected Canvas mockup](../prototype/canvas.html) is the final design reference; earlier comparisons remain research assets. It carries the chosen look through the library, adding files with optimise, details, the page picker and clean-up.

- **Place in the editor:** Media replaces Images and manages images, video, audio, PDFs and other downloads. Files remains for the site's other files, such as pages, styles and scripts.
- **Opening and views:** Media opens directly on the **Images** grid. Collections opens when needed from the grid. Grid is the default inside a collection too, with a list switch showing file size and usage. All media includes files with no collection.
- **Organisation:** **Collections** are named groups browsed like folders. One media file can belong to several collections without extra copies. There is no separate folder tree or tag field in this design; collection membership is separate from physical storage. Collections has its own search, and Back restores the file view just left.
- **Finding files:** Search stays visible, with **All / Images / Video / Audio / Documents** buttons. Documents includes PDFs and other downloads. Collection and usage filters sit under **Filters**. Search makes its active kind clear and offers a way to search all media while keeping the query. Collection counts cover every kind; the picker counts compatible files.
- **Usage:** A numbered badge sits with each picture. It counts distinct pages, rather than collection memberships. Hover or keyboard focus expands **Used on X pages**; tapping opens the usage text and page names. A checked file with no uses found has **0 / No uses found**, and a filter finds these files. Other uses and **Not checked yet** are shown separately, so zero page uses alone cannot imply unused.
- **Page picker:** The same manager's collections, search, views and media records appear in a smaller window, with only compatible files available. The picker is full-screen on phones. Add files and file details remain within it; Use confirms the choice and Cancel keeps the existing placement.
- **Phone and tablet:** Two pictures across on phones, three on tablets, with Canvas's larger picture frames and readable filename strips. Details opens on its own screen with Back. Usage is available by tap. Controls remain easy to tap, while repeated navigation and headings are removed. The phone picker keeps its status above a single row of Cancel and Use buttons.

The selected mockup was published with `html_render`, title **Media manager: Canvas — final mockup**, in T3 thread `492d7080-d465-4710-96fd-0516aedb90b7`, attachment `492d7080-d465-4710-96fd-0516aedb90b7-087a675a-4678-4d42-b9b6-9c5bac8a8739-html`. Source SHA256: `5bad53883e6854905ff0ef8976a63ea9ac90a78a9a5df03f1b5f1f8a77e88af9`. The comparison controls were removed; the downloaded references remain available.

**Follow-up decisions:** [Collections and file names](15-collections-and-file-names.md) graduates the map's **Folders, names and tags** fog into a concrete ticket, covering collection management and existing file renames. Its dependency was added to the handoff. The terms **Media collection** and **Media picker** were added to `CONTEXT.md` using domain-modeling. New upload destinations and naming remain in ticket 07.

The mockup demonstrates optimise comparison, progress, retry, clean-up review, confirmation and Undo. It does not settle upload defaults or original retention (07), responsive output (08), crop/focus (09), scanner scope and safe removal/recovery (10), or descriptions and agent permissions (13). The remaining map fog still depends on those decisions. No editor code was changed or deployed.

Verification is recorded in [the selected mockup checks](../prototype/canvas-validation.md), [look review](../prototype/look-validation.md), [compact refinement checks](../prototype/refined-validation.md) and [the first comparison](../prototype/validation.md). [Downloaded Mobbin screens](../prototype/references/README.md) are kept locally and inlined into published mockups; no expiring image links are used. All prototype work after the initial claim was committed locally on dev without a push.

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

Lex requested another design iteration and chose **the overall look and feel** as its focus. The compact, pictures-first version is the working baseline; the next comparison explores **Quiet** (a flat file browser) and **Canvas** (an image-led contact sheet). The final look and phone/tablet presentation remain open.

### Overall look comparison (2026-10-11)

[Quiet and Canvas](../prototype/look-directions.html) carry the confirmed compact behaviour through the library, details, adding files, picker and clean-up. **Quiet** uses lighter controls and puts filenames below the pictures; **Canvas** uses larger picture frames with names on a dark strip over the picture, taking more vertical space. Both open on Images and offer Collections when needed.

Published with `html_render`, title **Media manager looks: Quiet and Canvas**, in T3 thread `492d7080-d465-4710-96fd-0516aedb90b7`, attachment `492d7080-d465-4710-96fd-0516aedb90b7-5a3e5a8c-5694-4e1d-9972-36b0e53d2ea1-html`. The [look validation](../prototype/look-validation.md) records checks at 360, 728 and 768 px, independent visual review, and corrections to the phone picker footer and selected-file tick.

On 2026-10-12, Lex chose **Canvas**, including phone and tablet presentation. The final decisions are recorded in the resolution above.
