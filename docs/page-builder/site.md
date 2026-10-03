# Site controls

Page settings opens from the Page block. Site settings opens from the repository
menu. Navigation opens from the Page block when its header contains a simple
navigation list. Every Apply action creates browser drafts. Save to GitHub keeps
those drafts; Undo restores all files affected by one action.

## Page settings

Title and description write ordinary head metadata. Social title and description
follow their page fields while their respective checkboxes are selected. Uncheck
a field to maintain a separate sharing value. The choice persists during the
editor session; reopening an editor infers linkage from missing or equal values.

The share card previews social title, description and image. Images may be chosen
from repository paths, uploaded, or entered as full URLs. The preview uses text
content rather than HTML. A failed image request shows a placeholder. Late upload
results cannot replace a field that changed while the picker was open, or update
a closed panel.

Canonical URL requires an HTTP or HTTPS address. Hide from search engines adds
`noindex` while preserving unrelated crawler directives; it does not make a page
private. Theme colour accepts a CSS colour. Apply page details before changing
the URL when both have edits. The home URL stays `/`.

## Shared identity and 404

Site settings lists the affected pages before applying. Site name and default
social image are recorded under `site` in `.editor/config.json`, preserving other
configuration keys. Favicon and social site name update page heads. The default
social image updates missing values and pages using the previous default; custom
page images remain independent. Titles and descriptions keep their page values.

The 404 action opens an existing `404.html`, or creates a plain HTML draft with a
home link and `noindex`. Static hosting determines when that document is served.

Malformed configuration is refused when applying. Head edits require an explicit,
unambiguous closing head tag. Ambiguous closing text inside comments or scripts
is refused rather than guessing an insertion point.

HTML character references use the complete 2,231-name HTML5 table generated from
Python's `html.entities.html5` in `src/page-builder/html-entities.ts`. The decoder
is DOM-free and supports longest named matches, legacy semicolonless references,
attribute ambiguity, multi-codepoint values, and HTML numeric replacement rules.
Unchanged metadata and navigation text retain their original entity spelling.

## Host integration

Each settings controller captures the repository scope and generation when its
panel opens. Its apply handlers must also compare the relevant source against
the opening snapshot; page settings cannot overwrite changes made while open.
Site settings must compare the config, page sources and route list before building
one atomic draft operation. Upload handlers must retain their captured repository
scope across picking and writing files.

`createSiteSettings(handlers, linkPreferences)` accepts an external
`Map<string, SiteLinkPreference>`. The host must reuse that map across controllers
within one repository/branch session, and replace it when the repository scope
changes. Without an external map, preferences last only for that controller.

## Navigation

Navigation edits the shared header component used by the current page, or a
simple inline header. Supported markup is direct text links or a `ul`/`ol` whose
items contain one text link each. Icons, nested menus, comments between items and
dynamic markup are left for source editing.

Reorder with dragging, Move up/Move down, or Alt+Up/Alt+Down on the reorder handle.
Add page uses the current page routes; the 404 document is excluded. External
links support HTTP, HTTPS, `mailto:` and `tel:`. Root-relative URLs and fragments
are supported. Unsafe schemes, empty labels and whitespace in URLs are refused.

Existing link markup, quote style and attributes remain attached when reordered.
New links inherit the first item's style while dropping IDs, source keys and
current-page state. Labels and URLs are escaped before entering source. Applying a panel whose
navigation source changed must fail and require reopening it.

## Effects

Effects add ordinary classes and readable rules in `styles/effects.css`, linked
from every page. Rules are inserted once per preset. Removing an effect changes
its selected instance while leaving shared rules available for other instances.

Fade and slide use CSS view timelines behind feature support and
`prefers-reduced-motion: no-preference` checks. Unsupported browsers and reduced
motion preferences retain visible content. Hover lift applies only to precise
hover pointers with motion permitted. Underline also responds to keyboard focus.
No animation runtime or package is added.

## Validation

`tests/site-head.test.ts`, `tests/site-identity.test.ts`,
`tests/site-navigation.test.ts` and `tests/site-effects.test.ts` exercise source
preservation, escaping, idempotence and refusal cases. Browser coverage lives in
`tests/native-save/native-site-settings.spec.ts` and uses the real worker through
the fake GitHub boundary. Set `ASE_TEST_PORT` for an isolated browser run.
