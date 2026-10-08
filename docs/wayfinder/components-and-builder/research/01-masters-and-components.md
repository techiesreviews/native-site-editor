---
ticket: 01-research-masters-and-components
researched: 2026-10-08
branch: research/cb-01-masters-and-components (from origin/dev ee6d5d8)
---

# Inventory: shared masters, page parts and components in use

## Summary

1. **No masters exist anywhere.** No repo has `.editor/sections/`, `.editor/page-parts/` or `.editor/page-builder.json`, now or in its history: techies-reviews, the starter, `fixtures/`, and the default branches of lexvd-site and dogsfitandfun. Masters exist only as test data built inside the tests. *(measured)*
2. **The masters code has only ever been on `dev`.** It was added 2026-10-04/05 and never reached `main` (`origin/main` 0912c54, 2026-10-02, has none of the modules). So no production user can have masters. Conversion is a decision about code, not a data migration. *(measured)*
3. **Removing it is about 3,140 lines in 15 modules plus about 850 lines of `main.ts`** (module lines measured, `main.ts` lines estimated). `.editor/page-builder.json` has no reader outside the masters code: Add card does not use it. The file and its sidecar re-keying can go entirely.
4. **The Worker and MCP never touch masters.** `add_section` inserts section components only. After removal, the only agent-facing change is wording in `worker/site-conventions.ts`. *(measured)*
5. **Components in use:** techies-reviews has 16 tags on 106 pages, the starter has 9 on 6 pages, and the fixtures have 21. Every live template (techies-reviews and the starter) already uses whole-element slots. Only the frozen `fixtures/native-starter` and `fixtures/native-conventions` put the slot inside the element. *(measured)*
6. **Make component is hidden because the masters UI takes its place.** `nativePageActions: nativeSectionSaveControls` (`src/main.ts:642`) replaces it (`src/page-builder/components.ts:440-447`). Make component also still writes slots inside the element for text (`component-model.ts:1137-1144`), against the settled rule. *(measured)*
7. **With JS off, today's header/footer show no links.** On both sites, `<site-header></site-header>` and `<site-footer></site-footer>` hold 0 links in the page HTML. The starter's header collapses to 0 px, and techies-reviews shows an empty 64 px bar. *(measured, Chromium with JS disabled)*
8. **Slotting the nav keeps the links in the page HTML and visible with JS off.** But only a slot per link (`<a slot="link">` into `<nav><slot name="link">`) keeps the component's `nav a` styling. If the whole `<nav slot="nav">` is slotted, its links lose the component's styling even with JS on. *(measured)*
9. **A master's CSS breaks when it becomes a component, so conversion must move that CSS.** A master's CSS is scoped by its root class in a public stylesheet (`.intro h2`). Such rules still style the template's fallback but no longer reach slotted content. *(measured)*

## 1. What exists

### 1a. `.editor/sections/*.html` masters, `.editor/page-parts/*.html`, `.editor/page-builder.json`

| Where | Masters | Page parts | page-builder.json | How checked |
|---|---|---|---|---|
| techies-reviews, local (behind origin by 27) and `origin/main` 7123eed | none | none | none | `find`, `git log --all --name-only` (only `.editor/config.json` was ever committed) |
| native-site-editor-starter `main` 06126a8 | none | none | none | the same; history also has `.editor/legacy-components/*`, which is not masters |
| editor `fixtures/*` (all 8 + `cascade/*`) | none | none | none | `find fixtures -path '*/.editor/*'` finds only `config.json` ×5 |
| techiesreviews/lexvd-site, dogsfitandfun (default branch, GitHub tree API) | none | none | none | only `.editor/config.json` |

The masters that do exist are built inside the tests, seeded through `__demo/external-edit` (for example `tests/native-save/static-sections.ts:5-22`, which seeds `reusableSections` v1 from `DEFAULT_STATIC_SECTIONS`). Master paths referenced in tests (count of mentions): `.editor/sections/intro.html` 19, `about-hero` 12, `other` 3, `hero`/`contact` 2, `shared-section`/`header`/`about-more` 1, and `.editor/page-parts/site-head.html` 15, `site-header` 13, `site-footer`/`site-foot` 2, `other`/`navigation`/`header`/`footer` 1. *(measured, grep)*

