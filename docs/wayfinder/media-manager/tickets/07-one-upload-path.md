---
title: Decide the one way media gets added
type: grilling (HITL)
status: open
assignee: Lex + Codex (grilling)
blocked_by: [02-research-optimising-every-media-kind, 04-research-media-code-today]
---

## Question

Today four upload paths skip the optimise step and store files as they are. Should every way of adding media (the manager, the picker, the Structure slot, the component panel, Site settings, file tree drops, dropping on the canvas) go through the same optimise step, and how much of it does Lex see each time: the full settings, a one-line summary with "change", or nothing unless a file is unusual? What are the defaults per kind (format, quality, largest width, responsive copies on or off)? Are originals kept, and if so where (next to the copies, in a hidden folder, or not in the site at all)? What happens with HEIC photos from a phone, very large files and files the browser cannot optimise? Where do new files go (folder and file name) and does Lex choose?

## Comments

### Adding experience agreed with Lex (2026-10-12)

Lex chose **Automatic, with a short progress summary and optional settings in More** when asked how adding media should behave anywhere in the editor. All media entry points share this adding experience. Dropped files start adding immediately, as already agreed in the prototype ticket. Choosing files through Add new file uses the same automatic processing rather than a mandatory settings review.

This settles the adding experience only. Processing defaults, responsive copies, original retention, exceptions, storage locations and initial names remain open. No demonstration setting from the prototype is treated as agreed policy. The ticket stays open until those decisions are made with Lex.

### Photo and screenshot size agreed with Lex (2026-10-12)

Lex chose **Balanced quality, up to 2,400 pixels wide** for automatic processing of photos and screenshots. Full-size output and a smaller 1,600-pixel default were offered as alternatives. Image format and the remaining processing rules are still to be discussed.

### Photo and screenshot format agreed with Lex (2026-10-12)

Lex chose **WebP — quick adding and small files** as the automatic format for photos and screenshots. AVIF by default and preserving JPEG/PNG by default were offered as alternatives. Whether optional settings offer those alternatives, and how transparent images are treated, remain open.

### Responsive copies agreed with Lex (2026-10-12)

Lex chose **Automatically while adding** after being offered responsive widths of **480, 960 and 1,600 pixels**, only where smaller than the main image. The image and its copies appear together as one item in Media. Making copies on first placement and choosing sizes each time were offered as alternatives.

The term **Image family** is added to `CONTEXT.md` for this grouping. Original retention is not yet decided. Page markup, choosing the right copy at each use and exceptional placement contexts remain with [Decide the responsive image output](08-responsive-image-output.md); its discussion should use these agreed adding defaults.

### Original retention agreed with Lex (2026-10-12)

Lex chose **Keep only the website version by default; offer Keep original in settings**. The original on the user's phone or computer is untouched. Always keeping an original and never allowing originals in the site were offered as alternatives. The location and treatment of an optionally retained original are still to be discussed.

### Original location agreed with Lex (2026-10-12)

Lex chose **Separate originals folder; accessible from image details**. Keeping originals beside the website versions was offered as an alternative. Lex was told that an original stored in the site remains downloadable by someone who knows its address; the separate folder is organisation, not private storage. The exact folder path and treatment of hidden personal details remain open.

### Personal details in originals agreed with Lex (2026-10-12)

Lex chose **Remove hidden personal details automatically** for originals retained in the site, while keeping the full-size picture. Location and camera information were the concrete examples in the question. Keeping the source bytes completely unchanged and asking each time were offered as alternatives. Keep original therefore means retaining the full-size source picture, not promising a byte-identical archive.

### Transparent image format agreed with Lex (2026-10-12)

Lex chose **Automatically choose the smaller WebP or PNG** for images with transparent backgrounds, preserving transparency. Always using WebP and always using PNG were offered as alternatives. This is an agreed exception to the ordinary WebP default for photos and screenshots.

### SVG processing agreed with Lex (2026-10-12)

Lex chose **Keep SVG; make it smaller and remove hidden executable code** for logos and drawings. The question explained that keeping SVG preserves sharpness at any size. Converting SVG to WebP and keeping SVG bytes unchanged were offered as alternatives. Artwork is preserved; executable content is removed.

