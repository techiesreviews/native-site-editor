# Media uses and address changes

The Media manager checks site text before reporting a Media file unused. The same
knowledge supports Rename everywhere, Replace everywhere and guarded file deletion.
See [Media files](media.md) for families, storage and limits, [the Media screen](images-pane.md)
for controls, and [the code map](../agents/code-map.md) for controller entry points.

## What the use check reads

`mediaUsageRecords` in `src/page-builder/media-usage.ts` combines structured page
uses with the wide text search in `src/page-builder/media-mentions.ts`.
`isMediaTextFile` includes site text of every kind, including SVG, scripts, JSON,
XML feeds and sitemaps, Markdown, notes, settings, _headers and _redirects. It skips
known binary formats, node_modules, .git and .editor/media.json. A pending or
unreadable text leaves families Not checked yet. It never means No uses found.

The structured scanner, `scanMediaReferences` in `src/page-builder/media-references.ts`,
reads HTML addresses and CSS: source, link, poster and sharing-image attributes;
`srcset`, `data-src`, `data-srcset`, `imagesrcset`; object data and SVG link attributes;
inline styles, stylesheet URLs, imports and image sets. It decodes HTML entities
and CSS escapes. The page walk follows linked/imported stylesheets and nested
components, including their paired stylesheets, visiting cycles once. Component
relative addresses are resolved for the page using the component. A link to another
page does not make that page's pictures uses of the linking page.

The wide search also counts inline scripts, JSON-LD, comments and sample code.
It recognises escaped JSON slashes, encoded paths, query/fragment suffixes and
bare filenames with boundaries. A bare name conservatively counts for each file
with that name. Full addresses count only for the site's own host, from Site
settings and root CNAME, ignoring scheme and www. With no known host, full
addresses count conservatively. On a sub-folder site, full addresses outside its
folder belong to another site and stay outside the check.

A family has distinct Pages and Other uses. Other uses name the file and kind,
including scripts, data, feeds, notes, settings, sharing, stylesheets and components.
Zero pages alone is not unused. Clean up requires the whole check complete and no
uses of any member. Addresses assembled by scripts and outside links cannot all
be discovered; mark such files Always keep.

`src/controllers/media-usage-controller.ts` starts the check after the text index,
reads remaining text in batches and publishes progress. Draft edits restart it
after a short pause; repository, branch and revision changes invalidate old results.
Every destructive change reads and proves its own snapshot again before writing.

## Rename everywhere

Changing File name in File details, a media rename/move in Files, and the agent's
`move_file` use `planMediaRename` in `src/page-builder/media-rename.ts`. All Image
family members move together, including Responsive copies, originals, sharing
pictures, stills and subtitles where applicable. Records and references follow in
one Undo step. Trimmed copies keep their names; their source record follows.

Every unambiguous mention the use scanner counts is rewritten in site text, not
just HTML/CSS: scripts, data, feeds, SVG, comments and notes included. Each mention
keeps its encoding, query and fragment. Ambiguous bare names and path endings stay
unchanged. Full addresses change only on the site's own host and within its folder.
_redirects destinations follow; sources keep their old addresses.

Names are tidied as at adding. Same-folder renames keep folder and format. Any
family destination taken by another file refuses the whole operation with a
numbered suggestion; no file is replaced. File details can save a rename and its
metadata together. A changed source, file list or binary revision refuses the
whole change. Media operations rewriting page text require an open page.

## Keep the old address working

Rename and format-changing Replace everywhere can write forwarding lines for the
old main and its copies. The checkbox defaults on when any family member is
Always keep; an explicit choice overrides it. `editNativeRedirects` in
`src/native-page-moves.ts` keeps chain, loop and duplicate rules. Existing destinations
follow a rename, but sources remain old addresses. New lines include the Site
address prefix. Hosts such as Cloudflare Pages and Netlify read _redirects;
GitHub Pages ignores it, and the editor warns that old links will stop working.

## Replace everywhere

