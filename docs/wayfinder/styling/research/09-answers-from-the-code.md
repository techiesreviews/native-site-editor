# 09 · Styling questions answered from the code (2026-10-26)

Ticket: [Answer the styling questions from how components and variants work today](../tickets/09-research-answers-from-the-code.md). Map: [Styling](../map.md).

Read on `dev` at `a49729f24`. No source file has changed since research 02 tested at `b8f36d53c` (`git diff b8f36d53c a49729f24 -- src shared worker` is empty), so research 02's line numbers still hold. `fixtures/actual-starter` is byte-identical to `~/Projects/native-site-editor-starter` (`main` = `dev` = `efc3188`).

Lex, round 1 (ticket 03): "the rest is already as we have built it, so for questions look at how it's done now in terms of variants and components."

## Short answer

- **Answered by the code or earlier decisions (7):** 1 free or design values, 4 dark colours, 5 code editing in the bottom pane, 6 where "only this variant" rules go, 7 elements outside components (as far as today goes), 10 which files are tokens today, 12 the 11 Components faults.
- **Still open (5):** 2 screen sizes (container or page width, how many), 3 hover and focus, 8 the starter's older CSS, 9 site styles in a component's style list, 11 swatch click. Two answered questions also leave a smaller choice open: 6b (can the panel make a new variant?) and 7b (can the panel edit or add a site class?).
- **New finding:** `--accent` and `--on-accent` in `tokens.css` are overwritten by `tones.css` in every modern browser. Changing them in `tokens.css` does nothing visible, so the panel must show them as "worked out from the brand colour" (see 4).
- **WordPress block styles:** our variants already work like WordPress block styles: named looks, picked from a list, with the default when none is set. What they lack is previews in the edit bar, readable names, and a way to make, rename or remove a look without writing CSS (see the section at the end).
- **Classes today:** no screen shows an element's classes as chips. The nearest thing is the rule chips above the bottom stylesheet pane, which list rules, not classes.

## Answered

### 1. Design values or free values: free values, design values suggested

- **Lex decided it** in round 1 (ticket 03): "Free field to write anything, on click has suggestions, on right click … show the variables that are set up."
- **It matches what is built:**
  - The edit bar's Text size offers the site's own scale first, then "Default", and shows "Custom" for a value it doesn't know (`src/controllers/page-structure-controller.ts:228-250`, `src/native-text-size.ts:4-14`).
  - Variants show an unknown value as "Custom" and never drop it (`src/page-builder/variant-fields.ts:91`).
  - Agents are told to "use the site's design tokens … from `styles/tokens.css`" (`worker/site-conventions.ts:137`).
- **Left over:** whether a free value looks different from a design value in the field. Recommendation: no. The bottom code pane shows `var(--…)` or the raw value, which is enough, and the UX rules forbid explainer text.

### 4. Dark-mode colours: how the tokens do light and dark today

- **Each colour role is written three times:**
  1. a plain value for old browsers (`fixtures/actual-starter/styles/tokens.css:17-23`, such as `--ink: #20231f`);
  2. a `light-dark()` pair under `@supports` (`tokens.css:59-69`);
  3. the dark values again for browsers without `light-dark()`, under `[data-tone="dark"]` (`styles/tones.css:50-60`).
- **Which one shows:** the page follows the visitor's setting through `color-scheme: light dark` (`tones.css:13-21`). `data-tone="light"` and `data-tone="dark"` force one or the other on a band (`tones.css:40-46`). Brand and accent bands get their colours from `--brand` (`tones.css:65-128`). This was decided in components-and-builder ticket 08.
- **New finding: `--accent` and `--on-accent` are worked out from `--brand`.**
  - Wherever the browser has relative colour syntax, `tones.css:135-147` replaces both with values worked out from `--brand`. That covers every current browser.
  - So editing `--accent` in `tokens.css` (lines 21 and 65) changes only old browsers.
  - The panel should show Accent as "from the brand colour" and point its colour control at `--brand` (`tokens.css:10`), which is the site's only literal colour.
