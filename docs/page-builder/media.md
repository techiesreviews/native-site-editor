# Media files

The Media manager finds, adds, prepares, places and tidies the site's Media files.
It writes ordinary site files and unsaved drafts. Save to GitHub saves them; Undo
restores each completed change. The [Media screen](images-pane.md) and
[media tools](../mcp.md#media-tools) use the same operations. Start code navigation
with the [code map](../agents/code-map.md).

## Adding files

Every adding route uses `prepareMediaFile` in `src/page-builder/media-prepare.ts`:
Media drops and More → Add new file; Files drops and Upload files; the Media picker;
canvas image drops; Structure and component image fields; and Site settings image
fields. Preparation runs in the browser before storage. A failed file does not stop
the other files. The shared progress summary in `src/page-builder/media-adding-summary.ts`
shows waiting, preparation, adding, failures, large-download notes, Cancel and Retry.
Review opens a before/after Optimise screen; it is an optional route, not a required step.

Media adds automatically, into the collection viewed when adding started. Files uses
the chosen folder, including the repository root. The picker holds ready files until
Use, then saves them with placement in one change. Cancel or Close saves ready files
without placing them; switching repositories drops held files. Site settings fills
its field after adding; Apply saves the settings later.

New files normally go into media/images, media/videos, media/audio or media/downloads,
according to the stored kind. Files' chosen folder wins. Existing files stay where
they are. `chooseMediaPath` in `src/page-builder/media-storage.ts` reserves the whole
family. Names become lowercase, with punctuation replaced by hyphens; letters and
numbers in any language remain. Taken names get a number. Adding never replaces an
existing file.

### Adding settings and limits

More → Adding settings remembers choices per site. Each choice saves immediately as
one Undo step. `mediaAddingSettings` in `src/page-builder/media-settings.ts` supplies
Balanced defaults, with Keep original off. Reset restores these defaults. Choices
apply to future additions; they do not re-prepare existing files.

| Images | Recipe |
| --- | --- |
| Smaller files | WebP quality 70, up to 1,600 px wide |
| Balanced | WebP quality 80, up to 2,400 px wide |
| Higher quality | WebP quality 90, full size |
| Smallest files (slower) | AVIF quality 50, up to 2,400 px wide |

Pictures are never enlarged. Transparent pictures use the smaller of WebP and
lossless PNG; the AVIF choice uses the Balanced comparison for transparency.
A smaller, upright source can stay in its format after personal details are removed.
Responsive copies use the main's resulting format and are kept only when smaller
in bytes than the main. The worker in `src/page-builder/image-optimise.worker.ts`
loads WebP/AVIF encoders only when needed; failed AVIF falls back to Balanced WebP
with a note. PNG gets a lossless squeeze. SVG stays SVG with executable content
removed; styled artwork is preserved where possible. Animated PNG/WebP keep their
frames with personal details removed. Animated GIFs follow video preparation.

`src/page-builder/media-limits.ts` caps each stored output at 20,971,520 bytes
(labelled 20 MB). A larger source may be prepared below that limit first. Notes
appear above 1,000,000 bytes for an image and 10,000,000 for other downloads.
Adding settings also shows GitHub's repository size, with warnings from 500 MB and
900 MB against the 1 GB Pages limit. Removing files does not shrink Git history.

Failed preparation offers **Add unchanged?** only for a suitable file within the
cap, with no required picture clean-up bypassed. Otherwise it gives conversion
advice. A picture must also display in the browser. Safari uses its own HEIC reader.
Chrome and Firefox have no added HEIC reader: `heicFailureMessage` in
`src/page-builder/media-heic.ts` asks the person to save as JPEG and add again.
The decoder branch build/mm-29-heic-decoder remains parked, not landed (Lex,
2026-10-15). Keep original does not bypass that rule.

### Keep original

For a changed picture, Keep original can retain a full-size, upright original with
personal details removed, under media/originals. It is not a copy of camera metadata.
`src/page-builder/media-originals.ts` validates it and avoids duplicating the main.
If only the original exceeds the cap, **Add without the original?** can keep the
website version. File details offers Download original. Video, audio, PDFs and
unchanged files do not gain a kept original.

## Image families and records

`mediaFamilies` and `familyMembers` in `src/page-builder/media-families.ts` group the
main, Responsive copies and retained original. New copies use -480, -960 and -1600
before the extension, only below the main's width. Older -480w names, WordPress
width-by-height names and unambiguous sets in another format are recognised too.
A numbered filename alone does not imply a copy. Ambiguous members stay separate.
A Trimmed copy is its own Image family. An AVIF/WebP main can also own a
-sharing.jpg picture for sharing services. A -social.jpg Trimmed copy stays separate.

Video and PDF families can own a same-stem still; video/audio can own subtitles.
A copied Online video still and its Image family belong to the recorded video and
have no separate tile. A person's own picture chosen as a still stays independent.
Rename, removal, restore, usage and Always keep consider file families together.
For a recorded Online video, Media removal/restoration includes its copied still
family. Files-tab rename/delete of that still still treats it as a picture; it
does not act on the Online video record.

`shared/media-records.ts` reads and writes the editor-only .editor/media.json file.
It migrates old tags and alt fields, preserves unknown fields, and refuses malformed
or newer-version records rather than overwriting them. The version-2 shape is:

| Location | Stored information |
| --- | --- |
| `version`, `collections`, `files` | Version 2, collection names, file records keyed by repository path |
| `added`, `duration` | Per-file ISO adding time and known video/audio duration in seconds |
| `description`, `decorative`, `alwaysKeep`, `places` | File words and by-agent mark; Decorative; Always keep; page-specific Decorative and agent words |
| `trimmedFrom`, `sharing`, `lighterFrom`, `fromGif` | Trim source and geometry; sharing copy; lighter-file source; GIF origin |
| `still`, `subtitles`, `subtitlesByAgent` | Related file paths and subtitle review mark |
| `onlineVideos` | Service, id, title, still, optional Vimeo hash, service-bar choice and copied-still mark |
| `removed` | Removal date, saved blob SHA or browser-copy key, family and former records |
| `adding`, `leftAsIs` | Preparation choices; pictures unticked in Improve images |

File records store description as text plus byAgent, and places keyed by page path
with decorative and agentText. Online video records store service, id, title, still,
hash, serviceBar and stillCopied. Each removed entry stores path, date, exactly one
of sha/browserKey, optional family members, former file records and an optional
onlineVideo record.

Adding, Replace everywhere and trimming record Added. One addition shares one time.
Optimise's lighter version keeps the original date. Media lists dated files newest
first; undated files follow by name, then folder. Online videos follow files.

## Pictures placed on pages

`placeMediaImage` in `src/page-builder/media-place.ts` serves the picker and agents.
`mediaImageForPlacement` in `src/page-builder/media-markup.ts` builds the image data;
`src/page-builder/media-page-markup.ts` applies measured page edits. Placing writes
an ordinary `<img>` with intrinsic `width` and `height`, `decoding="async"`, and
`srcset` containing smaller copies followed by the main's real width. No copies
means no `srcset` or `sizes`. Kept originals never enter `srcset`.

A hidden preview copy measures the place at phone, tablet and computer widths and
around site breakpoints. `src/page-builder/image-sizes.ts` turns this into `sizes`.
The visible canvas never resizes. First-screen pictures are eager (no `loading` or
`auto`); the first large one in document order gets `fetchpriority="high"`.
Other placed pictures are lazy with `auto, ` before their measured size hint.
First screen means 390 × 844 or 1280 × 800; large means at least 50,000 CSS px².
Failed measurement uses lazy loading and `sizes="auto, 100vw"`. Add → Media uses
that fallback because its new place has no painted element yet.

A move re-measures through `src/page-builder/media-move-recheck.ts` and joins the
move's Undo step. A newer edit, Undo, page change or timeout cancels the re-check.
Shape changes re-measure before saving. Existing raster pictures without copies
can gain missing copies on placement, without changing the main file; failures
place the full-size picture with a note.

Replacing an image inside `<picture>` removes the wrapper and its `<source>` tags.
The image keeps its attributes and inherits a wrapper slot if needed. If the
sources had screen-specific pictures, the notice says the new picture is now used
on all screens. `mediaPictureUnwrap` in `src/page-builder/media-markup.ts` shares
this rule with Replace everywhere.

Descriptions follow the file unless the place has its own words or is Decorative.
An undescribed page picture gets empty alt without a Decorative mark and warns
Not described yet. Legacy filename words also count as undescribed. File description
changes reach following places in the same change. Per-place marks are per file
and page, so two uses there share the mark. Agent descriptions and subtitles wait
in To check until the person approves or edits them; see `src/page-builder/media-descriptions.ts`.

## Image popup and Social image

The edit bar's Image button opens `src/page-builder/image-popup.ts`. Shape and
Focus point change only that place. Original shows the whole picture; Square,
4:3, 16:9 and Tall 4:5 fill a frame. A shaped component offers its own shape first.
Original overrides that component to show the whole picture; choosing the component's
shape removes the place's override. Shape and focus write only the relevant inline
styles through `src/page-builder/place-frame.ts`; they create no file.

Focus point can be dragged, pressed or moved with arrow keys. Raster pictures in
the site also offer Free, Zoom and Turn. Done makes a Trimmed copy from the full
original, with Responsive copies and a fresh -crop name, for this place only.
Reopening restores the trim on the original. A superseded unused copy goes to
Recently removed; a used or Always keep copy stays. Replace keeps the shape and
centres focus. Cancel, Escape or an outside press discards the popup's changes.
Phone and Computer previews show the result before Done.

Open large editor loads `src/page-builder/image-large-editor.ts`: dragging, wheel
zoom, frame handles, straighten, turn, flip, Reset and local Undo/Redo. Cancel
returns to the popup's earlier state; Done saves and closes both. On phones it
fills the screen with compact tools and a Preview sheet. The small popup is a
bottom sheet with touch-sized controls and a shape menu that stays clear of its footer.
SVGs, outside pictures and component-template fallback pictures do not get raster
trim tools. The core trim transaction is `trimPlace` in `src/page-builder/place-trim.ts`.

Page settings' Social image and Site settings' Default social image use
`src/page-builder/social-image-popup.ts`. It fixes the frame to the 1200 × 630 sharing
shape, with focus, zoom, Replace and a link-card preview. Done stages the frame; settings'
Apply saves a fresh -social.jpg sharing copy and its links in one change. The JPEG
is never enlarged and puts transparency on white. It uses a full Site address;
without one the editor writes a root link and warns sharing services may not show
it. Animated pictures ask for a still picture. Unchanged sharing copies are reused.

## Clean up and Recently removed

More → Clean up opens a review, grouped as Nothing uses these, Trimmed copies
nothing uses, and Copies whose main image is gone. Choose files, Review removal,
then confirm. `mediaCleanUpSuggestions` in `src/page-builder/media-clean-up.ts`
requires a complete [site-wide use check](asset-references.md). Unknown or unreadable
text blocks removal suggestions. A use of any family member protects the family.
Always keep on any member also protects it. Kept originals without a main and
copied stills belonging to recorded Online videos are never suggested alone.

Removal re-checks uses and Always keep, then removes whole families in one change.
The review offers Undo. File details' Remove file can also remove used files after
warning which pages will break; agent removal refuses used or Always keep files.
The Files tab's delete keeps its stricter in-use check.

More → Recently removed lists the last 30 days, newest first, with Restore.
`src/page-builder/recently-removed.ts` stores committed bytes by Git blob SHA;
unsaved or edited bytes use IndexedDB browser copies. Those copies work only in
that browser. Restore brings back the whole family at the same addresses with its
records, even after saving. A taken address or missing browser copy refuses.
Expired entries leave the list. Removal does not erase Git history.

The Media tab and explorer button show a badge counting files to clean up plus
pages/components with images to improve. Dismiss remembers the current suggestions
per repository and branch; new suggestions bring it back. Counts wait for checks;
a zero page count alone is not proof that a file is unused.

## Video, audio, Online videos and downloads

`src/page-builder/video-prepare.ts` makes H.264 MP4 and a WebP still, with the video's
rotation applied and no copied metadata. Smaller fits 720p, Balanced 1080p, Higher
quality keeps size; none enlarges. Animated GIFs become silent Looping videos.
Sound becomes AAC 128 kbit/s where supported; existing AAC can pass through when
encoding is unavailable. Sound is never silently dropped.

`src/page-builder/audio-prepare.worker.ts` makes AAC-LC M4A: Balanced 96 kbit/s,
Higher quality 128 kbit/s, Speech 64 kbit/s mono. Already compressed MP3/AAC below
160 kbit/s can keep their bytes regardless of the setting. Firefox and Chromium
on Linux have no AAC encoder. There is no @mediabunny/aac-encoder fallback (Lex,
2026-10-15): unsuitable conversion falls through to Add unchanged? for suitable
files within the cap, or advice to export a supported format. Browsers without
video encoding can retain suitable videos with a note.

`src/page-builder/player-markup.ts` writes native video/audio and download cards,
and installs the site's player once. `writePlayerFiles` writes missing player
scripts and stylesheet as text, never binary uploads, on every placement and
Improve images path. Existing player files are kept. `readStyleFiles` in
`src/native-style-files.ts` asks for each stylesheet once per pass and skips
textless drafts, so a bad draft cannot cause a preview reload loop.

The site's ordinary video player starts from its still on tap. Its bar has play,
timeline, time, sound, subtitles, speed, picture-in-picture where supported and
full screen. Audio has play, timeline, time and a transcript from subtitles.
Browser controls remain the fallback. Looping video plays silently while visible,
with a corner pause/play button; reduced motion starts paused. Section background
video also holds its still for reduced motion or save-data. Picture spots accept
only silent Looping video. The player starts it; markup never needs autoplay.
A corner button inside a link toggles without following the link; the picture and
link text still navigate.

File details can choose a video's still from a moment or another Media picture,
and add, replace or remove subtitles everywhere. SubRip becomes WebVTT beside the
video/audio file. Changes update all placements in one Undo step. The editing
preview stays still; the edit bar's Play/Stop temporarily checks playback without
writing the page. Online playback uses an overlay outside the sandbox.

Add → Media accepts YouTube or Vimeo addresses. `src/page-builder/online-video-add.ts`
reads title and still once in the browser, prepares a local still and records the
video. Blocked stills leave a titled link asking for the person's own picture.
Recorded videos can be reused without another service request. The site's link
shows its local still and contacts the service only on play. The shared bar falls
back to the service's own player on failure; Vimeo details can request its own bar.
Online videos have no picture-in-picture; YouTube has no shared-bar CC button.

PDFs stay unchanged and can gain a first-page WebP preview. A failed preview does
not stop adding. PDF cards Open; other download cards Download. Video/PDF tiles
load their still, not the full file.

## Improve images

More → Improve images lists one row per page or component, with what would change,
individual ticks, Fix and Fix all. `improveImagesPlan` in
`src/page-builder/improve-images.ts` scans; `src/page-builder/improve-images-run.ts`
combines engines into one change per row. Completed rows stay done on Cancel.
Component rows cannot be measured in the page preview and use the safe loading
fallback.
Undo per row and Undo all are available; a page edited since refuses restoration.
Unticked pictures are remembered in the records.

It makes lighter files and missing copies, adds size/loading details, converts GIFs
to Looping videos, brings readable outside pictures into the site, and replaces
old YouTube/Vimeo players with Online videos. Links around pictures stay. Script
pictures, sample code, structured data, template fallbacks and CSS backgrounds are
left alone; descriptions are not part of this action. Outside reads can fail as
website gone or not allowed; Use my own copy supplies a local file instead.
Agents run the same work but leave outside pictures and old service players for
the person.

Old heavy files stay unchanged for Clean up once unused. Existing copy sets are
adopted. AVIF/WebP replacements in sharing tags get a family -sharing.jpg at a
full address, with matching type and size details; if that JPEG is not lighter,
Improve images keeps the old sharing picture and reports it. Replace everywhere
uses the same JPEG writer, with its own [replacement rules](asset-references.md#replace-everywhere).

## Sub-folder sites and transactions

Site settings → General → Site address stores the public address in .editor/config.json.
Its path gives the prefix for every written media address, page link, Change URL
forwarding line, component loader and stylesheet link. The canvas reads prefixed
and plain root links. Changing the folder rewrites supported site addresses in
one guarded settings change; a host-only change with the same folder does not
trigger that rewrite. See [address rewriting](asset-references.md#site-address-prefix)
and [ADR 0001](../adr/0001-the-repository-is-the-site.md).

GitHub Pages project sites are supported. Applying a changed project-site address
adds an empty .nojekyll when missing. GitHub Pages ignores _redirects; Keep the old
address working warns about that limit.

`createMediaWorkspace` in `src/page-builder/media-workspace.ts` prepares a
`MediaWorkspaceBatch`; `applyMediaBatch` in `src/media-batch.ts` connects it to the
host. Batches prove scope, file list, source text and binary revisions before
committing files, records and references together. Newer edits refuse the whole
change. One batch is one Undo step. With no editable file open, file-only media
changes keep their Undo until a file opens; rewriting page text still requires an
open page. Upload bytes needed by Undo are held until that history step is released.