`planMediaReplace` in `src/page-builder/replace-everywhere.ts` prepares the change;
`createMediaWorkspace` in `src/page-builder/media-workspace.ts` proves and applies it.
File details or `replace_media` chooses another still raster picture already in
Media, or the person adds one in the picker. The site's Adding settings prepare it
again. The chosen Media file stays independent. Choosing the old family itself,
an outside file, SVG or a Trimmed copy as the target refuses.

The old main's folder and base name stay. A new format changes the extension.
The new family replaces corresponding addresses; obsolete copies and originals
leave with the old family. The old picture and records go to Recently removed,
even where the replacement now occupies their address. Restore then refuses until
that address is free. New bytes, records and all rewritten mentions form one change.

Every rewritten mention receives a new-version query value: the first eight hex
digits of the file's Git blob SHA. Other query values and fragments stay. Missing
copy entries leave `srcset`; other references to a vanished copy use the new main.
No extra copy entries are inserted into existing sets. _redirects sources and
_headers are left alone. Format changes can forward old addresses when requested.

Page shapes stay, with focus centred. Places showing a Trimmed copy switch to the
new picture while keeping the trim's frame proportions. Unused, unkept old trimmed
families also go to Recently removed. Replaced `<picture>` wrappers are removed
as described in [placed-image markup](media.md#pictures-placed-on-pages).

For AVIF/WebP, sharing tags that mentioned the old family use a fresh family JPEG
at the new main's size, including tags pointing to an old Social image. The helper
`encodeSharingJpeg` in `src/page-builder/sharing-jpeg.ts` uses a kept original when
available, otherwise the new main, with transparency on white. Sharing type and
size details follow. Same-name replacement writes over its old sharing JPEG;
ambiguous or taken sharing names refuse. JPEG/PNG replacements use their main
without an extra JPEG. Sharing addresses use the full Site address, or a root
link plus a warning when none is known.

## Files operations

Media files use the wide rename plan. Other non-page files use
`planAssetReferenceRewrites` in `src/page-builder/asset-references.ts` for structured
HTML/CSS references. File/folder moves involving pages plan page links first, then
file references over those texts at their new paths. A move refuses if a moved
file's relative references would change meaning without being rewritten.

`assetUsers` uses the wide check for deletion. Files refuses deletion while
remaining files mention a target; deleting those users together can be allowed.
Media's explicit Remove file instead warns and lets the person remove a used file.
Agents refuse Always keep or still-used media. Whole families go to Recently
removed. Confirmations hold their original scope and reads; a concurrent edit
refuses rather than overwriting it.

## Site address prefix

Site settings → General → Site address stores the public address as `site.url` in
.editor/config.json. `sitePathPrefix`, `siteAddress` and `sitePathOf` in
`shared/site-path-prefix.ts` translate between repository paths and public addresses.
A project site with a /my-site folder writes that prefix on every media link,
page link, Change URL forwarding line, component loader and stylesheet link.
Repository paths and internal page routes stay unprefixed. Domain-root sites keep
root links. Readers accept plain or prefixed root links; own-host full addresses
must be within the configured folder. Outside URLs, data URLs and fragments stay.

Changing the folder runs `planSiteAddressRewriteInSlices` in
`src/page-builder/site-address-rewrite.ts`. It reads site text and previews how many
links in how many files will change. Update links applies settings and the rewrite
in one Undo step. It handles structured links, CSS, redirect/header paths and known
site paths in other text; ordinary prose, code spans and slash-like script fragments
are left alone. Full addresses on the old host within its folder follow the new
host and folder. With no old address, or when removing it, full addresses stay.
.editor files and CNAME are excluded; settings' default Social image is handled
explicitly. A host-only change with an unchanged folder triggers no rewrite.
Editing the config by hand moves no links.

Applying a changed GitHub Pages project address creates a missing .nojekyll in the
same change. The project-site support and prefix rule are the implemented
[ADR 0001 amendment](../adr/0001-the-repository-is-the-site.md).
