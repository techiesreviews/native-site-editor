# The Media screen

Pages, Media and Files are persistent explorer tabs, in that order. Media opens
the Media manager in the explorer. The same view becomes the [Media picker](#the-picker)
when choosing a file for a place. The filename of this guide stays unchanged so
existing links hold. For preparation, markup, records and limits, see
[Media files](media.md); for usage and address changes, see [references](asset-references.md).
The [code map](../agents/code-map.md) points to the host controllers.

## Tiles and the One bar

The One bar holds Search, Collections and More in one row, including on phones.
Search combines with the collection and kind filters. More offers Add new file,
Adding settings, Clean up, Improve images, Recently removed, To check, Show kinds
and Grid/List. Collection management is available in Collections and in More
while viewing a collection. An empty result offers one way back at a time: all
kinds, all collections, then clearing the search.

Tiles show one Image family or other Media file. A picture fills the square
without changing the stored file. Video uses its still with a duration; audio
shows a sound picture and duration; PDF uses its first page and PDF mark; other
downloads show their type. Undrawable pictures get a type surface. A copied
Online video still belongs to its video, so it has no picture tile of its own.
Online videos show their service and recorded title.

Files appear newest first, using the per-file `added` record in .editor/media.json,
then the unsaved upload's time. Undated files follow by filename with numeric
ordering, then folder; Online videos come after files. Search and the picker keep
this order. The Files tab remains a name-ordered folder tree. New additions lead
the grid, scroll into view and briefly show a ring. Show new files clears filters
that hide them.

The usage badge is top left and selection top right, with separate 44 px targets.
The number counts distinct pages using any family member. A question mark means
Not checked yet. Zero can mean No uses found or Other uses found; hover or keyboard
focus explains which. Pressing the badge opens Pages and Other uses, with page
titles and paths, links to open them, and File details. An unread file is named
rather than called unused. New check results update badges and open usage lists.

Names show on mouse hover, keyboard focus or selection, and always on touch.
Touch taps do not leave hover backgrounds stuck on. Always keep and By agent marks
sit by the lower corner. Arrow keys follow the grid's actual columns. The browse
area has 3 columns, 4 from 520 px and 6 from 800 px; below 270 px it uses 2.
The Media explorer can widen up to 1040 px, within the viewport.

## Collections and selection

Collections group files without moving or copying them. A file can join several.
Selecting files reveals a selection bar with Add to collection, Take out of the
viewed collection, Remove files and Clear. Taking out only changes membership.
Select all shown is in its menu. Manage collections creates, renames and deletes
groups; deleting a group keeps the files. Names taken ignoring case refuse rather
than combine. A case-only rename is allowed.

When opening old sites without version-2 records, meaningful existing folders
seed starting collections. Generic storage names and date folders are skipped.
Opening alone writes nothing; the first real records change saves the groups.
New additions join the collection viewed when adding started, following its rename
if needed. A deleted collection falls back to All with a message.

## File details

A tile opens File details as its own screen, with Back at every width. From 680 px
of pane width, the complete preview sits beside the information; below that they
stack. The preview never enlarges beyond the file's own size. Video/audio can play
here; PDF shows its first page. Actions include Optimise for pictures, Copy path,
Remove file and eligible pictures' Replace everywhere.

The fields show filename, kind, size, Added date and time when known, dimensions,
folder and known duration. Expand Usage for Pages and Other uses. Copies and
original lists image members with their sizes and Download original; other families
list Files with it, including stills, sharing pictures and subtitles. A Trimmed
copy says which picture it was made from.

Collections use tick boxes and New collection. Description is separate from
Decorative: an empty description is Not described yet until explicitly Decorative.
Always keep protects the whole family from Clean up. By-agent words point to To
check. Cancel leaves fields unsaved; Save details writes name, fields, records and
following descriptions together as one Undo step. Taken names offer a numbered
suggestion; a rename keeps the file's folder and format. Keep the old address
working controls forwarding. See [Rename everywhere](asset-references.md#rename-everywhere).

Video details adds Still picture (Use this moment or Choose picture) and Subtitles
(Add, Replace, Remove). These actions apply everywhere immediately as their own
Undo steps. Online video details shows service, address, still and pages. In Media
it also offers Choose picture, Remove from Media, and Show Vimeo's own bar for
Vimeo. Removing the record leaves page placements; its copied still family goes
to Recently removed. A person's own chosen still stays.

To check lists agent descriptions, place words and subtitles. OK clears the review
mark. Edit saves the person's words and clears it. A newer agent change refuses
an approval of stale words. Clean up, Recently removed and Improve images each
have their own screen with Back; their rules are in [Media files](media.md).

## The picker

The picker uses the same One bar, files, collections, details and adding flow.
Its header names the place. Only suitable files show: pictures for image fields,
pictures and playable videos for page picture spots, and all kinds for Add → Media.
Only Add → Media also offers the YouTube/Vimeo address field and recorded Online
videos. Online videos cannot fill picture spots or section backgrounds.

A tile chooses one file; there is no bulk selection. The chosen preview and name
sit beside or above Cancel and Use image/video/audio/file. File details opens from
that choice and Back keeps it. Nothing is placed until Use. Files added there are
held ready; Use saves ready files and placement together. Cancel, Escape and Close
save ready files without placing. A repository switch discards held files. Review
is available for before/after preparation, but adding does not require it.

The picker is up to 960 px wide and full-screen below 580 px. It keeps focus inside;
closing returns focus to its caller. A nested picker closes without closing the
explorer. The persistent Media screen has no modal backdrop or focus trap.

## List view, phones and refresh

More → List shows selection, thumbnail, name, size, duration when known and usage.
Wide rows share aligned columns and keep names complete. Below 520 px each row
uses two lines: name with size, then the 44 px usage control. Long phone names
shorten in the middle, keeping the end and extension; the accessible name, tooltip
and File details retain the full name. Selection actions take their own row.

Switching tabs or closing the explorer preserves search, filters, choice and
unfinished detail fields. Refresh keeps fields and focus where possible; records
Undo/Redo restores saved source values. Busy mutations explain why controls wait.
Repository/branch changes dispose old views, observers and object URLs. Old controls
cannot mutate the newly opened site. Cancel can stop preparation; a committed
transaction is undone through Undo.

## Code entry points

`mountMediaLibrary`, `openMediaPicker` and `configureMediaPicker` in
`src/page-builder/media-picker.ts` mount the persistent screen, open a picker and
replace the adapter. A mounted screen returns its element, ready promise, refresh
and dispose methods. The host owns visibility and dimensions.

`src/page-builder/media-library-view.ts` composes the lazy screens. The shell,
grid, input, details, collections and refresh modules beside it own their parts.
`mediaLibraryTiles`, `mediaNewestFirst` and `filterMediaLibrary` in
`src/page-builder/media-library-filter.ts` hold family visibility, order and filters.
`src/page-builder/media-library-adding.ts` owns additions;
`src/page-builder/media-files-adding-runs.ts` serves Files adding.
`src/page-builder/media-library-details.ts` draws File details;
`src/page-builder/media-library-online.ts` draws Online video details.
Styles live in `src/page-builder/media-picker.css`.