Because nothing real exists, "which pages use each master" has no answer to give. For ticket 02, what matters is how *any* master would convert (see 1d).

### 1b. Components: techies-reviews (`origin/main` 7123eed, 106 pages)

The page count is the number of non-component `.html` files that contain the tag. *(measured)*

| Tag | Pages | Used inside | Slots | Notes |
|---|---|---|---|---|
| site-footer | 104 | — | none | 11 links only in the template |
| site-header | 98 | — | none | 86-line template: popovers, 2× `card-feature`, 12× `menu-link`, all nav links in the template |
| card-tutorial | 91 | section-cards | image, tag→card-note, meta, title, body, link | |
| section-cards | 91 | — | eyebrow, title, lead, link, default | |
| section-contact | 90 | — | eyebrow, title, body, action | |
| card-note | 86 | card-tutorial | text | |
| section-intro | 6 | — | eyebrow, title, lead | |
| site-prebuilt-header | 6 | — | title, download, sponsor, sponsor-link | the 6 prebuilt pages use this instead of site-header |
| code-drawer | 6 | — | html, css, js | |
| section-hero | 2 | — | eyebrow, title, lead, primary, secondary, media | |
| card-prebuilt | 2 | — | image, video, title | |
| section-feature | 1 | — | 9 | |
| card-feature | 1 | site-header | image, eyebrow, title, meta | |
| menu-link | 1 | site-header | icon, link, badge, desc | |
| tool-tip | 1 | — | default | |
| section-split | 0 | — | 6 | unused |

Every slot either wraps a whole element (`<slot name="title"><h2 …>…</h2></slot>`) or is an empty slot inside a wrapper (`menu-link`: `<span class="icon"><slot name="icon"></slot></span>`, filled by a whole `<svg slot="icon">`). None puts the slot inside text. On 89 pages there is also a plain `<section class="hero article flow">` repeated on each page, which could later become a Make component (dedupe) candidate. techies-reviews' `components.js` is the starter loader plus a color-scheme import, adopted stylesheets and reader-moved scroll handling.

### 1c. Components: the starter (06126a8, 6 pages) and fixtures

Starter: `site-header` 6, `site-footer` 6, `section-contact` 4, `card-note` 3, `card-project` 1 (3 instances), `section-hero` 1, `section-feature` 1, `section-intro` 0, `section-split` 0. All of them use whole-element slots. Header and footer have no slots, and their links are only in the templates (header 4 links, footer 3). *(measured)*

Fixtures (pages using each tag):
- `actual-starter`: same tags as the starter (an older copy; `components.js` differs).
- `native-cards`: card-note 2, card-project 1, site-header 3, site-footer 3.
- `native-conventions`: promo-card 1 and site-header 2. promo-card puts its slot inside the element (`<h2 …><slot name="title">`).
- `native-starter` (frozen): card-note, feature-block, project-card and site-button all put slots inside the element, with `data-key`; site-header and site-footer are used on 2 pages.
- `cascade/shadow`: info-box 1, no loader.
- `cascade/starter`: site-footer 1, no loader.

### 1d. Would a master convert cleanly to a custom element with whole-element slots?

This applies to any master, since none exist in real repos:

