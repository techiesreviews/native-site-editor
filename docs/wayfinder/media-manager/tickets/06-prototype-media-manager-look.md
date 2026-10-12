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

Lex chose **Tiles — more pictures in cropped squares** from the new Google Photos / Apple Photos comparison. The [selected Tiles mockup](../prototype/tiles.html) is the current design reference. It carries the chosen look through the library, adding files with optimise, details, the page picker and clean-up. The earlier [Canvas mockup](../prototype/canvas.html) remains a historical reference; this selection replaces its larger picture-grid presentation.

- **Place in the editor:** Media replaces Images and manages images, video, audio, PDFs and other downloads. Files remains for the site's other files, such as pages, styles and scripts.
- **Opening and views:** Media opens directly on **All**, showing every media kind in a dense square grid, including files with no collection. Thumbnails crop the preview to fit; this does not crop the stored image. A list switch shows file size and usage. Filenames appear on hover, keyboard focus or selection on devices with a mouse, and remain visible on phones and devices with touch. Full names are available in details and the list; there is no extra kind-and-size line on pictures.
- **Organisation:** **Collections** are named groups that narrow the current file view. One media file can belong to several collections without extra copies. Collections are chosen through an always-visible dropdown; the separate right-hand Collections shortcut is removed. There is no separate folder tree or tag field; membership is separate from physical storage.
- **Finding files:** Lex’s latest simplification keeps **search and a Collections dropdown** visible at every size. The separate kind-button row, Filters row and file-count toolbar are removed. File types and grid/list choices remain available through **More**; All remains the opening kind, and Documents includes PDFs and other downloads. Usage is removed from filtering. The extra Images heading and explanatory small print are removed. Search respects the selected kind, with recovery to all media when needed; the picker remains restricted to compatible files.
- **Usage:** A numbered badge sits with each picture. It counts distinct pages, rather than collection memberships. Hover or keyboard focus expands **Used on X pages**; tapping opens the usage text and page names. A checked file with no uses found has **0 / No uses found**. The clean-up view still offers these files for review; there is no usage filter in the library. Other uses and **Not checked yet** are shown separately, so zero page uses alone cannot imply unused.
- **Page picker:** The same manager's collections, search, views and media records appear in a smaller window, with only compatible files available. The picker is full-screen on phones. Add files and file details remain within it; Use confirms the choice and Cancel keeps the existing placement.
- **Phone and tablet:** The selected mockup shows three square pictures across on phones, four on tablets and six on wider screens. Phone filenames use readable strips and may shorten long names. Details opens on its own screen with Back and shows the complete name and image. Usage is available by tap; hover/focus wording opens below the top controls. Independent usage and selection targets remain at least 44 px and do not overlap. The phone picker keeps its status above a single row of Cancel and Use buttons.

The latest selected Tiles publication is recorded below under **Search and Collections simplification**. A new control-layout comparison, awaiting Lex’s choice, is recorded under **Finding and inserting first**. The first selected Tiles publication remains under **Tiles selection and refinement**. The preceding Canvas mockup was published with `html_render`, title **Media manager: photo-style Canvas**, in T3 thread `492d7080-d465-4710-96fd-0516aedb90b7`, attachment `492d7080-d465-4710-96fd-0516aedb90b7-e4e3fba8-9f28-451f-8216-77cd5c98a8e6-html`. Canvas source SHA256: `0dc3f3b3bb48f8be447a9dbcf9229a0883cf1d0cc9eeec94657e5e7f64f944e1`. Downloaded references remain available as research assets.

**Follow-up decisions:** [Collections and file names](15-collections-and-file-names.md) graduates the map's **Folders, names and tags** fog into a concrete ticket, covering collection management and existing file renames. Its dependency was added to the handoff. The terms **Media collection** and **Media picker** were added to `CONTEXT.md` using domain-modeling. New upload destinations and naming remain in ticket 07.

The mockup demonstrates optimise comparison, progress, retry, clean-up review, confirmation and Undo. It does not settle upload defaults or original retention (07), responsive output (08), crop/focus (09), scanner scope and safe removal/recovery (10), or descriptions and agent permissions (13). The remaining map fog still depends on those decisions. No editor code was changed or deployed.

