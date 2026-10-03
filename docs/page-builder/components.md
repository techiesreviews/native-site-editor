# Components (page builder slice `components`)

Working with components should feel like Figma's or Framer's components while
staying what they are on a native site: custom elements with a template in
`components/<tag>/<tag>.html` (and optional `<tag>.css`), filled through
`<slot>`s by the page's own markup. Every action below is one readable edit of
the site's files, shown in the code pane as it happens and undone with Undo.

Code: `src/page-builder/component-model.ts` (pure, DOM-free: slots, slot
states, edits, usage, detach, make), `src/page-builder/components.ts` (the
edit bar's part, the properties panel, the banner, the dialogs),
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
- **Page structure.** An instance's row has the mark; the rows of what the page
  slots into it have a violet rail and a badge naming their slot (`title`,
  drawn by CSS with empty alt text, so the row's name stays its own).

## Properties panel

Decision: a panel docked at the foot of the sidebar, shown whenever an
instance (or something the page slots into one) is selected and its file is
open — Framer's right panel, without a button to press, and without covering
the canvas. Its header stays in view; the page structure keeps its selected
row in view above it.

- **Header:** the component's name and tag, how many instances it has, and
  *Edit component* and *Detach instance…*.
- **Slots**, in template order, each with its kind (text, image, link, other):
  - *Text*: a field that writes the page's own slotted element's text as you
    type (only the changed stretch, so `<strong>` around a word stays; one
    undo step until the field is left). A slot the page does not fill shows
    its fallback marked *Default*; typing copies the fallback into the page
    (`<h3 slot="title">…</h3>`, or `<span slot>` for bare text), placed among
    the instance's children in the template's slot order.
  - *Image*: Address (repository images suggested), *Upload image…*, Alt text.
  - *Link*: Text and Address (the site's pages suggested).
  - *Other* content (several elements, a list) is summarised; pressing it
    selects it in the preview, where the edit bar edits it.
  - **Optional slots** — those the component hides when the page leaves them
    empty: `data-if`, a slot with no fallback (and its wrapper), or any slot
    of a section component the page fills at all — get a switch. On copies the
    fallback (or an element of the slot's kind) into the page and focuses its
    first field; off takes the page's element out with its lines.
  - A filled slot that has a fallback gets *Reset*, which takes the page's
    content out so the template's fallback shows again.
  - The slot the canvas selection sits in is highlighted; a slot's name
    selects its content in the canvas.
  The rules are those of the starter's `hideEmpty` and the runtime's
  `applyEmptyRules` (`shownSlots` in the model mirrors them).
- **Attributes** of the instance tag: each editable in place, removable, and a
  new one added from a name and value (event handlers refused).

## Edit component

The pencil over the component name in the edit bar (or *Edit component* in the panel) opens the template in the code pane and
selects, in the instance being worked on, the template element that shows the
selected slot (the root element when the instance itself was selected); the
slot's own tag is then selected in the code. A violet strip over the preview
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
  bar, structure and canvas and the chip back to the instance; the panel's
  text, link, optional, reset and attribute edits as source with undo; Edit
  component with the banner, Used on and Done; Detach; Make component with
  undo and redo of its files; an image slot and a `data-if` slot on a
  component added to About.

## Known gaps

- Editing a template's slot *definitions* (adding a slot, renaming one) is done
  in the code pane; the panel edits instances.
- Variants (`:host([variant])` rules) are not offered as choices yet;
  attributes are edited as plain text.
- Make component does not offer to move CSS, and does not create a loader for
  a site without one.

The edit bar name reveals a faded pencil on hover and keyboard focus; touch devices show it continuously. The pencil is a separate, named button. Inside a component, clicking the context name still selects its host instance. The section name and grip retain their drag behavior. Stale pencils cannot open a template after selection or source changes.
