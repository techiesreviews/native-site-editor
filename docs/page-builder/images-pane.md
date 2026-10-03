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