### Animated GIF processing agreed with Lex (2026-10-12)

Lex chose **Convert to a silent looping video automatically** for animated GIFs, after being told that the converted file is treated as a video rather than an image. Keeping GIF and asking before conversion were offered as alternatives. The existing compatible-picker and explicit Use rules still apply; conversion is not permission to place video into an image-only location. Placement details remain with [Decide how video, audio and documents are handled](12-video-audio-and-documents.md).

### HEIC processing agreed with Lex (2026-10-12)

Lex chose **Convert HEIC automatically like other photos**: the same WebP website-image path, without asking the user to convert the phone photo first. Asking before conversion and requiring manual conversion were offered as alternatives. Browser-processing failures are still to be discussed.

### Video defaults agreed with Lex (2026-10-12)

Lex chose **Balanced MP4, up to 1080p, with sound and a still preview** for uploaded videos. A smaller 720p default and keeping full size/original format were offered as alternatives. This settles adding defaults; playback controls, background-video behaviour, embedded-video links and placement remain with [Decide how video, audio and documents are handled](12-video-audio-and-documents.md).

### Audio defaults agreed with Lex (2026-10-12)

Lex chose **Shrink large recordings; keep already-small audio unchanged**. Larger recordings become smaller M4A files; already-small MP3/M4A files are kept to avoid another lossy conversion. Converting every file and preserving all audio unchanged were offered as alternatives. Exact balanced encoding settings and the boundary for already-small audio will be included in the final policy confirmation.

### PDF and download defaults agreed with Lex (2026-10-12)

Lex chose **Keep files unchanged; show a first-page preview for PDFs**. The alternative was unchanged files with a simple file icon. Preview generation does not modify the downloadable document. Size limits and processing failures remain open.

### Large-file limit agreed with Lex (2026-10-12)

Lex chose **Try shrinking first; stop if the result is still over 20 MB**. Rejecting a starting file over that size and asking before trying were offered as alternatives. The existing upload cap is 20 MiB per stored file; “20 MB” was the plain-language label in the question. It applies to each stored output, not automatically to the incoming source file. Unchanged downloads must also fit the cap. Optional originals and files that cannot be processed still need exception handling.

### Large-download warnings agreed with Lex (2026-10-12)

Lex chose **Show a Large download note; keep adding**, with optional settings available to reduce size. The agreed warning thresholds are **over 1 MB for images** and **over 10 MB for video, audio and other downloads**. Pausing to ask and showing only hard-limit errors were offered as alternatives. These warnings do not bypass the per-file hard cap.

### Browser-processing failures agreed with Lex (2026-10-12)

Lex chose **Ask before adding a usable file unchanged** if the browser cannot prepare it. Adding unchanged automatically and always refusing with conversion advice were offered as alternatives. The unchanged option is offered only if the file fits the hard cap and is suitable for website use. Otherwise explain a format to try instead. Failed preparation must not silently bypass required SVG executable-content removal or present an undecodable HEIC as a working website image.

### Larger image output agreed with Lex (2026-10-12)

Lex chose **Keep the smaller usable version automatically** when preparation makes the main image larger. The question explicitly allowed keeping JPEG/PNG instead of WebP, while still making responsive copies. Always forcing the selected format and asking which version to keep were offered as alternatives. The retained main version must still satisfy the agreed size, suitability and personal-detail rules; comparisons use the version eligible for website storage rather than unsafe or unsuitable source bytes.

### Original retention across media agreed with Lex (2026-10-13)

Lex chose **Use the same original-retention rule for all changed media**. Keep original is off by default, optional in settings, stored separately and accessible from the file's details. Offering it only for photos and always keeping video/audio originals were offered as alternatives. Unchanged files do not need a second identical original. Required personal-detail removal and SVG executable-content removal still apply to retained website files.

### Oversized optional original agreed with Lex (2026-10-13)

Lex chose **Ask whether to add without the oversized original** when Keep original is selected, the original exceeds the per-file cap, and the website version fits. Silently skipping the original with a note and refusing the whole file until settings change were offered as alternatives. The original is not silently omitted or stored over the cap.