- **Result for the panel:**
  - Changing a colour role writes the plain value and both halves of the `light-dark()` pair together, plus the `tones.css` dark copy.
  - Swatches need both the light and the dark value. Only the preview can resolve them (research 02, faults 3 and 4).
- **Preview gap:** the editor has no switch to show the site in dark. `color-scheme` and `prefers-color-scheme` appear in `src/` only for the editor's own look (`src/theme.ts:6`, `src/style.css:17`, `src/page-builder/variant-fields.ts:58`). To check a dark value, you change your system setting. A "show dark" toggle belongs to ticket 04.

### 5. Code editing: the existing bottom code pane, no editor in the panel

- **Lex decided:** "Code can be the same code editor as already exists in the bottom."
- **What exists:**
  - The bottom area is `#code-split` with two panes: the page or template HTML (`#content`) and the stylesheet beside it (`#secondary-pane`, with its title and rule chips `#secondary-rules`) (`src/workspace-mount.ts:309-314`).
  - A horizontal splitter above it sets its height (`src/components/code-resize.ts:4-6`).
- **The panel can already aim it at one rule:**
  1. `findStyleRulesInSources` gives a rule's file and its start and end in the text (`src/styles-index.ts:95`). `declarationRanges` gives each declaration (`:128`).
  2. `openSecondary(path)` puts that file in the stylesheet pane (`src/controllers/linked-styles-controller.ts:183`).
  3. `revealRange(path, start, end)` scrolls to the rule and puts the caret on it (`src/components/source-editor.ts:544`). `highlightRanges` marks it (`:552`).
  4. `revealRule` already chains steps 2 and 3 when a rule chip is clicked (`linked-styles-controller.ts:337-347`).
- **Things to know before relying on it:**
  - **The pane jumps to a site file.** It follows the first matched file and leaves the component's own CSS (`linked-styles-controller.ts:371-378`). This is research 02's fault 1, cause 2. The panel needs the pane to stay on the component's file while the panel edits it.
  - **Holding Ctrl swaps the pane** to `tokens.css` while the mouse rests on a `var()` (`src/components/code-editor.ts:377-401`). Research 02, other fault 1.
  - **The code editor loads late.** It is a ~1 MB chunk loaded on demand (`src/controllers/code-panes-controller.ts:17-27`). Edits and Undo work from the draft store without it, so the panel can write CSS before the pane has loaded and reveal the rule once it has.

### 6. Where "only this variant" rules go

- **What a variant is** (`CONTEXT.md:21-22`, components-and-builder ticket 07):
  - a `data-*` attribute on the instance that some CSS styles;
  - leaving it off gives the default look;
  - nothing is registered.
  - **There are no component manifests.** A component is only `components/<tag>/<tag>.html` plus an optional `.css` (components-and-builder `map.md:17`, `worker/site-conventions.ts:47`).
- **Where its rules are written:**
  - In the component's own CSS, on the host: `:host([data-layout="centered"]) section { … }` (`worker/site-conventions.ts:113-116`). Example: `section-hero.css:77-84`, and `section-split.css:92-128` (including one inside `@media (width > 720px)`).
  - Nested forms and rules inside `@media` or `@container` count too.
  - The broken forms `:host[data-x]` and `:host { &[data-x] }` get a warning and the fix (`shared/variants.ts:364-379`).
- **Other places that add variants:**
  - **Site CSS naming the tag** (`section-hero[data-x="v"]`). Read by `variantsForComponent` (`shared/variants.ts:547-555`).
  - **Site classes** (`.btn[data-variant]`). Read by `variantsForClass` (`:557-560`), but the edit bar asks only for `btn` (`src/page-builder/components.ts:635`).
  - **Bare attributes** (`[data-x]`). Read by `globalVariants` (`:563-565`).