Verification is recorded in [the selected Tiles checks](../prototype/tiles-validation.md), [photo-app comparison](../prototype/photo-app-validation.md), [earlier Canvas checks](../prototype/canvas-validation.md), [look review](../prototype/look-validation.md), [compact refinement checks](../prototype/refined-validation.md) and [the first comparison](../prototype/validation.md). [Downloaded Mobbin screens](../prototype/references/README.md) are kept locally and inlined into published mockups; no expiring image links are used. All prototype work after the initial claim was committed locally on dev without a push.

### Photo-library refinement (2026-10-12)

After choosing Canvas, Lex asked for **All** by default, removal of the right-hand Collections button and Images heading, collection filtering exposed when space permits, no usage filter, and fewer small explanatory labels. Lex clarified that the whole Collections button should go, with collections chosen through filters, and asked for a photo-app feel. These instructions amend the decisions above.

The [Apple Photos library reference](../prototype/references/apple-photos-library.webp), [permanent Mobbin source](https://mobbin.com/screens/fd1557f6-17b2-4214-baca-c788ba625f5d), was downloaded and inspected. That earlier refinement borrowed its picture-led presentation and quiet controls within Canvas. Filenames, usage badges, actual list/detail information and necessary status or confirmation feedback remained; decorative helper copy was removed. Phone and wider-screen checks covered collection filtering, resizing and compatible picker targets; that review and its corrections remain in `canvas-validation.md`.

### Tiles selection and refinement (2026-10-12)

Lex answered **Tiles — more pictures in cropped squares** when asked which new photo-app layout to refine. Tiles is promoted into its own selected mockup, removing the comparison pill and its reserved top space. The library and smaller compatible picker use the same dense square presentation; adding files, details and clean-up retain their working entry points. The recorded organisation, search and usage decisions remain in place.

The current comparison surface is removed after selection under the prototype skill. Its source is retained in Git at `f2956c77`; read it with `git show f2956c77:docs/wayfinder/media-manager/prototype/photo-app-directions.html`. The comparison publication and [review record](../prototype/photo-app-validation.md) remain research evidence. Earlier prototypes and downloaded reference screens remain available.

Tiles is a visual direction, rather than a new domain term. Existing **Media file**, **Media manager**, **Media collection** and **Media picker** definitions cover this choice; `CONTEXT.md` needs no further glossary entry. No additional fog is cleared beyond the already graduated collection/file-name ticket, and no other decision ticket is resolved here. This ticket remains closed with its visual resolution updated to Lex's explicit choice.

Published with `html_render`, title **Media manager: Tiles — selected mockup**, height 1100, in T3 thread `492d7080-d465-4710-96fd-0516aedb90b7`, attachment `492d7080-d465-4710-96fd-0516aedb90b7-6613398c-98ce-4e09-9f43-3f28d6205265-html`. Selected source SHA256: `cc0263544f3b783d70cff7a0fffb8551a7a7a42f7306d6d71f643d8296dd54f0`. [Selected Tiles checks](../prototype/tiles-validation.md) cover the extraction and its phone/tablet workflows; the independent design review remains in the comparison record. T3's browser still reported its host AppArmor error, so local Playwright supplied rendered checks. This changes planning artifacts only, committed locally on dev without a push or deployment.

### Supporting-screen refinement (2026-10-12)

Lex asked for the other parts of the interface to feel more like the photo apps too. The [current Tiles prototype](../prototype/tiles.html) now carries that direction through file details, adding files, the compatible picker, clean-up and their shared controls. [Four additional Mobbin references](../prototype/references/README.md) were downloaded and inspected: Apple Photos file information and Google Photos selection/clean-up screens. They guide the visual hierarchy and controls, rather than adding consumer-photo features or changing media policies.

- **Details:** a large, complete image preview beside grouped information on wider screens, stacked on phones. File name, description and overlapping collection memberships remain editable. Usage and responsive copies have clear expand/collapse controls. Save and Cancel follow the fields, fixing the phone footer that covered labels.
- **Adding files:** a short import entry and focused review, with the image's name above Original / Smaller copy previews. The chosen version has a check and text. Individual files retain their status, including PDFs kept as-is; totals explicitly cover all files. Progress, partial success, cancel and retry remain available.
- **Picker:** a compact header and the same compatible Tiles library. Search and kind controls stay visible while the files scroll, with the selected file and Cancel / Use in a separate, reachable action row. Phone stays full-screen. Details and import use their own single action row; returning preserves the prior list position and focus.
- **Clean-up:** category preview collages, count and size lead into larger review previews and explicit file-level confirmation. The checked/other-use/unchecked distinction, scan limits, Keep files, sample removal and Undo remain intact.
- **Shared controls:** softer pill controls, fewer repeated headings and helper explanations, grouped usage information and a reachable selection bar. Adding selected files to a collection requires an explicit choice instead of silently preselecting Studio art. The selected grid density, initial All view and collection-only filtering remain in place.

Published with `html_render`, title **Media manager: photo-app interface — refined**, height 1300, thread `492d7080-d465-4710-96fd-0516aedb90b7`, attachment `492d7080-d465-4710-96fd-0516aedb90b7-5a690844-611b-4d1e-ba39-c2671a330cf9-html`. Supporting-screen source SHA256: `0f67231dd6a91573436a594b749366eca9ccf2e4cc7b04bccc3e98a872cba925`. [Validation](../prototype/tiles-validation.md) records the read-only Opus design review, workflow checks and the corrected 30-image picker regression. Lex responded by asking to simplify the library to search and a Collections dropdown; that subsequent refinement is recorded below.

This is a refinement of the selected Tiles direction. It introduces no new domain term or resolved policy; collection management/file names, upload defaults, scanner/removal rules and descriptions/agent rules remain with their existing tickets. No further fog is cleared and no other ticket is closed. The work changes planning artifacts only, committed locally on dev without a push or deployment.

### Search and Collections simplification (2026-10-12)

Lex asked to keep the interface super simple, starting with search and a Collections dropdown, using the new HTML/CSS select features. Lex then added **compact**. The selected Tiles prototype now keeps these two controls on one row even on phones, with 44 px heights and an 8 px gap. Long selected collection names shorten in the closed control; the dropdown keeps the complete names. This supersedes the earlier always-visible kind buttons and space-dependent Filters presentation.

The dropdown is an actual native select, progressively enhanced with customizable-select styling: a quiet rounded surface, a matching menu and a visible check beside the selected collection. Browsers without the enhancement keep the ordinary native control. Search and Collections are the primary browsing controls; kind and grid/list choices remain in More. The compatible page picker follows the same compact presentation and retains its separate reachable Cancel / Use row.

Published with `html_render`, title **Media manager: compact search and Collections**, height 950, thread `492d7080-d465-4710-96fd-0516aedb90b7`, attachment `492d7080-d465-4710-96fd-0516aedb90b7-89db0b3f-dff3-4d13-ab9e-5cb2da2de908-html`. Current source SHA256: `720341dadfda40d3f82b88fe95f5fed4d69c23e5e8d46c929a7e90f81aa77075`. [Validation](../prototype/tiles-validation.md) records the focused native-select and compact phone/tablet checks, limited Opus review and keyboard-focus correction. The published mockup is ready for Lex’s next reaction; no response has been assumed.

This refinement adds no domain term or media policy. **Media collection** and **Media picker** already cover the agreed behaviour in `CONTEXT.md`; browser styling features are implementation details. The collection/file-name fog already graduated to ticket 15, and no further fog or ticket is resolved here. Only prototype and planning artifacts change, committed locally on dev without a push or deployment.

## Comments

### Finding and inserting first (2026-10-12)

Lex asked to remove the redundant Media title and explore simpler arrangements of search, Add files, Collections and More. The primary use is finding an image to add or insert; managing files comes second. Lex also asked for a softer gradient blur behind the selection control, usage number and filename, clarifying **“with the name”** when asked about the overlays.

The new [control-layout comparison](../prototype/find-first-directions.html) explores three genuinely different placements within the selected Tiles direction:

| Direction | Arrangement | Trade-off |
| --- | --- | --- |
| Search first | Full-width search, then Collections, Add files and More | A clear search field and named actions, using two rows |
| One bar | One shared row on wide screens; search and icons above Collections on phones | More room on wide screens, with less prominent action labels |
| In the grid | Add files is the first tile in the unfiltered view, after matches in search/collection results | A direct picture-area entry point, using one thumbnail position |

All three omit the visible Media title, retain the existing editor tabs, use the native Collections dropdown and keep management in More. They reuse the working import, details, compatible page picker and clean-up screens. In the picker, selecting a compatible file and confirming Use still inserts it for that place; the ordinary manager does not silently insert a file. All remains the opening media kind, while the page picker remains restricted to compatible files. The selected grid density and shared media/collection records remain unchanged.

The soft photo-overlay treatment keeps foreground text and symbols sharp, using a fading background behind them. Files without a picture preview keep a clean surface with dark text instead of photo gradients. Names, checked selection and the usage distinctions remain available, with independent touch targets; this is a visual experiment rather than a new media rule.

Published with `html_render`, title **Media manager: finding and adding first — three ideas**, height 1000, thread `492d7080-d465-4710-96fd-0516aedb90b7`, attachment `492d7080-d465-4710-96fd-0516aedb90b7-675e6ab4-22ac-4bba-a866-47fc3ad9305d-html`. Comparison source SHA256: `ba1e877f632cb25b5e4370ca21e4d1354ef48f6b47dfa3b20ea307b7fdef7951`. [Validation](../prototype/find-first-validation.md) records the focused checks, limited design review and its corrections. Downloaded local media remain inlined; the comparison uses no expiring image links. Close the page picker before switching comparison directions, because its native modal makes the outer comparison control inert.

**Awaiting Lex’s choice:** no direction from this comparison is promoted or treated as chosen. The selected `tiles.html` remains the previous design reference until that choice. This is further exploration within the already claimed look ticket; it does not settle another ticket or clear additional fog. No new domain term is introduced, and `CONTEXT.md` keeps its existing media vocabulary. Prototype and planning artifacts only, committed locally on dev without a push or deployment.


### New photo-app exploration (2026-10-12)

Lex requested a **new prototype**, using Mobbin to take inspiration from Google Photos and Apple Photos. The [photo-app comparison checks](../prototype/photo-app-validation.md) record three layouts explored around the agreed media-manager behaviour; the original source is retained at commit `f2956c77`:

| Direction | Layout | Strength | Trade-off |
| --- | --- | --- | --- |
| Timeline | Date-grouped, fitted picture rows | Makes recent additions easy to browse | Date headings take space; dates are demonstration added dates |
| Tiles | Closely spaced square thumbnails | Shows more files at once | Previews crop the original image shape |
| Natural | Full-image rows at each image's original proportions | Makes different shapes and the full picture visible | Less uniform and less dense than square tiles |

The new [Google Photos and Apple Photos references](../prototype/references/README.md) were found through Mobbin MCP, downloaded and inspected. They inform the grid, filtering and selection presentation. All remains the opening kind, Collections stays in filters, and usage remains available through badges. The existing five screens and compatible page picker are retained. Reference screenshots are design research; sample images are separate assets from the map's reference site.

Published with `html_render`, title **Media manager: photo-app directions**, in T3 thread `492d7080-d465-4710-96fd-0516aedb90b7`, attachment `492d7080-d465-4710-96fd-0516aedb90b7-243e8714-baeb-4684-85ee-c26a59a6c9b0-html`, height 1600. Source SHA256: `6b203f2035d0bdc1cff80632b1a949743d478c250d9dc108af058b289e7348d4`. [Validation](../prototype/photo-app-validation.md) records the phone/tablet/desktop checks, the limited independent design review and corrections to short Timeline rows, narrow-tile controls, filenames and usage text. The standalone prototype, local reference screens and documentation are committed locally on `dev`; no editor code was changed, pushed or deployed.

**Choice made:** Lex chose **Tiles — more pictures in cropped squares** on 2026-10-12. The resolution above now records Tiles in place of Canvas. Timeline's date groups and Natural's uncropped row layout were not selected; no new selection mode or domain term was introduced. This exploration does not close another ticket or clear additional fog.

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
