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

Switching to Pages or Files keeps unfinished metadata fields. Repository changes mark a hidden Images pane for refresh when it is shown again. A refresh keeps the current detail form when its image, metadata and references are unchanged; changed references or image bytes retain unfinished metadata, while metadata Undo and Redo show the restored source values. A completed image operation and the host draft listener share an exact source revision so they do not reload the same revision twice.

The pane keeps its own vertical scrolling space for image details and actions. At narrow widths its controls and content stay within the tab panel, including when details are open.

Metadata Save and metadata Undo refresh the source values while returning focus to the same detail control. Changes to page references keep unfinished metadata and focus when the metadata source itself is unchanged. An in-progress image action marks its controls unavailable and explains a second attempted action; Cancel and Close remain available. Closing the explorer also defers repository refresh until it is opened again.
