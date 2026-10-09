# Components (page builder slice `components`)

Working with components should feel like Figma's or Framer's components while
staying what they are on a native site: custom elements with a template in
`components/<tag>/<tag>.html` (and optional `<tag>.css`), filled through
`<slot>`s by the page's own markup. Every action below is one readable edit of
the site's files, shown in the code pane as it happens and undone with Undo.

Code: `src/page-builder/component-model.ts` (pure, DOM-free: slots, slot
states, edits, usage, detach, make), `src/page-builder/components.ts` (the
edit bar's part, Structure instance fields, the canvas bar, the dialogs),
`src/page-builder/components.css`, `src/page-builder/component-icon.ts`.
Wiring is a few lines in `src/main.ts` (`mountComponentTools`, and calls in
`renderNativeEditBar`, `selectNativeSource`, `setCurrentPage`, `mountSource`).

## Identity: the component accent

`--component`, `--component-surface` and `--component-text` (theme.css) mark
everything that is a component, in both schemes:

- **Canvas.** The selection box (and the hover box) on an instance is drawn in
  the component violet instead of the brand blue. An element inside an
  instance shows that instance's outline dashed around it. In page mode,
  hovering a template interior points to its instance. Explicit Edit exposes
  the template elements. While a component's template is open,
  every instance of it on the page has that dashed outline, since an edit
  there changes them all. (Runtime: the `Components` block after
  `updateBoxes` in `src/components/native-preview-runtime.js`; the theme message
  carries `component`, and `component-focus` names the open component.)
- **Edit bar.** An instance's name wears the diamond mark in violet, its tag in
  the tooltip. An element inside an instance starts with a chip
  `◇ Project card ›` that selects the instance (for an element of a template,
  the instance on the page it renders in, opening the page).
- **Page structure.** An instance keeps its component mark. Assigned elements remain native rows with purple slot badges. Empty slots have restoration rows. Unknown assignments remain ordinary page rows with their real DOM paths.

## Instance fields in Structure

A component's Structure row contains its page-instance controls; its root Edit and Disconnect actions appear on hover or keyboard focus. Ordinary selection stays on the page instance. Explicit Edit opens the shared template.

In the normal page view, layout wrappers inside an instance's page-owned slot
content select their nearest editable content ancestor or the outer instance.
Text, links, buttons, images and card items remain selectable. Explicit template
Edit unlocks its layout containers; ordinary containers outside components keep
their normal selection behavior. Page-mode template hover also points to the instance.

After a guarded Structure visibility change commits its source, the host sends
the pending preview update during the same click handler instead of waiting for
its next animation frame. Refused changes send nothing. Code typing retains its
normal frame batching, and the sandboxed preview still receives messages
asynchronously; this is not a guarantee about its first paint.

- Text is editable inline. An empty slot shows its fallback; typing copies that content into the page in template slot order.
- Image details unfold into Image and Alt text. Link details unfold into Button text and Link / URL. Unsupported rich text remains Content and selects the authored element instead of flattening it.
- Optional slots use a native checkbox. On fills the slot from its fallback; off removes the page's assignment. Filled slots with a fallback offer Reset so the shared fallback shows again. These remain the starter's `hideEmpty`/`applyEmptyRules` semantics.
- Attributes unfold beneath the component root. Existing class, id and custom attributes retain their values and can be edited or removed; a name/value form adds new attributes. Invalid names, event-handler names and duplicates are refused. Named entities are decoded once for display; an unchanged value leaves source bytes intact.

Fields capture the exact instance source, template, scope, mounted model/session and version on first focus. Their own typing advances that proof and forms one edit group; external source or context changes refuse further writes. Closing a stale field cannot close another model's edit group. New-attribute drafts keep their first-open proof through rerenders. The host's Structure wiring and real editor Undo/Redo integration checks remain pending for this leaf.

## Variants in the edit bar

A selected instance shows its variants in the edit bar (ticket 07 §5): a
dropdown per variant, with its name before it, and a checkbox per yes/no
variant. Past two, they sit behind one Variants button whose popover stays
open while its fields change. The variants are read by `shared/variants.ts`
from the component's own CSS and the stylesheets the page links (imports
expanded): tag-named rules, site `:host()` rules and global attributes. The
reader is loaded the first time an instance is selected
(`src/page-builder/variant-fields.ts`), and the bar shows again with it.