- **HTML: mostly clean.** A section master is one `<section class="<rootClass>">` (`static-sections.ts:125`, refused otherwise). A page part is one `<header>`/`<footer>` (`native-page-parts.ts:140`). Both match the loader's "section component = one `<section>`" rule (starter `components.js:121-124`), as do header/footer components. Headings, paragraphs, links and images become `<slot name><el/></slot>`. Linked copies on pages become instances whose fills are the copy's own elements. That keeps customised copies too, because every element can be slotted per page.
- **CSS: not clean (measured).** Master CSS lives in a public stylesheet, scoped by `rootClass` (`StaticSectionRecord.css` seed with `stylesheetPath`, `static-sections.ts:17-25`; defaults in `@layer sections`, `static-section-defaults.ts:11-55`). The loader clones the page's stylesheets into the shadow root (starter `components.js:107`). It adds `::slotted()` twins only to the component's own CSS (`components.js:101`). Probe: with `.intro-y h2 { letter-spacing: 7px }` in `site.css`, the fallback `<h2>` in the template got 7 px but a slotted `<h2 slot="title">` got `normal`. So conversion has to move or rewrite the `rootClass` rules into `components/<tag>/<tag>.css`, where the twins apply.
- **Copies are not linked by identity.** Page links are `{ target, basis }` (`native-section-links.ts:36-37`, `native-page-parts.ts:50`). A copy is found by its authored id or exact opening tag. So "which pages use it" for a real master would come from resolving links (`resolveNativeSectionLinks`, `native-section-links.ts:128`; `resolvePagePartLinks`, `native-page-parts.ts:296`), not from a tag search.

## 2. Code that reads or writes masters, and what breaks when it goes

The masters code is dev-only: `static-sections.ts` was added in 95a132c (2026-10-04), `native-shared-section.ts` in 969bfd5 and `native-page-parts.ts` in ece1fa9 (both 2026-10-05). None of them is on `origin/main`. *(measured)*

### 2a. Modules that go entirely (3,139 lines, measured with `wc -l`)

| Module | Lines | Role |
|---|---|---|
| `src/page-builder/static-sections.ts` | 532 | `reusableSections` v1/v2 catalogue: `SECTION_MASTER_FOLDER` (:45), `readSectionCatalog` (:219), `resolveStaticSection` (:236), `planStaticSectionInsert` (:308), `planStaticSectionSave` (:450), `planMakeSectionMaster` (:502) |
| `src/page-builder/native-page-parts.ts` | 594 | `.editor/page-parts/`, `reusablePageParts`, `pages[p].pageParts`: `planSavePagePart` (:373), link (:443), update copies (:501), unlink (:572) |
| `src/page-builder/native-section-links.ts` | 412 | `pages[p].sections` links: read (:110), resolve (:128), link (:214), update copies (:273) |
| `src/page-builder/native-section-master-controller.ts` | 318 | Edit-master session |
| `src/page-builder/native-shared-section.ts` | 158 | `planNativeSharedSection` (:79): Save shared for `<section>` |
| `src/page-builder/native-page-part-controller.ts` | 169 | page-part Edit session |
| `src/page-builder/sidecar-pages.ts` | 127 | `planSidecarPages` (:94): re-keys the JSON when pages move or are deleted |
| `src/page-builder/native-section-save.ts` | 127 | "Update saved section" |
| `src/page-builder/static-section-defaults.ts` | 105 | 4 built-in plain sections. Add no longer lists them: `nativeStaticSectionChoices` returns saved records only (`main.ts:2417-2425`) |
| `src/page-builder/source-target.ts` | 88 | copy locator; imported only by the modules above |
| `src/page-builder/page-builder-document.ts` | 68 | `EDITOR_PAGE_BUILDER_PATH` (:4) read/write |
| `src/components/native-shared-authoring.ts` | 196 | Save shared form (shows `.editor/sections|page-parts/<id>.html`, :84) |
| `src/components/native-master-preview.ts` | 109 | preview composition of a section master |
| `src/components/native-page-part-preview.ts` | 101 | the same for page parts |
| `src/components/master-banner.ts` | 35 | Done / Update copies line |

### 2b. Hooks in shared code (remove the hook; the host stays)

