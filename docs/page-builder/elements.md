# Native elements leaf

The existing Add panel can include static native HTML alongside section components.
`nativeElementChoices` provides Elements, Layout, and Forms groups. Its `native:*`
keys identify choices in the editor only; they never appear in page markup.
`nativeChoiceMarkup(key, options)` returns controlled, escaped HTML. Heading, text,
image, link button, list, video, sandboxed iframe, divider, flex columns, CSS grid,
form, and native fields need no runtime, build step, or page metadata. Layout presets
use ordinary inline CSS; supplied site classes remain intact. Forms explicitly write
`action` and `method`; the empty default action posts to the current URL and does not
provide a backend. Configure a real endpoint before treating a form as operational.

## Source contracts

`native-insert.ts` re-exports the leaf operations. Its original
`nativeInsertEdit(source, parent, index, tag, template)` behavior is unchanged.

- `nativeDestinations(source, path, selected)` derives before/after/inside destinations
  with the existing `InsertPoint` shape and an English `description`. Source points
  have zero geometry; the host must supply real canvas geometry before drag/inline use.
- `nativeMarkupInsertEdit(source, parent, index, markup)` returns one guarded range
  edit or `undefined`. It preserves existing text, comments, and neighbouring markup;
  structural lines match CRLF and neighbour indentation; content bytes inside pre,
  textarea, script, style, and other raw-text regions retain their original line endings. Destinations are element-child
  positions, not text offsets. A destination still needs validation for each choice.
- `nativeMoveEdit(source, from, point)` and `nativeMoveToEdit(source, from, selected,
  placement)` return one guarded replacement, including cross-parent moves. Moving
  source classes/content remain unchanged; only structural line indentation is adjusted. Cycles and
  moves to the current position are rejected.
- Edits contain `source` (the exact original document) and `original` (the replaced
  slice). `applyGuardedSourceEdit(current, edit)` refuses stale documents. A host can
  use that check, then submit the range through its existing single-edit/Undo path.

The parser requires explicit balanced tags and rejects semantic repairs,
void/text/raw-text destinations, nested forms, and interactive nesting. Scripts and
refresh metadata do not count in paths, matching preview sanitization. Existing
custom elements, SVG/MathML, templates, and noscript regions are opaque boundaries:
they occupy one ordinary element-child position, and HTML operations can insert
before/after them or edit ordinary HTML elsewhere in the page. Template content is
not part of `element.children`. Custom-element light DOM still appears in the
preview's structure, but source operations refuse any path crossing its host.
Foreign self-closing tags and recognized HTML integration points are parsed in their
namespace; HTML tokens that break out of foreign content are refused. Unsupported
foreign syntax, mismatched tags, implicit table sections, omitted end tags, and
unsafe repairs still fail closed. New fragments retain the HTML-name allowlist:
custom, foreign, template, and editor catalogue names are not insertion fragments.

Direct opaque-island moves and all partial-island edits are refused. An ordinary
HTML wrapper containing islands may move to a valid HTML destination as one guarded
range; the complete bytes of each nested island stay unchanged, including its
internal whitespace and line endings. Shared component content should be edited in
its actual template through the component editor. Existing collection/component
operations retain their own contracts.

URL attributes use the complete HTML5 attribute decoder before validation. URL-list
attributes (`srcset`, `imagesrcset`, `ping`, `archive`) are conservatively rejected
until a candidate parser is available.

## Integrated Add catalogue

The production Add panel includes native Elements and Forms alongside section
components. A docked native choice uses the selected HTML container, or goes after
an ordinary selected text element. The destination sentence describes that source
position. A section plus keeps its explicit gap; dragging uses the actual gap
under the pointer. Every choice is validated against that destination before a
single guarded range edit, followed by native selection and one Undo step.
Component insertion keeps its existing instance and slot behavior.

Grid and Columns are visibly disabled while their class and stylesheet transaction
is pending. Their leaf previews use inline layout CSS; exposing them before native
class/CSS integration would prevent ordinary Style rules from taking effect.

## Remaining root adapters