- The first option is the default look and removes the attribute (named after
  a default value alias, "Image left (default)", when the CSS has one).
- A value no rule knows shows as "Custom" and stays until another is picked.
- A variant or value styled only inside a media or container query says where
  it shows: "wide screens only", "narrow screens only", "dark mode only".
- A yes/no variant is written bare (`data-featured`); off removes it.
- Each pick is one edit of the page through the open editor, one undo step.
  The Structure panel keeps its raw attribute list.

Attributes the site's own scripts set are not left out yet: the editor does
not read the site's script files.

## Edit component

The complete component-root name button in the edit bar (or *Edit* on its Structure root row) opens its template and selects the template root in the code pane. While any component's template is open, the canvas bar over the preview wears the
component accent and starts with an instance breadcrumb, **Editing `<project-card>`** (it shows even
with the code pane collapsed; the code pane's title is tinted too). Beside it,
*Used on 1 page* opens a list (resting the mouse on it for a moment, a click,
Enter, Space or ↓; Esc closes) of the pages using it (title, address and
count, nested uses included) and, under a Components heading, the components
whose templates use it; a page opens with its first instance selected, a
component opens its template. The check button after it (*Done editing
component*, its "Done" label showing on hover or keyboard focus) goes back to
the page the preview shows, with the instance worked on selected.

## Detach (Unlink)

*Detach instance…* shows the markup that replaces the instance before writing
it: the template with each slot replaced by what the page gives it (a bare
`<span slot>` or a block slotted into a line of text reduced to its content),
else its fallback; parts the template hides on this instance left out;
the instance tag's attributes moved onto the template's
single top-level element (classes merged). Components the template uses stay
components. The dialog says when the component's own stylesheet will stop
styling the copy (it applies inside the shadow root only) and when attributes
cannot be kept (several top-level elements). One undo step.

## Make component

*Make component* in the edit bar for a container of a page (section, div,
article, aside, figure, nav, or a header/footer inside sectioning content;
not a component or anything inside one; slice 80) makes it a component at once, with no
dialog (build slice 22). The name is automatic (`automaticComponentName`,
`component-names.ts`): the prefix for what it was made from (`section-`,
`card-` for an article or a "card" class, else `block-`) and the first three
words of its first heading ("Recent work" → `section-recent-work`), else a
number (`section-1`, `section-2`); a taken name takes the next free number.
It writes `components/<tag>/<tag>.html`, `components/<tag>/<tag>.css` and the
page's replacement, then opens Edit component mode on the new instance, where
the plan's notes (a link-wrapped card, page rules that can't follow, no page
loading `components/components.js`) show in the bar until dismissed. The
name is changed afterwards in Edit component mode.

- The element's markup becomes the template. Each line of text keeps its
  element and gets a slot *inside* it (`<h1><slot name="title">…</slot></h1>`)
  so the site's descendant rules (`.hero h1`) still reach it; each standalone
  link and image becomes a whole-element slot, since its address and alt text
  are the page's to change. Slot names come from classes (`lead`,
  `card__title` → `title`) or the kind (`title`, `body`, `link`, `image`).
- The page gets `<tag>` holding that text, those links and images as slotted
  content, so it shows what it showed. An `id` moves to the instance tag,
  where links to it still find it.
- Repeated plain items with a heading (a grid of `<article class="card">`)
  become a card component too, `card-…`, named from the items slot
  (`services` → `card-service`) or the new component (`section-recent-work` →
  `card-recent-work`): the items written alike become its instances, each keeping its
  content in its slots, and the items slot's fallback is one empty instance.
  Items that are instances already stay as they are. All four files and the
  page are one undo step.
- **The page CSS that styled it follows** (build slice 64): a rule that
  would stop reaching the element once it is an instance is copied into the
  new stylesheet, rewritten to start at it (after `:host { display: block; }`);
  the site's stylesheets stay as they are. Rules that can't follow are noted.
- A site whose pages do not load `components/components.js` is noted.

