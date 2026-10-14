---
title: Every kind in Media
type: task (AFK)
status: closed
assignee: claude (mm-59 runner)
blocked_by: [57-video-preparation, 58-audio-and-document-preparation, 12-usage-badges-and-list]
builder: claude
phase: 5
---

## What

Ticket [12](../../tickets/12-video-audio-and-documents.md#resolution-2026-10-13) "In the editor"; ticket [06](../../tickets/06-prototype-media-manager-look.md#resolution-2026-10-12).

- Video tiles show the still picture and length; audio tiles a sound picture and length; PDF tiles the first page; other downloads a file-type picture.
- The kinds in More (Video, Audio, Documents) now find them; details show the right preview (playable in details).
- Families include the video's still and subtitles.

## Done when

- Nightly in `native-media-screen.spec.ts`: a video, an audio file and a PDF show their tiles and lengths; kinds narrow to each.

## Done (2026-10-15)

- **Behaviour.**
  - **Media lists every kind.** The Media screen's listing uses the agents' media rule (`isMediaLibraryPath`, moved from `agent-media.ts`, which re-exports it as `isAgentMediaPath`): pictures, video, audio, PDFs and other downloads; never pages, styles, scripts, fonts, source or config files (`.jsonc`, `.cjs`, `.sh`, `.scss`… added to the exclusions, so the actual starter's `wrangler.jsonc` stays out) or the editor's own files. Pickers still narrow by `accept` (image spots list pictures only). Media's kinds use the same classifier as agents (`shared/agent` `mediaKind`; anything else is a download), so MPEG is Video and AIFF Audio; MPEG now goes through video preparation (so it gets the same "can't prepare" advice instead of being stored unplayable).
  - **Tiles (ticket 12 "In the editor", ticket 06).** A video shows its still picture and its length in the corner (`0:13`); audio a sound picture (Phosphor waveform) with its type and length on a clean surface with dark text; a PDF its first page with a small `PDF` mark; other downloads a type picture (PDF, zip, document, sheet, slides, subtitles, else file) with the type. A video or PDF tile loads only its still, never the file. Lengths count whole seconds as the browser's player does. The thumbnail's name includes the length for screen readers. In List the length follows the size. Type pictures are CSS masks in the lazy Media stylesheet (not `icons.ts`, which is boot).
  - **Lengths** are recorded when a file is added: `files[path].duration` (seconds, 2 decimals) for prepared videos, GIF loops and audio. Kept MP3/AAC now return their unchanged bytes as the result, carrying the length (as PDFs already did). Read leniently (`mediaMetadataView`): a wrong value is left out, never a reason to refuse the records. Files added outside the editor, or videos added as they are, show no length.
  - **Details.** A video plays in File details from its still (`<video controls preload="metadata">`, the still as poster); audio plays under its sound picture; a PDF shows its first page. Facts gain **Length**. A video's or PDF's family rows are listed under **Files with it** ("Still picture", "First page picture", "Subtitles"); images keep "Copies and original".
  - **Families (lead follow-up 1).** `MediaFamily` gains `still` and `subtitles`, and `familyMembers()` is the one list of a family's files, used by rename, Files delete/restore, Media remove, Recently removed, usage, Clean up, collections, storage reservations and the agents' `list_media` (`family.still`/`family.subtitles`). Path-based like copies: a lone picture beside a video or PDF with the exact same name is its still; `.vtt`/`.srt` beside a video or audio file with the exact same name are its subtitles; with two possible owners or two pictures, neither joins. `chooseMediaPath` already keeps those names free, so editor-made files never collide. Renaming a video takes its still and subtitles to the new name (records follow); Files' Delete names them ("Its still picture and subtitles file are deleted with it.") and keeps every member for Restore; Clean up never suggests a still or subtitles alone, and a use or Always keep on any member keeps the family. Subtitles count as media in the on-open usage check.
  - **File chooser (follow-up 2).** Media's **Add new file** takes any file, as drops do (label "Add files"); a picker's chooser takes what the picker accepts (pictures still include HEIC), so the background-video picker now offers videos.
  - **Keep original for video (follow-up 3): not implemented**, judged not small: stripping a phone video's location data needs a lossless remux, and most phone videos are over the 20 MB cap, so it would mostly ask "Add without the original?". Stays with slice 27 / ticket 07 "Originals".
  - **Usage popup on tiles with no picture (follow-up 4): applied.** Slice 12's light popup (panel surface, dark text) now wins its specificity, so tiles with no picture keep ticket 06's clean surface; picture tiles keep the dark popup. Chosen over deleting it because audio and download tiles are now common and the rule matches ticket 06.
  - Agents: `list_media`'s description and `docs/mcp.md` mention the still and subtitles. The conventions' Media chapter is unchanged (it must match the starter's AGENTS.md).
- **Commits.** 6ffc90c0 claim; 53842add build; bc1a3ff0 lengths as the player counts them, spec and workspace tests; 1fc17c1d review round 1 fixes; 02ffce22 review round 2 fixes; this close.
- **Tests.** Unit: `media-families` (stills and subtitles by exact name, one owner, lone picture, rename, Always keep), `media-library-filter` (listing rule, length format, each kind's tile look, kinds narrow, MPEG/AIFF), `media-file-details` (Length fact, family rows, lenient length), `media-clean-up` (family suggested whole, still use and Always keep protect, subtitles-only use protects), `media-workspace` (rename and remove of a video take its still and subtitles, records follow, one Undo), `file-operations-controller` (Files delete names and keeps still and unsaved subtitles for Restore), `audio-prepare` (kept bytes carry their length), `media-prepare` (length recorded), `media-names`, `agent-media`. Nightly in `native-media-screen.spec.ts`: a real MP4, MP3, PDF and zip added with Add new file show their tiles and lengths, the still and first page are no tiles, Video/Audio/Documents/Images narrow to each, the light popup on a download, the chooser takes any file, details play video (still as poster, Length, Files with it) and audio. Ran: `npm run check`, `npm run lint`, unit 2,974/2,974; media, upload, Files, fades, MCP media, asset references, alt refusal, image popup specs 181/182 (the failure, `native-file-ops:164` keyboard delete of `note.html`, fails 1 in 4 on untouched origin/dev too: worth a `known-failures.json` entry); after fixes upload, adding, screen, tab, Files, clean-up 87/87 and Files, clean-up, screen, rename 39/39; screen and tab 46/46 with CI fonts. Scratch screenshots at 390 (touch), 768, 1280: grid, list, usage popup on a download, video, audio and PDF details, in the main checkout's `.scratch/shots/mm-59/`.
- **Review (GPT-6.1 Sol, read-only), 2 rounds.** Evidence: main checkout `.scratch/reviews/mm-59/round-{1,2}/` (run.log: model gpt-6.1-sol, sandbox read-only; result.md `REVIEW_STATUS: complete`). Round 1, fixed 2 P2: Files' removal records left subtitles out, so Recently removed could not bring them back; MPEG/AIFF were Documents in Media while agents called them video/audio. Round 2, fixed 2 P2: MKV/AVI/MPEG/AIFF were not renamable media, so their families lost records on delete or rename; the on-open usage check left subtitles out, so a subtitles-only use or Always keep did not protect the family. Their suggested tests added (Files delete with unsaved subtitles; subtitles-only use and Always keep; MPEG/AIFF kinds and ownership). Nothing rejected; no third round (the brief allows one re-review).
- **Bytes.** Same-sitting `build:ui` + `test:budget` against origin/dev: 348 → 348 KB gzip before first preview paint (budget 355 KB). Boot entry JS 240,127 → 240,188 B gzip (+61 B: the family rule and wording the Files tab uses), CSS unchanged. Lazy Media chunk JS 20,539 → 21,042 B, CSS 7,888 → 9,498 B gzip (type pictures as masks).
- **Follow-ups.**
  - Slice 66: name subtitles `<video name>.vtt` beside the video (the family rule is the exact name; `name.en.vtt` would stay its own file); a chosen still from Media stays its own file.
  - Slice 69: the conventions' Media chapter (and the starter's AGENTS.md) can say a video's still and subtitles belong to its family.
  - Slice 63: picture-spot pickers can list looping videos now that Media lists videos; tiles show their stills.
  - Keep original for video and audio (slice 27 / ticket 07), see above.
  - On phones the length takes room from a tile's name, so long names shorten more.
  - `native-file-ops:164` flaky on dev (see Tests).
