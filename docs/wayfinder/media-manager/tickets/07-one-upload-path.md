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

### Higher quality image dimensions agreed with Lex (2026-10-13)

Lex chose **Let Higher quality keep the full-size image** instead of limiting that image preset to 2,400 pixels wide. Higher quality uses gentler compression while retaining the source dimensions; it is a website version, distinct from optionally keeping an original. The question also proposed Smaller files at up to 1,600 pixels, Balanced at up to 2,400, and Smallest files (slower) using AVIF at up to 2,400; include those proposed preset mappings in the final policy confirmation. The agreed hard cap and automatic responsive copies still apply.

### Balanced audio quality agreed with Lex (2026-10-13)

Lex chose **Compact Balanced audio, about 0.7 MB per minute** for audio that needs shrinking, with richer sound available through Higher quality. Richer Balanced audio at about 1 MB per minute was offered as an alternative. Both choices were described as M4A output, with approximate sizes rather than guarantees. The researched build mapping for the compact choice is AAC-LC at 96 kbps stereo (about 0.72 MB per minute); include that mapping in the final policy confirmation. The boundary for retaining already-compressed audio and the remaining audio preset details still need to be settled.

### Already-compressed audio boundary agreed with Lex (2026-10-13)

Lex chose **Keep compressed audio below about 1.2 MB per minute** unchanged, to avoid losing quality for a small saving. The stricter alternative was keeping only compressed audio below about 0.7 MB per minute. The question covered already-compressed MP3/M4A and explicitly retained the 20 MB whole-file limit. The researched build mapping is MP3 or AAC below 160 kbps; include that precise boundary in the final policy confirmation. A file extension alone does not establish that audio is already compressed; lossless M4A is not covered by this exception. The agreed try-shrinking-first rule still applies to files over the hard cap.

### Explicit Speech audio choice agreed with Lex (2026-10-13)

Lex chose **Offer an explicit Speech choice for smaller voice recordings** as the audio smaller-file choice. It combines left and right sound into one channel (mono), at about 0.5 MB per minute. A general Smaller files choice preserving stereo was offered as an alternative. Balanced and Higher quality preserve stereo where present. Speech is applied only when explicitly selected; the editor never guesses that a recording is speech. The researched mapping is AAC-LC M4A at 64 kbps mono, to include in the final policy confirmation. Its interaction with the already-compressed-audio exception remains to be settled.

### Speech and already-small audio agreed with Lex (2026-10-13)

Lex chose **Always leave already-small recordings unchanged** when Speech is selected. Applying Speech even to already-small recordings was offered and recommended as an alternative; Lex chose retention instead. The already-compressed MP3/AAC boundary therefore takes precedence over Speech for files that fit the hard cap. Speech converts recordings that need shrinking; it does not guarantee that every added recording becomes mono or M4A. The agreed try-shrinking-first rule still applies when the whole file exceeds the hard cap.

### Higher quality video resolution agreed with Lex (2026-10-13)

Lex chose **Let Higher quality video keep its full resolution**, such as 4K, rather than limiting that preset to 1080p. Higher quality uses gentler compression; the same per-file hard cap still applies. The question proposed Smaller files at up to 720p and Balanced at up to 1080p; include those preset mappings in the final policy confirmation. This settles an adding setting, not playback or page markup.

### Transparency with optional AVIF agreed with Lex (2026-10-13)

Lex chose **Always use WebP or PNG for transparent images**, including when Smallest files (slower) is selected. Comparing AVIF with WebP and PNG for this explicitly selected setting was offered and recommended as an alternative; Lex chose the existing transparent-image exception instead. Transparency is preserved and the smaller eligible WebP or PNG result is used.

### Complete policy proposed for confirmation (2026-10-13)

**Pending Lex's final shared-understanding confirmation.** The ticket remains open. The comments above record individual answers; the exact build mappings and small connecting details explicitly labelled below are proposals until the complete policy is confirmed.

**Adding and settings.** Every media entry point uses the same preparation in the user's browser: Media, the compatible picker, Structure slots, component fields, Site settings, Files drops and canvas drops. Adding starts automatically, with a short progress summary and cancellation; optional settings are in More. Preserve the selected prototype's automatic adding into the viewed collection and the compatible picker's explicit Use step. Adding does not silently insert a file from the manager or picker. Keep simple choices, without an Advanced section. Balanced and Keep original off are the defaults. Remember changed choices, including Keep original, for this site and offer Reset to defaults; they affect future additions, not existing files. **Proposed connecting detail:** remember quality separately for images, video and audio, since AVIF and Speech apply only to their respective kinds. PDF/download bytes have no quality setting.

**Images.** Photos, screenshots and HEIC use Balanced WebP at up to 2,400 pixels wide by default. Automatically make responsive copies at 480, 960 and 1,600 pixels, only when smaller than the main image. Show the main image, copies and retained original as one Image family. Higher quality retains full source dimensions with gentler compression. Offer Smallest files (slower) using AVIF; it is not the default. Transparent images always retain transparency and use the smaller eligible WebP or PNG, even when the AVIF setting is selected. If preparing the main image makes it larger, keep the smaller suitable version, including JPEG/PNG where appropriate; compare only versions meeting the chosen dimensions and required personal-detail removal. Still make responsive copies. SVG stays SVG, with artwork preserved and executable content removed. Animated GIF becomes a silent looping H.264 MP4, treated as video rather than an image and limited to compatible placement targets.

**Video.** Balanced produces H.264 MP4 up to 1080p, retaining sound and generating a still preview. Higher quality retains full source resolution with gentler compression. The file cap still applies to full-resolution video. Background-video sound, page controls and placement are later decisions, not reasons to remove sound while adding an ordinary video.

