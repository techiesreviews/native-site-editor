# Images explorer pane

Pages, Files and Images are persistent explorer tabs. Images manages repository
images directly in the pane; it does not open a manager dialog. Arrow keys cycle
all three tabs, Home selects Pages, and End selects Images. The Site settings
button remains above the tabs.

Switching tabs or closing the explorer keeps image search, filters and details.
Draft changes, uploads, renames, deletion, Undo and Redo refresh the existing view,
including open metadata fields and asset revisions. Refresh requests coalesce and
wait for an active library operation to finish. Repository or branch changes
invalidate the old view, dispose its URLs and observers, and start a clean pane.

Choosing an image for a selected page image still uses the chooser modal, including
its upload and optimisation controls. Selecting writes native image markup as a
draft. The manager's saved query remains available when returning to Images.

The pane uses the explorer and shared media-library surfaces in both themes. Its
width follows the explorer; details replace browsing at small container widths.

In `src/page-builder/`, `media-library-view.ts` composes the view and owns its
state; each part gets what it needs as arguments and changes nothing of another's.
`media-library-shell.ts` builds the frame and controls, `media-library-fields.ts`
supplies the small control helpers, and `media-library-grid.ts` draws the tag chips,
summary and cards, loads thumbnails as they scroll into view and keeps browse focus.
Details, delete and Optimise share one side sheet, `media-library-sheet.ts`: its
version makes an earlier screen's callbacks stale. `media-library-details.ts` renders
the metadata form, the usage list, the file actions and the picker's insertion
preview; `media-library-delete.ts` asks before deleting and moves focus afterwards;
`media-library-optimise.ts` is the Optimise sheet, with its stored per-repository
settings and import requests in `media-library-optimise-rules.ts`; and
`media-library-input.ts` wires filters, arrow keys, the upload input and drops.
`media-busy-lock.ts` guards running changes, `media-byte-cache.ts` keeps decoded
bytes, `media-library-refresh.ts` keeps forms and focus through a refresh, and
`media-library-filter.ts` filters and sorts. Phase 1 can replace the shell and grid
while the sheet screens keep working.

Switching to Pages or Files keeps unfinished metadata fields. Repository changes mark a hidden Images pane for refresh when it is shown again. A refresh keeps the current detail form when its image, metadata and references are unchanged; changed references or image bytes retain unfinished metadata, while metadata Undo and Redo show the restored source values. A completed image operation and the host draft listener share an exact source revision so they do not reload the same revision twice.

The pane keeps its own vertical scrolling space for image details and actions. At narrow widths its controls and content stay within the tab panel, including when details are open.

Metadata Save and metadata Undo refresh the source values while returning focus to the same detail control. Changes to page references keep unfinished metadata and focus when the metadata source itself is unchanged. An in-progress image action marks its controls unavailable and explains a second attempted action; Cancel and Close remain available. Closing the explorer also defers repository refresh until it is opened again.
