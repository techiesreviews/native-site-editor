# Native Grid and Columns insertion planning

`planNativeLayoutInsert({sources, point, kind, cssPath, files?})` returns one
operation with `edits: Map<path, fullText>` and
`expectedSources: Map<path, originalText | undefined>`, plus a unique `className`
and `selection: {path, node}`. Failure returns `{error}` and no writes. The
caller applies the operation through the atomic text/history companion seam;
this leaf does not change Add, main, preview, editor models or drafts.

Grid and Columns produce portable HTML with a shared class and plain CSS, with
no inline layout or editor attributes. Grid uses responsive grid tracks;
Columns uses wrapping flex with low-specificity child rules. New rules are
unlayered and use no `!important`; the Style writer can locate and edit the
class rule and child classes can override the flex default. Existing CSS bytes,
comments, layers and line endings stay before the appended rules.

Insertion uses the existing conservative native HTML-boundary planner. A page
must have an explicit complete head. An effective direct local stylesheet link
is reused; conditional, alternate, disabled, named, non-CSS, external or
query/hash/encoded-slash links are not relied upon. A fresh ordinary relative
link is added when needed, verified by the existing import-path resolver.
`cssPath` must be a safe repository-local `.css` path; unsafe URL or HTML syntax
is refused. HTML insertion, link addition and stylesheet text form one operation.

Sources must be actual fresh loaded text. An existing CSS target missing from
sources is refused. Creating a CSS target requires `files`, the complete existing
file graph, to prove vacancy; an opaque/unloaded existing target is never treated
as empty text. The returned `expectedFiles` is a copied sorted graph: the host
must compare it again before applying, in addition to exact source guards and
its scope/revision receipt. Host creation guards must also enforce vacancy after
any async preparation. All provided sources are guarded because class allocation
uses their HTML entities and CSS escapes, conservatively including comments.
Class allocation is unique across the supplied workspace snapshot; supply all
relevant page/template/CSS sources, not only the selected page.

Pure regressions cover source/class collision, escaped class names, stylesheet
link resolution, new CSS vacancy proof, opaque targets, malformed HTML/CSS,
layer/CRLF preservation and native Style editing of generated rules. Browser
layout, Add integration and compound Undo remain host integration checks.