The new files are drafts; writing them and replacing the element is one undo
step (the code editor's history companion): Undo/Redo in the top bar take the
files back and write them again. (⌘Z typed inside the code pane is the code
editor's own text undo and leaves the new files as drafts to discard.)

## Deferred instance slot adapter

`ComponentTools.fillInstanceSlot(target, name): boolean` is the public seam
for a host adapter receiving a slot ghost report. It returns whether the
native source edit was accepted. `setSlotOn` remains private. The exported
target interface in `src/page-builder/components.ts` is exactly:

```ts
export interface ComponentInstanceSlotTarget {
  pagePath: string;
  pageNode: number[];
  tag: string;
  templatePath: string;
  expectedRevision: string;
  expectedPageSource: string;
  expectedTemplateSource: string;
  expectedSelection: NativePreviewSelection;
  isCurrent(): boolean;
}
```

The host adapter binds the report to the current revision, complete page
and template sources, and the exact active selection object. `isCurrent`
must prove that the editor model, session, version and repository context
are unchanged; the existing `captureFileModelState(scope, pagePath)` can
provide the model proof. Capture these identities when receiving the report,
then retain them until the action. Do not reconstruct a fresh target at click
time or accept identities supplied only by the iframe.

The method requires the active selected element itself to be the shown
instance, with matching page path, node, tag and template mapping. It rereads
the instance and checks the mounted model's full source, the full page and
template sources, revision, preview page and model proof. A changed selection
(including a descendant of the same host), missing slot, filled slot, stale
model or changed context returns `false` without editing or navigating.

An accepted action uses the existing native fallback markup insertion as
one undo transaction, selects the instance after preview update and focuses
the slot's next field. The first same-name outlet supplies fallback markup. Duplicate same-name
`<slot>` outlets share one native assignment; occurrences cannot be filled independently. The seam never
mutates iframe DOM or opens a shared template.

## Tests

The seam browser test runs the production component controller with mocked component dependencies. It proves the controller contract, not the root ghost adapter or real Monaco Undo integration for ghost actions. That integration remains pending in the separately owned main adapter. The seam has not received independent Claude review.

- `tests/native-save/component-slot-seam.spec.ts`: guarded host snapshots,
  stale selection/model/source/context rejection, one assignment for duplicate
  outlets, one transaction and existing field focus.
- `tests/component-model.test.ts` (unit): slots and kinds, slot states
  (fallbacks, empty wrappers and section rules), slot values, text edits that
  keep formatting, filling and emptying slots in template order, attribute
  edits, usage counting through nested components, detach, make component and
  tag names.
- `tests/variant-fields.test.ts` (unit) and
  `tests/native-save/native-variants.spec.ts` (browser, fixture
  `native-variants`): variant fields, Custom, conditions, bare yes/no
  attributes, the Variants button and one undo step per pick.
- `tests/native-save/native-make-component.spec.ts` (browser, `@smoke`): Make
  component with no dialog, the automatic names, Edit component mode on the
  new instance, one undo and redo of its files.
- `tests/native-save/native-components.spec.ts` (browser): the accent in the
  bar, structure and canvas and the chip back to the instance; the instance fields’
  text, link, optional, reset and attribute edits as source with undo; Edit
  component with the canvas bar, Used on and Done; Detach; Make component's
  refusals; an image slot and an empty slot on a
  component added to About.

## Known gaps

- Editing a template's slot *definitions* (adding a slot, renaming one) is done
  in the code pane; Structure edits instances.
- Make component does not create a loader for a site without one.

The edit bar offers component editing only when the component root itself is
selected. Light-DOM slot children and template children keep the instance-selection
caret, which only selects the host; paragraphs, wrappers and buttons do not acquire
an enclosing-component edit action. This root rule is independent of the section-only
Add catalogue: an existing component with an article root can still be edited.

The normal name button shows the complete component name. A theme-colored edit icon
slides and fades over its right edge on fine-pointer hover, using only transform and
opacity over 140 ms with ease-out. No gutter or width/padding animation changes its
hit area. Keyboard focus reveals the icon immediately; reduced motion removes the
slide and transition. Touch edits with one tap on the complete name without requiring
a hover reveal. The section grip still drags, and a drag release cannot also edit.
Context carets stay separate selection actions. Stale root actions retain their
source/selection guards, and missing template sources provide no edit action.
