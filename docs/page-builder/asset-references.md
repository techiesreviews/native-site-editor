# Moving and deleting site files that pages use

Renaming or moving an image, stylesheet or other non-page file in the Files
tab (rename, F2, drag, Move) updates everything that uses it in the same
operation and Undo step (`moveFileTarget` and `nativeAssetReferences` in
`src/main.ts`, helpers in `src/page-builder/asset-references.ts`):

- pages and stylesheets: `src`, `href`, `srcset`, `poster`, image meta tags
  (`og:image`, `twitter:image`), inline `style` and CSS `url()`, found and
  rewritten with the image manager's matcher (`media-references.ts`);
- the editor's page data (`.editor/page-builder.json`): literal paths in card
  templates, per-card overrides and page fields, through
  `planDocumentMediaBatch`, which also records rewritten JSON cards as the
  editor's output again;
- the cards themselves are then rebuilt from the JSON by the collection
  operation, so literal cards and the recipe stay in step.

External URLs (`https://…`), data URLs and fragments never change. Every
page and stylesheet read, the page data file and the file list are pinned:
if any of them changes before the operation is applied, it is refused. A
move that nothing uses reads nothing else and is applied as before.

Refused, with nothing changed:

- a moving stylesheet that uses relative paths (they would need rebasing),
  and a moving file that uses another file moving with it (move them one at
  a time);
- deleting a file that a page, stylesheet or the page data still uses. The
  message names the files to fix first. Deleting a file together with the
  only pages that use it is allowed.

Page moves are not handled here: page links follow Change URL. Paths in
JavaScript, JSON other than the editor's page data, or other text formats
are not scanned.
