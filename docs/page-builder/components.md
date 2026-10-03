# Components (page builder slice `components`)

Working with components should feel like Figma's or Framer's components while
staying what they are on a native site: custom elements with a template in
`components/<tag>/<tag>.html` (and optional `<tag>.css`), filled through
`<slot>`s by the page's own markup. Every action below is one readable edit of
the site's files, shown in the code pane as it happens and undone with Undo.

Code: `src/page-builder/component-model.ts` (pure, DOM-free: slots, slot
states, edits, usage, detach, make), `src/page-builder/components.ts` (the
edit bar's part, Structure instance fields, the banner, the dialogs),
`src/page-builder/components.css`, `src/page-builder/component-icon.ts`.
Wiring is a few lines in `src/main.ts` (`mountComponentTools`, and calls in
`renderNativeEditBar`, `selectNativeSource`, `setCurrentPage`, `mountSource`).

## Identity: the component accent

`--component`, `--component-surface` and `--component-text` (theme.css) mark
everything that is a component, in both schemes:

- **Canvas.** The selection box (and the hover box) on an instance is drawn in
  the component violet instead of the brand blue. An element inside an
  instance — what the page slots in, or the template's own — shows that
  instance's outline dashed around it. While a component's template is open,
  every instance of it on the page has that dashed outline, since an edit
  there changes them all. (Runtime: the `Components` block after
  `updateBoxes` in `public/native-preview-runtime.js`; the theme message
  carries `component`, and `component-focus` names the open component.)
- **Edit bar.** An instance's name wears the diamond mark in violet, its tag in
  the tooltip. An element inside an instance starts with a chip
  `◇ Project card ›` that selects the instance (for an element of a template,
  the instance on the page it renders in, opening the page).
- **Page structure.** An instance keeps its component mark. Expanding it lists each template slot name once; direct assigned elements are folded into their slot row rather than duplicated as ordinary rows. Unknown assignments remain ordinary page rows with their real DOM paths.

## Instance fields in Structure

The host retires the separate properties panel only when it enables `structureFields` alongside the Structure adapter; otherwise the existing panel remains available. A component's Structure row contains its page-instance controls; its root Edit and Disconnect actions appear on hover or keyboard focus. Ordinary selection stays on the page instance. Explicit Edit opens the shared template.

- Text is editable inline. An empty slot shows its fallback; typing copies that content into the page in template slot order.
- Image details unfold into Image and Alt text. Link details unfold into Button text and Link / URL. Unsupported rich text remains Content and selects the authored element instead of flattening it.
- Optional slots use a native checkbox. On fills the slot from its fallback; off removes the page's assignment. Filled slots with a fallback offer Reset so the shared fallback shows again. These remain the starter's `hideEmpty`/`applyEmptyRules` semantics.
- Attributes unfold beneath the component root. Existing class, id and custom attributes retain their values and can be edited or removed; a name/value form adds new attributes. Invalid names, event-handler names and duplicates are refused. Named entities are decoded once for display; an unchanged value leaves source bytes intact.

Fields capture the exact instance source, template, scope, mounted model/session and version on first focus. Their own typing advances that proof and forms one edit group; external source or context changes refuse further writes. Closing a stale field cannot close another model's edit group. New-attribute drafts keep their first-open proof through rerenders. The host's Structure wiring and real editor Undo/Redo integration checks remain pending for this leaf.

## Edit component

The complete component-root name button in the edit bar (or *Edit* on its Structure root row) opens its template and selects the template root in the code pane. A violet strip over the preview
says **Editing component `<project-card>` · changes apply to 3 instances on 1
page** while any component's template is open (it shows even with the code
pane collapsed; the code pane's title is tinted too). *Used on* lists the pages
using it (with counts, nested uses included) and the components whose
templates use it; a page opens with its first instance selected, a component
opens its template. *Done* goes back to the page the preview shows, with the
instance worked on selected.

## Detach (Unlink)

*Detach instance…* shows the markup that replaces the instance before writing
it: the template with each slot replaced by what the page gives it (a bare
`<span slot>` or a block slotted into a line of text reduced to its content),
else its fallback; parts the template hides on this instance left out;
`data-if` dropped; the instance tag's attributes moved onto the template's
single top-level element (classes merged). Components the template uses stay
components. The dialog says when the component's own stylesheet will stop
styling the copy (it applies inside the shadow root only) and when attributes
cannot be kept (several top-level elements). One undo step.

## Make component

*Make component…* in the edit bar for a container of a page (section,
article, header, footer, aside, nav, figure, div, form) shows a guided preview
before anything is written: the name (suggested from the element's class or
heading, checked live: a dash, lowercase, free, not reserved) and the three
results — `components/<tag>/<tag>.html`, `components/<tag>/<tag>.css` and the
page's replacement. The result is deliberately minimal:

- The element's markup becomes the template. Each line of text keeps its
  element and gets a slot *inside* it (`<h1><slot name="title">…</slot></h1>`)
  so the site's descendant rules (`.hero h1`) still reach it; each standalone
  link and image becomes a whole-element slot, since its address and alt text
  are the page's to change. Slot names come from classes (`lead`,
  `card__title` → `title`) or the kind (`title`, `body`, `link`, `image`).
- The page gets `<tag>` holding that text, those links and images as slotted
  content, so it shows what it showed. An `id` moves to the instance tag,
  where links to it still find it.
- **No CSS moves.** The site's stylesheets reach a component's shadow root as
  they reach the page (the starter's loader and the editor's preview both do
  this), so the template looks the same. The new stylesheet only holds
  `:host { display: block; }`, so the custom element is a block as the
  element was. Moving rules is not "trivially safe" in general (other pages
  may use them), so it is left to the user.
- A site whose pages do not load `components/components.js` is warned.

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
  (fallback, optional, section rule, `data-if`), slot values, text edits that
  keep formatting, filling and emptying slots in template order, attribute
  edits, usage counting through nested components, detach, make component and
  tag names.
- `tests/native-save/native-components.spec.ts` (browser): the accent in the
  bar, structure and canvas and the chip back to the instance; the instance fields’
  text, link, optional, reset and attribute edits as source with undo; Edit
  component with the banner, Used on and Done; Detach; Make component with
  undo and redo of its files; an image slot and a `data-if` slot on a
  component added to About.

## Known gaps

- Editing a template's slot *definitions* (adding a slot, renaming one) is done
  in the code pane; Structure edits instances.
- Variants (`:host([variant])` rules) are not offered as choices yet;
  attributes are edited as plain text.
- Make component does not offer to move CSS, and does not create a loader for
  a site without one.

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