Move before/after/inside, palette/slash native choices, and Grid/Columns class/CSS
transactions still need production host integration. Layout insertion and subsequent
Style edits must preserve unrelated source and share guarded Undo/Redo behavior.



1. Route palette and slash to these same choices/operations. Slash runtime
   wiring remains pending; activate only in an empty text block and leave code typing
   alone. Map source points to runtime geometry before offering them as canvas gaps.
2. Wire Move before/after/inside to `nativeMoveToEdit`, guarded and applied through
   the same single-operation editor path. Test stale drafts and preview reselection.
3. Test integrated layout insertion, Undo, selection/reveal, shared-template scope, dragging,
   and slash in the host. None of those integrated behaviors are claimed by this leaf.

## Validation

`tests/native-elements.test.ts` covers the catalogue, escaping, semantic rejection,
source corruption, comments/text, same-line HTML, exact bounds, CRLF, sanitized paths,
stale guards, move directions, cross-parent moves, indentation, and cycles. Existing
`native-insert.test.ts` and `page-builder-add.test.ts` cover backward compatibility.

`tsx tests/native-elements-browser.ts` runs a standalone Add-panel harness on isolated
port 5316, then closes Chromium and Vite in `finally`. It checks groups alongside
components, search, keyboard insertion into mock source, per-choice disabled targets,
HTML preview, and Escape. It does not run or own a production browser tab. Type checks,
the UI build, and the full unit suite were also run.

The Astra review regressions cover encoded colons and semicolon-free numeric
references, quoted fake sandbox/href/action/method attributes, decoded refresh-meta
child indexes, nested phrasing repairs, controlled media in buttons, HTML-name
rejection, and insertion/move content-byte preservation for LF and CRLF. Validation
after these fixes: 28 focused tests, 551 full unit tests, both TypeScript checks, and
`git diff --check` passed. No browser run was performed for this source-only fix;
host integration and runtime geometry remain outside this leaf's validation.

## Compatibility validation and layout preset contract

`tests/native-save/native-elements-compat.spec.ts` mounts the real native starter,
production Monaco, and production native preview with SVG, nested templates, and
noscript siblings. It verifies sanitized element indexes (including custom light
DOM), outside insertion, wrapper movement, exact Undo/Redo, and refused inside or
partial-island operations. This is a leaf integration harness; repository menu/Add
host wiring is not claimed. Mixed LF/CRLF preservation is checked by pure source
operation tests; Monaco normalizes a newly mounted document to its chosen line
ending before operations begin.

Grid/columns presets currently declare layout properties in an inline `style`
attribute. A normal class rule written by the Style panel cannot override those
properties. A host adapter should either create a scoped class rule in the same
source-and-stylesheet transaction as insertion, or explicitly remove the touched
inline declarations while writing their replacement class rules. That migration
must share one guarded Undo/Redo operation and must preserve unrelated inline
properties. This leaf keeps the catalogue unchanged and does not claim to fix the
Style host contract.

## Native attribute field planner (host wiring pending)

`locateNativeFieldElement(source, tag)` captures an exact parsed start tag and the
full source snapshot. `nativeElementFields(source, tag)` exposes video source,
poster and title; iframe source and title; form action and method; and native
control name and accessible label. Submit-capable buttons and submit/image inputs
also expose `formaction`. Foreign and inert content is excluded. Visible label
captions are not edited by this planner.

`nativeElementAttributeEdits(source, located, patch)` validates every property
before returning one start-tag edit and `expectedSource`. Unknown properties,
invalid methods, duplicate patched attributes, or a changed source refuse the
whole patch. Null removes an attribute. Existing custom method values remain
visible as a disabled current option; reading a page never resets them.

Values decode HTML entities once when read and escape raw values once when written.
URLs allow relative and HTTP(S) addresses; iframe source additionally permits
`about:blank`, and form actions permit `mailto:` and `tel:`. Protocol checks reject
control characters and executable schemes, including entity spellings, without
rewriting emitted URL values. Other source bytes, including Unicode whitespace and
slashes belonging to unquoted attribute values, remain intact. The host must
capture selection, check `expectedSource`, and apply this edit through its existing
single Undo transaction. This pure leaf does not add a panel or backend.