`src/main.ts` (about 850 lines in these spans, estimated from function boundaries):
- Imports at :82, :95-104.
- `nativePageActions: nativeSectionSaveControls` at :642. Removing it un-hides Make component (see 2d).
- Update saved section at :646-745.
- Master host and controllers, `isPrivateMasterPath`, banner, `nativeMasterIdentity` and `runMasterEdit` at :747-945.
- Read-only refusals while a master is open at :524, :537, :2169, :2173 and :2255.
- Edit-bar master context and "In a linked copy" chip at :2051-2068 (`nativeLinkedAncestor`, :2865).
- Master write guard in `applyNativeChange` at :2101.
- "Plain HTML sections" in Add (choices, notice, preview, thumbnail, `insertStaticSection`, `registerNativeCopy`) at :2406-2608. This also removes `insertExtraChoices`, `insertNotice` and `insertPreview` at :452-454.
- Shared roots in Structure (`nativeSharedFieldsRevision`, `nativeSharedRoot`, submit, disconnect, structure Edit) at :2641-2862.
- `masterEdit` passed to the preview at :3276 and :3927, and media ports at :3636.
- `withSidecarPages` at :5162-5212, called from `applyNativeOperation`.
- `EDITOR_PAGE_BUILDER_PATH` is pinned in settings and move pins (:3051, :6340) and read by the text index (:4066).

Other modules:
- `src/components/page-structure.ts`: the `NativeSharedRoot` type at :30-36, the lazy form at :579-580, and the offer and form at :614-670, :1047.
- `src/components/native-preview.ts`: `masterEdit` input and composition at :28, :91, :590-600, :1149 and :1192.
- `src/controllers/preview-selection-controller.ts`: master-session refusals at :36 and :119.
- `src/controllers/media-controller.ts`: private-master image guard at :40 and :121.

What breaks: nothing outside these hooks. `cards.ts`, `card-grid.ts` and the Add card path do not read `.editor/page-builder.json`. With the JSON gone, `withSidecarPages` has nothing to re-key, so page move, delete and Change URL get simpler. *(measured, grep)* Lean-fast-editor ticket 07 (`docs/wayfinder/lean-fast-editor/tickets/07-what-is-left-after-removals.md:24,30`) kept `.editor/page-builder.json` "for shared sections, page parts, section links, Add card". Only the masters still need it, and Add card is not among its readers.

### 2c. Tests affected

These counts are `test(`/`it(` lines found with grep, so they are approximate. *(measured)*

- **Unit, 12 files, about 139 tests:** section-masters 10, page-builder-document 6, native-shared-section 13, static-section-defaults 11, native-master-preview 7, native-section-master-controller 16, native-section-save 9, native-page-parts 11, static-sections 26, sidecar-pages 15, native-page-part-controller 4, native-section-links 11.
- **Browser, 16 specs, about 71 tests:**
  - native-save: master-visual-host 3, master-after-done-proof 1, master-assets-host 3, master-page-part-controls 2, master-host 5, shared-authoring-host 8, shared-link-host 7, master-code-collapse 2, static-section-save-host 11, static-sections-host 2, shared-files-lifecycle 5, master-controls 1.
  - The whole Playwright projects `native-shared-authoring` (9), `native-shared-structure` (4) and `native-page-part-preview` (page-part 3 + master-preview 5) go, with their `package.json` scripts (`test:browser:shared-authoring`, `-structure`, `-page-part-preview`).
- **Partial**, where an assertion has to change: `native-components.spec.ts:363-366,497`, `native-asset-references.spec.ts:9`, `native-add-catalog-actual.spec.ts:21,33` (asserts the JSON is *not* drafted), and the helper `tests/native-save/static-sections.ts`. The handoff notes (`p5-slices-handoff.md:61-67`) record 20 shared-authoring, shared-link and shared-files failures on dev that predate slice 8; those go with the specs.

### 2d. Make component today

- Hidden: `components.ts:440-447`. When `deps.nativePageActions` is set, which `main.ts:642` always does on a native site, those actions replace "Make component…". The comment at `components.ts:125-127` says that a native page is never turned into a component from the edit bar.
- Slot shape:
  - Text blocks get `<h2><slot name>text</slot></h2>`, and the page fills them with `<span slot>` (`component-model.ts:1137-1144`, documented at :1078-1093). Ticket 03/Make component has to change this to whole-element slots.
  - Stand-alone links and images already become whole-element slots (`:1129-1135`).
  - So running Make component on a starter-like `<header>` gives one slot per link (`skip`, `brand`, `link`, `link-2`…), and the links stay in the page HTML.
