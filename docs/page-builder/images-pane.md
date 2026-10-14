# Media explorer pane

Pages, Media and Files are persistent explorer tabs, in that order. Media (formerly
Images) manages repository images directly in the pane; it does not open a manager
dialog. Arrow keys cycle all three tabs, Home selects Pages, and End selects Files.
The Site settings button remains above the tabs. The pane's code and styles load
on demand the first time Media opens.

Switching tabs or closing the explorer keeps media search, filters and details.
Draft changes, uploads, renames, deletion, Undo and Redo refresh the existing view,
including open metadata fields and asset revisions. Refresh requests coalesce and
wait for an active library operation to finish. Repository or branch changes
invalidate the old view, dispose its URLs and observers, and start a clean pane.

Choosing an image for a selected page image still uses the chooser modal, including
its upload and optimisation controls. Selecting writes native image markup as a
draft. The manager's saved query remains available when returning to Media.

The pane uses the explorer and shared media-library surfaces in both themes. Its
width follows the explorer. File details is its own screen with Back at every width:
a large preview beside grouped information from 680 px of pane width, stacked below that.

In `src/page-builder/`, `media-library-view.ts` composes the view and owns its
state; each part gets what it needs as arguments and changes nothing of another's.
`media-library-shell.ts` builds the frame and controls, `media-library-fields.ts`
supplies the small control helpers, and `media-library-grid.ts` draws the
screen-reader count, one square tile per Image family or the no-results way back, loads thumbnails as they scroll into view and keeps browse focus.
Details, delete and Optimise share one side sheet, `media-library-sheet.ts`: its
version makes an earlier screen's callbacks stale. `media-library-details.ts` renders
File details (slice 14): the preview with Optimise, Copy path and Remove file; the name,
facts, usage and Image family (expand/collapse), collections (tick boxes and New collection),
Description with Decorative, Always keep, then Cancel and Save details; and the picker's
insertion preview. Its pure rules are in `media-file-details.ts`; usage sections, with
page titles from the host's `usage.pageLabel`, are shared with the usage window; `media-library-delete.ts` asks before deleting and moves focus afterwards;
`media-library-optimise.ts` is the Optimise sheet, with its stored per-repository
settings and import requests in `media-library-optimise-rules.ts`; and
`media-library-input.ts` wires search and Collections, arrow keys (by the grid's laid-out
columns), the upload input and drops. In the pane, dropped and chosen files start
adding at once (`media-library-adding.ts`): each is prepared on the Optimise path with
the stored settings while the grid stays usable, shows its progress on a tile of its
own with a cancel, and the ready ones are saved in one batch that also joins the
collection viewed at the drop (one Undo step). Its tray, "Files being added", keeps
the total, Cancel, files that could not be added with Review… (the Optimise sheet)
and Show new files; `media-adding-rules.ts` holds its pure rules. The Choose image
modal still opens the Optimise sheet for drops and uploads.
`media-busy-lock.ts` guards running changes, `media-byte-cache.ts` keeps decoded
bytes, `media-library-refresh.ts` keeps forms and focus through a refresh, and
`media-library-filter.ts` holds the pure rules: kinds, filtering and the no-results recovery. Phase 1 can replace the shell and grid
while the sheet screens keep working.

Switching to Pages or Files keeps unfinished metadata fields. Repository changes mark a hidden Media pane for refresh when it is shown again. A refresh keeps the current detail form when its image, metadata and references are unchanged; changed references or image bytes retain unfinished metadata, while metadata Undo and Redo show the restored source values. A completed image operation and the host draft listener share an exact source revision so they do not reload the same revision twice.

The pane keeps its own vertical scrolling space for image details and actions. At narrow widths its controls and content stay within the tab panel, including when details are open.

Metadata Save and metadata Undo refresh the source values while returning focus to the same detail control. Changes to page references keep unfinished metadata and focus when the metadata source itself is unchanged. An in-progress image action marks its controls unavailable and explains a second attempted action; Cancel and Close remain available. Closing the explorer also defers repository refresh until it is opened again.