**Audio.** Keep already-compressed MP3/AAC below 160 kbps unchanged when the whole file fits the hard cap (the agreed plain-language boundary is about 1.2 MB per minute). This takes precedence even when Speech is selected. Other audio needing shrinking becomes AAC-LC M4A. Balanced is approximately 0.7 MB per minute; Higher quality offers approximately 1 MB per minute. Balanced and Higher quality preserve the source's mono/stereo arrangement. Offer Speech in place of a general smaller-file audio choice: only an explicit selection permits combining stereo into mono, at approximately 0.5 MB per minute. Never infer speech from the contents. Lossless M4A is not covered merely because it has a `.m4a` extension. Try shrinking files over the hard cap before refusing them; if a result is still over the cap, stop. Duration-based size estimates are guides, not guarantees.

**PDFs and other downloads.** Keep the downloadable bytes unchanged. PDFs get a first-page preview. Preview generation does not modify the document. These files must also fit the hard cap.

**Originals.** Keep original is optional and initially off for all changed media. Store retained originals in `media/originals/`, even when the website version was dropped into a different Files folder. Make the original accessible through the file's details. An unchanged file needs no duplicate original. Retained originals have required hidden personal details removed, and retained SVGs have executable content removed; a kept original is not a promise of byte-identical archival storage. The source on the user's computer or phone is untouched. Originals stored in the site are publicly downloadable by address. If an optional original exceeds the cap but the website version fits, ask whether to continue without that original; never silently omit it or bypass the cap.

**Limits and failures.** The hard cap is the existing 20 MiB per stored output, labelled 20 MB in the conversation; a large incoming source can be processed first. Warn with a Large download note above 1 MB for images and 10 MB for video, audio and other downloads, while continuing to add outputs that fit. If preparation fails, ask before adding an unchanged file only when it is suitable for website use and within the cap. Otherwise give format/conversion advice. Required personal-detail removal and SVG executable-content removal cannot be silently bypassed; an undecodable HEIC cannot be presented as a usable website image.

**Storage and names.** Default website files go in `media/images/`, `media/videos/`, `media/audio/` and `media/downloads/`, based on the resulting kind (including video converted from GIF). A specific folder chosen by dropping in Files takes precedence for the website file. Collection membership is independent of physical storage. Keep recognisable incoming names, lowercase them, turn spaces/punctuation into hyphens, and update the extension to the actual output format. Add a number for conflicts and keep both; never replace an existing file. **Proposed connecting details:** collapse repeated hyphens, trim them at the ends, retain usable letters/numbers from other languages, and use `media` if no usable name remains. Use only the incoming basename, never incoming path segments. Keep responsive copies beside the main image with a width suffix, for example `holiday-480.webp`, and use a matching base for retained originals and generated previews. Choose an available base across every file in the family, including the originals folder, so a copy or original never overwrites an existing file.

**Exact preset mappings proposed for confirmation.** These are build instructions, not extra controls shown to Lex:

- Images: Smaller files = WebP quality 70, up to 1,600 pixels wide; Balanced = WebP quality 80, up to 2,400; Higher quality = WebP quality 90, retaining source dimensions; Smallest files (slower) = AVIF quality 50, encoding speed 8, up to 2,400. Transparent images compare WebP at the selected ordinary quality against lossless PNG; under the AVIF choice, use the Balanced WebP/PNG comparison. The smaller-eligible-main-image rule still applies, so a format setting does not guarantee that every main image has that extension.
- Video: Smaller files = H.264 MP4, fit within 1280 × 720 landscape or 720 × 1280 portrait; Balanced = fit within 1920 × 1080 landscape or 1080 × 1920 portrait; both use Mediabunny medium quality. Higher quality = Mediabunny high quality at source resolution. Preserve aspect ratio and use AAC 128 kbps for an existing audio track; never invent a sound track. Make a WebP still preview. These recipes are starting policy values, not promises about resulting bytes or processing time.
- Audio needing conversion: Balanced = AAC-LC 96 kbps; Higher quality = AAC-LC 128 kbps; both retain the source's mono/stereo arrangement. Speech = AAC-LC 64 kbps mono. The MP3/AAC retention boundary is strictly below 160 kbps; at or above it, preparation uses the selected recipe. Already-small retention takes precedence over all audio quality choices while within the hard cap.
- Never enlarge an image or video to reach a preset size. A non-animated GIF follows the ordinary still-image path. Responsive raster copies use the selected image recipe at their respective widths; SVG needs no raster responsive copies. Retained original extensions reflect the actual retained format after required sanitisation.
- Proposed warning units: use decimal 1,000,000 and 10,000,000 bytes for the 1 MB and 10 MB warning labels; retain the exact existing 20 MiB hard cap.

**Scope and build validation.** This resolves adding only. Existing-file renames and collection operations stay with [Decide how collections and file names behave](15-collections-and-file-names.md). Placement markup and choosing responsive copies stay with [Decide the responsive image output](08-responsive-image-output.md). Playback, embeds and document links stay with [Decide how video, audio and documents are handled](12-video-audio-and-documents.md). AVIF for fix-all is a separate decision. Existing files are not migrated to the new folders. After confirmation, add a scoped storage-policy pointer to ADR 0001 rather than treating its `images/` example as a migration requirement. Real Safari and real-phone processing/performance remain unverified build checks; preserve the research's HEIC decoder licensing/patent consideration for implementation validation. No editor implementation, push or deployment is authorised.