- `suggestTagName` maps `header`→`site-header` and `footer`→`site-footer` (`component-model.ts:1043-1056`).
- Add (+) and MCP `add_section` already copy fallbacks as whole elements (`src/native-insert.ts:31-56`).

### 2e. Worker and MCP

- `worker/mcp.ts:697-728` `add_section` accepts only a tag `get_site` marks `section: true`, and `src/agent-site.ts:476-492` inserts `nativeInsertEdit(… actions.template(tag))`. Neither knows about masters, `reusableSections` or `.editor/page-builder.json`. `shared/agent.ts:18,63-70` holds only the operation's fields.
- `worker/site-conventions.ts` never mentions masters. Two lines matter for this map:
  - `:52`: "The header and footer are components without slots". This changes if the header slots its nav (ticket 02).
  - `:69` contradicts `:58`. Line 69 says "add the tag to the loader and `site.css` (above)", but line 58 (and the loader) says nothing needs registering. Ticket 05 should fix this.
- `worker/hosts.ts:271` and `worker/starter.ts` read and write only `.editor/config.json`.

## 3. Header/footer with JS off

### Today

Probe: Chromium through Playwright, each site served statically, home page loaded with `javaScriptEnabled` true and then false. *(measured)*

| Site | JS | Links in `<site-header>` light DOM | Header links rendered | Header height | Footer links |
|---|---|---|---|---|---|
| starter | on | 0 | 4 (shadow) | 57 px | 3 (shadow) |
| starter | off | 0 | 0 | 0 px | 0 |
| techies-reviews | on | 0 | 7 (shadow) | 64 px | 10 (shadow) |
| techies-reviews | off | 0 | 0 | 64 px, empty (`site.css:1023-1029` reserves `min-block-size`) | 0 |

What a JS-off visitor loses, and what any crawler that does not run scripts never sees:
- all main and footer navigation;
- the "Skip to content" link (inside the shadow template in both sites);
- the brand/home link;
- in techies-reviews, the mega-menu popovers and their `card-feature`/`menu-link` content, and the color-scheme toggle.

The hide rule in `site.css` is inside `@media (scripting: enabled)` (starter `styles/site.css:18-22`), so it does not hide anything with JS off. There is simply nothing in the page HTML to show.

### With slotted links

Same probe, on a copy of the starter with two header variants. Both keep the links in the page HTML, and both show the 2 links with JS off (unstyled: underline, weight 400). *(measured)*

- **(a) One slot per link.** Template `<nav aria-label="Main"><slot name="link">…fallback…</slot></nav>`, page `<a slot="link" href="/#work">Work</a><a slot="link" href="/about/">About</a>`. With JS on, the links take the component's `nav a` rule through the loader's twin `nav ::slotted(a)` (no underline, 600, 12 px padding).
- **(b) The whole `<nav>` slotted.** Template `<slot name="nav"><nav>…</nav></slot>`, page `<nav slot="nav"><a>…</a></nav>`. With JS on, the links *lose* the component's `nav a` styling (underline, 400, 0 px). `::slotted()` reaches only the slotted `<nav>`, not its children. The page's own stylesheets would have to style them.

Both shapes follow "slots wrap the whole element". (a) is the shape Make component already produces for links (2d). The cost is that every page carries its own copy of the nav: 98 header pages and 104 footer pages on techies-reviews, 6 on the starter. So a nav change becomes a change to every page, unless the editor or an agent writes the same edit to all instances. That trade-off is ticket 02's to decide. *(The page counts are measured; the editing cost is an estimate.)*

## Method and pointers

- Repos read: the editor worktree at origin/dev ee6d5d8; techies-reviews `origin/main` 7123eed (extracted with `git archive`, because the local checkout is 27 commits behind); the starter `main` 06126a8 (up to date); GitHub tree API for the other techiesreviews repos.
- Probe scripts and site copies were in `/tmp/cb01-*` and are deleted. The JS on/off and CSS-scope results above are their output.