### Default storage agreed with Lex (2026-10-13)

Lex chose **One media folder, grouped by kind** for newly added media: `media/images/`, `media/videos/`, `media/audio/` and `media/downloads/`. Separate top-level folders and choosing a folder each time were offered as alternatives. Collection membership remains independent of physical storage and does not create copies. The exact originals path, handling an explicit Files-tab destination, and initial file names remain to be settled.

### Session handoff (2026-10-13)

Lex requested `$handoff` after the default-storage choice. The ticket remains open and claimed. The comments above record actual answers; no final resolution or map Decisions-so-far entry has been written. Remaining discussion covers explicit folder destinations, original-folder naming, initial names and conflicts, optional settings and their persistence, and the precise balanced audio defaults. Finish the live conversation and confirm the complete policy with Lex before closing the ticket.

### Explicit folder destination agreed with Lex (2026-10-13)

Lex chose **Keep it in the folder I dropped it into** for media dropped into a particular folder in Files. The prepared website file stays in that chosen folder while using the same automatic preparation as other adding paths. Always sending it to the usual media folder was offered as an alternative. Collection membership remains independent of physical storage. The separate location for an optionally retained original is unchanged; its exact path remains to be settled.

### Exact originals folder agreed with Lex (2026-10-13)

Lex chose **Always use `media/originals/`** for optionally retained full-size originals, including when the prepared website file was dropped into a different folder in Files. An originals subfolder within the chosen destination was offered as an alternative. The original remains accessible through the file's details. The previously agreed retention, personal-detail removal and per-file size rules still apply.

### Initial media names agreed with Lex (2026-10-13)

Lex chose **Keep the incoming name; update its format ending** for newly added media. For example, `holiday.jpg` becomes `holiday.webp` when converted and appears as `holiday.webp` in Media. Generating numbered names such as `image-001.webp` was offered as an alternative. This settles the initial naming basis and format extension; safe-name adjustments and duplicate-name handling remain to be settled. Renaming existing files remains with [Decide how collections and file names behave](15-collections-and-file-names.md).

### Incoming name tidying agreed with Lex (2026-10-13)

Lex chose **Automatically tidy names** while adding media: lowercase names with spaces and punctuation turned into hyphens. The example offered was `Summer Holiday (1).JPG` becoming `summer-holiday-1.webp`. Keeping capitals and spaces while changing only characters that cannot be used safely was offered as an alternative. This applies to newly added files; existing-file rename rules remain with [Decide how collections and file names behave](15-collections-and-file-names.md).

### Duplicate incoming names agreed with Lex (2026-10-13)

Lex chose **Automatically add a number and keep both** when a newly added file's name already exists in its destination folder. The example offered was adding `holiday-2.webp` when `holiday.webp` already exists. Pausing to ask for a different name was offered as an alternative. Adding a file never replaces an existing file.

### Optional adding settings agreed with Lex (2026-10-13)

Lex chose **Simple choices only** for the optional adding settings in More: choices such as **Smaller files**, **Balanced** and **Higher quality**, plus **Keep original**. Simple choices with an Advanced section and showing detailed controls straight away were offered as alternatives. No Advanced section for exact sizes, formats or quality numbers is planned. Exact preset mappings and whether changed settings persist remain to be settled; the automatic adding experience is unchanged.

### Adding settings persistence agreed with Lex (2026-10-13)

Lex chose **Remember my choices for this site** when adding settings are changed in More, including **Keep original**, with an easy **Reset to defaults**. Applying changed settings only to the next batch and then returning to defaults was offered as an alternative. Remembered choices apply to future additions on that site; this does not authorise changing existing media.

### Optional AVIF choice agreed with Lex (2026-10-13)

Lex chose **Offer Smallest files (slower) as an extra choice** in the simple image adding settings, using AVIF. The question explained that the research found potentially smaller files but much longer preparation. Leaving AVIF out of the adding settings was offered and recommended as an alternative; Lex chose to include it. AVIF is optional, not the Balanced default. The ordinary WebP default and previously agreed exceptions remain; exact preset mappings are still to be confirmed. This decision concerns adding media, not the separate fix-all policy.