- **Which files are read:** decided once in `shared/variant-lookup.ts:1-16`:
  - the stylesheets the pages link, with their `@import`s;
  - each component's own stylesheet;
  - the scripts the pages load. An attribute a site script sets is treated as state, not a variant, when the component's own CSS styles it.
- **Where it is picked:**
  - **Edit bar:** always behind one "Variants" button, with a dropdown per choice and a checkbox per yes/no (`components.ts:595-646`, `variant-fields.ts:75-114`). This changed from "past two" in commit `38ab21a7a`; the comment at `components.ts:20-22` still says "past two".
  - **What a pick writes:** one attribute edit on the instance, as one undo step (`components.ts:619-633`).
  - **A variant shown only somewhere** gets a note such as "narrow screens only", "dark mode only" or "narrow containers only" (`variant-fields.ts:54-72`).
- **Tone:** stays site-wide, in `tones.css`, and never in a component's CSS (`worker/site-conventions.ts:125`). It is offered on page bands only (`variant-fields.ts:96-104`).
- **"Only this one instance"** also becomes a variant, never a rule for one instance (components-and-builder map, Out of scope; research 02 rule 4).
- **Proven:** a hand-written `:host([data-size="large"]) h1 { … }` showed at once as "Size: Default / Large" (research 02).

