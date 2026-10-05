# Moving and deleting site files that pages use

Renaming or moving an image, stylesheet or other non-page file in the Files
tab (rename, F2, drag, Move, or a folder holding pages and files) updates
everything that uses it in the same operation and Undo step
(`nativeAssetSnapshot`, `nativeAssetReferences`, `moveFileTarget`,
`moveFilesWithUrls` and `deleteFileTarget` in `src/main.ts`; helpers in
`src/page-builder/asset-references.ts`):

- pages and stylesheets: `src`, `href`, `srcset`, `poster`, image meta tags
  (`og:image`, `twitter:image`), inline `style` and CSS `url()`, found and
  rewritten with the image manager's matcher (`media-references.ts`);
- when pages move too, their link changes are planned first and the file
  references are rewritten on top of those texts, at each file's new path;
- the editor's page data (`.editor/page-builder.json`): literal paths in card
  templates, per-card overrides and page fields, through
  `planDocumentMediaBatch`, which also records rewritten JSON cards as the
  editor's output again; the cards are then rebuilt from the JSON by the
  collection operation.

External URLs (`https://…`), data URLs and fragments never change.

## What is read and pinned

Any move or delete that includes a non-page file reads every page and
stylesheet and the editor's page data, all of which must be loaded. That
snapshot, with the file list, generation and repository, is pinned until
the write: a delete checks it before its confirmation and holds it through
the dialog, so a reference or file added meanwhile (another tab, an agent)
refuses the delete. Moves and deletes of pages only are unchanged and read
nothing extra.

## Refused, with nothing changed

- deleting a file that a page, stylesheet or the page data still uses; the
  message names the files to fix first (deleting it together with the only
  pages that use it is allowed);
- a moving page or stylesheet whose relative path would point elsewhere
  after the move (relative paths in moved files are not rewritten);
- a page with a JSON card list moving together with files;
- any move or delete of a non-page file while the editor's page data is not
  valid: "The editor data (.editor/page-builder.json) is not valid, so it
  cannot be checked; nothing was moved/deleted."

## Not covered

Paths in JavaScript, in JSON files other than the editor's page data, in
`<object data>` or SVG `xlink:href`, and in other text formats are not
scanned: a move does not update them and a delete does not see them.
