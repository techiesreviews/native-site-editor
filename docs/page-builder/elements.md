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
  inserted lines match CRLF and neighbour indentation. Destinations are element-child
  positions, not text offsets. A destination still needs validation for each choice.
- `nativeMoveEdit(source, from, point)` and `nativeMoveToEdit(source, from, selected,
  placement)` return one guarded replacement, including cross-parent moves. Moving
  source classes/content remain unchanged; line indentation is adjusted. Cycles and
  moves to the current position are rejected.
- Edits contain `source` (the exact original document) and `original` (the replaced
  slice). `applyGuardedSourceEdit(current, edit)` refuses stale documents. A host can
  use that check, then submit the range through its existing single-edit/Undo path.

The parser deliberately requires explicit balanced tags and rejects semantic repairs,
void/text/raw-text destinations, nested forms, and interactive nesting. Scripts and
refresh metadata do not count in paths, matching preview sanitization. Arbitrary
children cannot be inserted under custom elements. Edit a shared component's actual
native template/container instead. Foreign content, template-containing documents,
legacy raw-text elements, implicit table sections, omitted end tags, and unsupported
containers are conservatively unavailable rather than guessed. This leaf does not
change the existing component-slot generation.

## Root adapter next steps

1. Add `extraChoices: () => nativeElementChoices` to the current Add handlers.
   In `preview(key)`, handle `nativeChoiceMarkup(key)` first and use the existing
   thumbnail-document builder with site CSS. Keep component preview behavior intact.
2. Derive source destinations from the authoritative native selection and current
   draft. Choose an explicit before/after/inside destination. Show its `description`
   through optional `destinationText(point)`. Use optional `pointFor(choice, fallback)`
   to select and validate the right point for each choice; return `undefined` when
   `nativeMarkupInsertEdit` rejects the choice. Hover/focus updates the destination
   sentence. Keep section-component targets on their existing route.
3. In the existing `insert(point, choice)` adapter, recognize `native:*`, generate
   markup, obtain `nativeMarkupInsertEdit`, verify its source guard, and apply exactly
   one editor range edit. Then select/reveal the inserted source element through the
   host's existing source-to-preview mapping. Do not emit the catalogue key as a tag.
4. Route inline +, palette, and slash to these same choices/operations. Slash runtime
   wiring remains pending; activate only in an empty text block and leave code typing
   alone. Map source points to runtime geometry before offering them as canvas gaps.
5. Wire Move before/after/inside to `nativeMoveToEdit`, guarded and applied through
   the same single-operation editor path. Test stale drafts and preview reselection.
6. Test integrated insertion, Undo, selection/reveal, shared-template scope, dragging,
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