**6b, still open: does the panel make new variants?** (The map's "Not yet specified".)
- Recommendation: yes. A "+ New look" item in the chip selector asks for a name and writes the first `:host([data-<axis>="<value>"])` rule into the component's CSS. The edit bar picks it up with no other change.
- For editing a look's rules, Edit component mode needs a way to show the look being styled. It has none today (research 02, other fault 4).

### 7. Elements outside components

- **Settled so far:**
  - "Blocks are styled by the site's own classes" (`CONTEXT.md:27-28`).
  - "A style panel or free per-element CSS editing" is out of scope (components-and-builder `map.md:56`).
  - The block builder writes only `flow`, `cards` and `btn`, and never guesses classes from the site's CSS (components-and-builder ticket 10, §3).
- **What the edit bar writes on a plain element today:**
  - **Div Layout:** swaps the `flow` and `cards` classes (`page-structure-controller.ts:216-226`).
  - **Text size:** writes a `text-*` class (`page-structure-controller.ts:228-250`; the classes are in `styles/utilities.css:27-33`).
  - **Button:** shows the `.btn` class variants (`components.ts:635`). The starter's `.btn` (`styles/sections.css:16-31`) has none, so the starter shows no Button variants.
  - **Tone** on page bands.
- **Conflict with "never inline styles":** when a site has no `text-*` classes, Text size writes `style="font-size: var(--text-l)"`, or an inline rem size (`src/native-text-size.ts:9-14`). That clashes with the map's rule. It doesn't happen on the starter, which has the classes. Worth a line in the build plan.

**7b, still open: may the panel edit or add a site class?**
- Lex wants Bricks-like class chips ("I want to see all the classes for the button and variants").
- On a plain element, those chips can only be site classes. Editing one rewrites the class's rule where the site defines it (`.btn` in `sections.css`), so every button changes. That is how Bricks global classes work.
- Research 02 advised against the old panel's "target the page's linked stylesheet by class chips". That advice was about component parts, which the old panel couldn't reach.
- Recommendation:
  - Allow it. Edit the class's existing rule in place, in its own file and layer.
  - "+ Class" on a plain element adds a new class with an empty rule in `styles/sections.css` (`@layer sections`).
  - Never write ids or per-element rules.
  - Lex should confirm, because this widens "styled by the site's own classes" from choosing a class to editing one.

### 10. Which files count as tokens today

- **For `var(--` suggestions, hover and go to definition:**
  - Every `--name:` declaration in every CSS file the editor has loaded counts (`src/page-builder/css-intelligence.ts:33-55`).
  - The shown page's stylesheets come first (`src/page-builder-host.ts:506-511`).
  - Only files the shown page loads are read (`src/native-site-runtime.ts:121-133`). This is research 02's fault 2, cause 2.
- **For Text size:** `--text-*`, `--font-size-*` and `--fs-*` on `:root` or `html` in the page's linked stylesheets (`src/native-text-size.ts:9-12`).
- **For agents:** "from `styles/tokens.css`" (`worker/site-conventions.ts:137`).
- **On the starter:**
  - `tokens.css` holds 33 design values (40 declarations counting the light-dark() pairs) in `@layer tokens`, grouped by comments: brand, colour roles, type, space, shape, measure.
  - `tones.css` adds helper values (`--tone-y`, `--tone-t`, `--tone-raw`, `--tone-surface`, …) that are not design values.
- **The choice is still Lex's** (research 02, choice 3). Recommendation, now that typing and right-clicking are separate:
  - **Typing suggestions:** every stylesheet the site links plus the open file's own properties, ranked first. This is today's set plus the missing files.
  - **The right-click design values list:** only properties on `:root` inside `@layer tokens` (or in `styles/tokens.css` when it has no layer).
  - **Grouping:** by name prefix, not by comments (ticket 07: no editor comments): colours (those the preview resolves to a colour), `--text-*`/`--font-*` type, `--space-*` space, `--radius-*` shape, the rest "Other". The old panel's Global styles used the same groups (research 02).
  - **Leave out** helper values such as `--tone-*`.

### 12. The 11 Components faults

- Research 02 gives the cause and the fix for each: the 4 that Lex named and 7 more found end to end.
- All 11 are still in the code at `a49729f24`.
- Sample checks: the toast text is still at `component-plans.ts:128,160`; the note listing raw selectors at `component-css.ts:693-698`; the repeated chip labels at `linked-styles-controller.ts:295-299`.
- **One correction:** research 02 points to `component-css.ts:612-639` for the code that copies site rules. The copying is in `withPageCss` (`:523-666`), with `slottedOnly` (`:668`) and `rewrite` (`:713`).
- What's left is priority, which is ticket 06's question.

## Open

### 2. Screen sizes: per-component containers or page width, and how many

- **Facts:**
  - **The starter uses page width:** one breakpoint, 720 px. It appears as `@media (max-width: 720px)` in `section-hero.css:86` and `section-split.css:130`, and its opposite, `@media (width > 720px)`, in `section-split.css:92`. Research 01 counted only the hero's.
  - **No container queries yet:** no `container-type` and no `@container` anywhere in the starter.
  - **Every component's host is a block** (`:host { display: block; }`), so each could be a size container.
  - **The canvas bar previews three widths:** Desktop (fills the canvas), Tablet 768 and Mobile 390, plus a typed width (`src/components/canvas-bar.ts:3-7`). Tablet is above 720, so it shows the wide layout.
  - **The editor already understands both kinds:** a variant inside `@container` reads "narrow containers only" (`variant-fields.ts:61-64`). The cascade marks a `@container` declaration whose query isn't met as `inactive` (`shared/cascade.ts:263,291,333`).
  - **Research 02, rule 5:** reuse the breakpoint the file already uses.
- **Why it's open:** the map lists it under "Not yet specified", and the code supports either.
- **Recommendation: two sizes, All and Narrow.**
  - On a component whose CSS already has a 720 px query (the section components), Narrow writes into that existing `@media` block. The look then stays in step with the page, and with the canvas Mobile preview.
  - On components without one, notably cards, Narrow writes `@container (width < 30rem)` and adds `container-type: inline-size` to `:host`. A card then fits a wide or a narrow grid cell.
  - Lex should choose between this mix and one rule everywhere. The mix is simpler for people; one rule is simpler to explain.

### 3. Hover and focus

- **Facts:**
  - **Hover is never guarded:** the starter has 12 `:hover` rules and none sits inside `@media (hover: hover)`. Examples: `section-hero.css:59,71-72`, `sections.css:28-29`, `site-header.css:40`.
  - **Keyboard focus is one site-wide ring:** `a:focus-visible, button:focus-visible` (`styles/elements.css:53-58`), plus `.skip:focus` (`utilities.css:23`). Components set no focus styles of their own.
  - **The editor already knows state rules:**
    - The preview collects `:hover`, `:active`, `:focus-visible`, `:focus-within` and `:focus` rules as state rules (`src/components/native-preview-runtime.js:2135-2137`).
    - The cascade marks their declarations `state` (`shared/cascade.ts:243,264,338`), and rule chips show the state (`linked-styles-controller.ts:296-297`).
    - Make component copies state rules along with the resting ones (`component-css.ts` header, lines 30-32).
  - **Nothing can force a state:** there is no way to show the hover look in the preview while editing it.
- **Why it's open:** the map's "Not yet specified", and research 01's choice 4.
- **Recommendation:**
  - Offer four states: Normal, Hover, Keyboard focus, Pressed.
  - **Hover** is written inside `@media (hover: hover)` (good-css) and also applies to `:focus-visible` unless split. Keyboard users then always see the change.
  - **Keyboard focus** on its own is rarely needed, since the site-wide ring covers links and buttons.
  - The preview needs a "show this state" switch (as in DevTools) before Hover can be edited by eye. That is new runtime work, small but real.

### 8. The starter's older CSS

- **Facts** (starter's shared and component CSS, `media-player.css` left out):
  - **Sizes in px only:** 46 px values and 0 rem. The type scale is in px, and its fluid steps grow with the window width alone, `clamp(24px, 3vw, 34px)` (`tokens.css:32-33`), so they don't follow the browser's text-size setting.
  - **Colours in hex:** 45 hex colours and no `oklch()`, except the colours `tones.css` works out.
  - **Mostly physical properties:** 13 `max-width`, 7 `margin-top`, physical `top`/`left` in `utilities.css` and `site-header.css`, against 8 logical ones.
  - **Hover unguarded:** 12 rules, as in question 3.
- **The starter is its own project** (`~/Projects/native-site-editor-starter`; `fixtures/actual-starter` is a copy).
- **Why it's open:** research 01's choice 5, and Lex hasn't answered it.
- **Recommendation:**
  - Convert it once, on the starter's own `dev`, as a site-quality task: rem and fluid `clamp()` with a rem part, `oklch()` roles, logical properties, guarded hover. Then refresh the fixture.
  - Until then, the panel writes good-css only in the declarations it touches and leaves the rest alone. Otherwise its first edits would show two styles side by side in the same file.

### 9. Site styles in a component's style list

- **Facts:**
  - The loader puts every page stylesheet into each component's shadow root (`fixtures/actual-starter/components/components.js:11-16`). Site rules really do style a component's insides.
  - The rule chips list every matched rule with no split by file (`linked-styles-controller.ts:99-139`). All chips look the same; a file name shows only when the rule isn't in the pane's file (`:299`).
- **Why it's open:** research 02's choice 1.
- **Recommendation:** with Lex's Bricks selector, the chips should be the element's own classes and variants (below), not rules. Site rules that also match fold into one quiet "site styles · N" chip that opens them in the bottom pane (choice a). The component's own file stays in the pane.

### 11. Clicking a swatch

- **Facts:**
  - The code editor's colour swatches and picker are loaded (`src/components/monaco.ts:116`). They show for literal colours only, such as `--brand: #2f6d3a` at `tokens.css:10`.
  - Picking a colour from a swatch would replace `var(--brand)` with a raw colour.
  - Nothing draws swatches for `var(--…)` today.
- **Why it's open:** research 02's choice 4.
- **Recommendation:** in the code, a swatch only shows the colour (choice a). Changing a colour belongs to the panel's design values, which edit the token in `tokens.css` with its light and dark pair (see 4). This also keeps right-click as the one way to the variables, as Lex asked.

## What our variants lack compared with WordPress block styles

WordPress offers named styles picked from a list with previews; our Variants are named looks picked from a list too. The gaps, from our side (research 08 covers WordPress itself):

1. **No previews in the edit bar.** Variants are plain dropdowns and checkboxes (`components.ts:638-645`); ticket 07 §5 said "no thumbnails". A previewing gallery already exists, though: Add card ▾ and a card's look chip render each card look (a card component or one of its variants) live with the site's CSS (`src/components/card-look-gallery.ts:12-18`, `src/page-builder/card-looks.ts:1-8`, `src/page-builder/thumbnail.ts`). Showing Variants for sections and buttons the same way is mostly reuse.
2. **Names come only from the value.** `image-left` reads "Image left" (`shared/variants.ts:567-571`). Ticket 07 §4 rules out annotation comments, so a look can't have a nicer name than its value.
3. **Looks can't be made, renamed or removed in the editor.** Each needs hand-written CSS: there is no "+ New look", and no rename across every page's instances. Rename across pages already exists for components (Edit component mode, build slice 76) and could be reused.
4. **The site-wide default can't be changed.** The default is always "attribute absent". A selector list such as `:host, :host([data-tone="light"])` can label a value "(default)" (`shared/variants.ts:346-349`), but making another look the default means editing CSS.
5. **Several choices, not one style.** A WordPress block takes one style. Ours can have several independent choices (Layout, Size, …), which is richer, but nothing previews the combinations.
6. **Plain elements get few looks.** Only Button (`.btn`) and page bands (Tone) are asked for. `variantsForClass` works for any class (`shared/variants.ts:557`), but the edit bar asks only for `btn` (`components.ts:635`). Heading, Paragraph and Image get none (ticket 10 §4).
7. **No style editing per look.** Edit component mode shows only the instance's current look and can't switch looks (research 02, other fault 4).
8. **Agents:** `get_site` lists variants, but there is no `set_variant` tool. Agents write the attribute with `edit_file` (ticket 05; `worker/site-conventions.ts:119`).

## How an element's classes are shown today

- **Edit bar label:** the kind in plain words. A class changes it only for `a.btn` ("Button") and media cards (`src/native-structure.ts:14-27`). The class itself is never shown.
- **Structure rows:** the kind and the element's text, with no classes (`src/native-structure.ts:50-56`). Component instances have an Attributes panel listing their raw attributes, `class` and `data-*` included, as editable name and value fields (`src/components/structure-editing.ts:363-374`, opened from `src/components/page-structure.ts:676-690`). Plain elements have none.
- **Rule chips above the bottom stylesheet pane** (`#secondary-rules`): one chip per matched rule, showing:
  - its selector (`.lead`, `.actions a`, `:host`);
  - where it comes from: `:host` or `::slotted`, the layer, `@media` or `@container`, and the state;
  - the file name, when the rule isn't in the pane's file;
  - a tooltip with every declaration marked won, overridden or state-only.

  Clicking a chip reveals the rule (`linked-styles-controller.ts:291-347`). This is the nearest thing to Bricks' selector, but it lists rules rather than classes, and site rules sit mixed in.
- **Controls that write classes without showing them:** Div Layout (`flow`/`cards`) and Text size (`text-*`) (`page-structure-controller.ts:216-250`).
- **The removed style panel** had class chips (research 02).

**Recommendation for the Bricks-like chip selector:** most of what it needs already exists.
- **On a part inside a component:**
  - **Chips:**
    - its own classes from the template (`.lead`);
    - its tag, when the tag is unique in the template;
    - one chip per variant value from `componentVariants` (`:host([data-layout="centered"])`, shown as "Layout: Centered").
  - **Matching selectors:** `compoundsOf` and `matches` in `component-css.ts:226,450` find which selectors match the component's own HTML (research 02's fix for fault 1).
- **On a plain element:**
  - **Chips:** its site classes (`.btn`, `.flow`), plus a chip for each class variant from `variantsForClass`.
- **Clicking a chip** points the bottom pane at that rule (see 5).
