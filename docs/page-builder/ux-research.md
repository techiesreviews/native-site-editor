# UX research for the page builder

Researched by GPT Astra (Codex, web search) on 2026-10-03 for the dev page-builder work.

**Prioritise confidence before breadth:** users must know what they selected, what an edit affects, where new content will appear, and whether changes are live.

This report draws on the [page-builder plan](docs/page-builder/README.md), [domain definitions](CONTEXT.md), screenshot listing, and 11 representative PNGs. Research checked 3 October 2026. Competitor documentation establishes patterns, not comparative usability superiority; recommendations and predicted failures below are hypotheses to test.

The screenshots already show strong foundations: insertion previews, component instance counts, breadcrumbs, keyboard help, and card-plus-page creation. The clearest discrepancy is the visible **Publish** button versus the documented distinction between saving commits and deployment. Screenshots cannot establish its actual behaviour.

**1. Twelve UX principles**

| Principle | Do / don’t | Application here and evidence |
|---|---|---|
| **1. Make actions visibly consequential** | Do show immediate results; don’t leave users searching for changed content. | After insertion, select and reveal the element in canvas and structure; preserve orientation. [NN/g: direct manipulation](https://www.nngroup.com/articles/direct-manipulation/). |
| **2. Make selection depth explicit** | Do distinguish container, component and child; don’t make repeated clicking unpredictable. | Show one authoritative selection, a quieter hover outline, and clickable ancestor breadcrumbs. [Figma selection](https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects). |
| **3. Explain scope before editing** | Do label shared effects; don’t imply every visual edit is local. | Show “This instance,” “Shared component,” or “12 matching elements.” Webflow class edits affect every instance: a predictable beginner risk, not evidence of measured failure rates. [Webflow classes](https://help.webflow.com/hc/en-us/articles/33961311094419-Classes). |
| **4. Never require precise dragging** | Do provide click and keyboard alternatives; don’t make tiny gaps the only target. | Add Move before/after/inside commands and large drop targets. Keyboard support alone does not replace a pointer alternative. [W3C dragging guidance](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements). |
| **5. Prefer recognition over recall** | Do show thumbnails and named actions; don’t require slash commands or CSS vocabulary. | Keep Add visible; describe components by purpose, with HTML tags secondary. [NN/g: recognition](https://www.nngroup.com/articles/recognition-and-recall/). |
| **6. Disclose complexity progressively** | Do lead with content, layout presets and tokens; don’t expose every CSS property simultaneously. | Keep Monaco available while remembering panel sizes; expand advanced controls on demand. [NN/g: progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/). |
| **7. Show responsive inheritance** | Do distinguish content changes from viewport overrides; don’t imply mobile is an independent page. | Label actual media-query scope and reset overrides explicitly. Wix documents that content and structural changes can cross breakpoints. [Wix breakpoints](https://support.wix.com/en/article/studio-editor-designing-across-breakpoints). |
| **8. Make experimentation reversible** | Do offer visible, named Undo; don’t make recovery depend on Git knowledge. | “Undo create project” should reverse its page, card and collection updates together. [NN/g: user control](https://www.nngroup.com/articles/user-control-and-freedom/). |
| **9. Prevent invalid actions contextually** | Do constrain invalid nesting and duplicate URLs; don’t explain preventable errors afterward. | Explain unavailable destinations and offer valid alternatives without silently relocating content. [NN/g: preventing slips](https://www.nngroup.com/articles/slips/). |
| **10. Treat absence as information** | Do explain empty, filtered and hidden states; don’t display unexplained blank space. | Distinguish “No projects yet,” “No matching projects,” and “Hidden on mobile.” [NN/g: empty states](https://www.nngroup.com/articles/empty-state-interface-design/). |
| **11. Report persistence honestly** | Do distinguish draft, saved and live; don’t equate a successful commit with deployment. | Display branch, saved version and verified deployment status; use “Status unavailable” when necessary. [NN/g: system status](https://www.nngroup.com/articles/visibility-system-status/). |
| **12. Teach during meaningful work** | Do provide contextual assistance; don’t front-load a feature tour. | Teach selection while editing a heading, scope while changing a component, and saving after a real edit. [NN/g: contextual onboarding](https://www.nngroup.com/articles/onboarding-tutorials/). |

**2. Interaction patterns to copy**

These are adaptations for native HTML/CSS, rather than proposals to import competitors’ storage or runtime models.

| Area | Recommended interaction |
|---|---|
| **Selection and nested selection** | Adopt Figma’s click-to-select, double-click/Enter-to-descend and Shift+Enter-to-parent; once a text element is selected, Enter starts typing. Provide “Select under pointer” for overlaps. Synchronise canvas, structure and source; retain hidden elements in the tree, as [Webflow Navigator](https://help.webflow.com/hc/en-us/articles/33961320786451-Navigator) does. |
| **Inserting** | Use one insertion system behind inline **+**, Add, slash and palette. [Gutenberg](https://wordpress.org/documentation/article/adding-a-new-block/) offers contextual insertion and before/after actions; [Framer](https://www.framer.com/help/articles/how-to-add-an-iframe-or-embed-script/) supports searchable insertion and dragging. Keep live thumbnails. State “Inside Hero, after description” before insertion. Slash should activate in an empty text block, never intercept normal code typing. |
| **Moving/reordering** | Copy [Gutenberg’s](https://wordpress.org/documentation/article/moving-blocks/) move controls alongside canvas/tree dragging. Show parent and sibling position separately. [Fluid Engine](https://support.squarespace.com/hc/en-us/articles/6421525446541-Edit-your-site-with-Fluid-Engine) supplies visible grid guidance; adapt guidance to document flow, avoiding arbitrary coordinates for ordinary sections. |
| **Text editing** | Keep selection and typing visibly distinct. Use a stable contextual toolbar for emphasis and links, following [Notion](https://www.notion.com/help/guides/writing-and-editing-basics). Preserve semantic headings and pasted paragraph structure. Offer an explicit Done action for multiline editing; explain Esc’s cancellation behaviour. Link clicks select while editing; “Open linked page” navigates. |
| **Components and instances** | Default to editable content properties. [Figma properties](https://help.figma.com/hc/en-us/articles/5579474826519-Explore-component-properties) consolidate permissible changes; [Framer variants](https://www.framer.com/academy/lessons/component-variants-in-framer) expose alternatives on instances. Separate **Edit shared design** from instance content, with affected pages shown. Keep variants grounded in existing attributes/classes. Retain the screenshot’s detach explanation, adding a visual preview of styling loss. |
| **Developer-provided components** | [Builder.io](https://www.builder.io/c/docs/visual-editor) separates insertion, layers, styling and data; [Plasmic](https://www.plasmic.app/developers) brings developers’ components into visual workflows. Copy curated, friendly controls and editable slots. Derive capabilities from existing web components; keep editor guidance outside published markup. |
| **Responsive editing** | Combine named viewport shortcuts with arbitrary widths. [Etch](https://docs.etchwp.com/interface/responsive-controls) keeps responsive preview close to CSS; [Framer](https://www.framer.com/help/articles/setting-up-your-framer-site-for-scale/) recommends flexible stacks. Offer Row, Stack and Grid presets backed by normal CSS. Show inherited/overridden values and exact query scope; respect the repository’s cascade instead of imposing desktop-first rules. |
| **Styling for non-designers** | Lead with brand colours, type roles, spacing tokens and layout presets. Then reveal box model, selectors and raw values. Copy [Webflow’s](https://help.webflow.com/hc/en-us/articles/33961362040723-Style-panel-overview) affected-element counts and inheritance inspection, using text as well as colour. Explain “why this value wins”; do not silently manufacture another class when specificity prevents a change. |
| **Collections/loops** | [Webflow lists](https://help.webflow.com/hc/en-us/articles/33961294051347-Collection-list) distinguish source, repeated item, filters and empty state; [Framer’s guidance](https://www.framer.com/help/articles/setting-up-your-framer-site-for-scale/) recommends CMS for repeated content. Here, say “Projects from /work/,” with sorting, limits and visible result counts. Separate **Edit project** from **Edit card design**. Route bound text edits to page metadata in the Source editor, never baked output. Page settings › Fields was removed in P1.4. Explicit visibility conditions were removed in P1.6; empty section slots hide automatically. |
| **Page creation** | Preserve the existing **Create page and card** flow. Show title, suggested URL, template and collection eligibility together. In automatic collections, create the page and regenerate its listing; avoid inserting a second manual card. Validate collisions and make the whole action undoable. |
| **Navigation between pages** | Maintain distinct Pages and Files views. Show readable titles plus paths, recent pages, Back, and a visible linked-page action. Preserve each page’s scroll/selection. Distinguish creating a page, including it in a collection, and adding it to site navigation. |
| **Undo/history** | Coordinate canvas, properties and Monaco into one understandable edit chronology. Group continuous typing sensibly; label the next undo operation. Separate unsaved action history from commit history. Restoring a saved version should produce reviewable drafts rather than silently overwrite newer work. |
| **Save/publish confidence** | Show draft count, affected pages and dependent files before committing. Explain whether saving triggers deployment for this branch. Report Saved, Building, Live or Failed only from available evidence. Because editing preview omits site scripts, provide a clearly labelled route to test runtime behaviour. |
| **Onboarding/empty states** | Retain the screenshot’s three starter sections, but replace “This page’s `<main>` is empty” with “Add your first section.” For repositories without components, offer basic elements rather than an empty library. Use the existing setup checklist to guide first edit → save → verify. |
| **Keyboard shortcuts** | Keep the existing help sheet; show shortcuts beside menu actions. Scope ⌘K carefully: link editing during text selection, palette on canvas, Monaco conventions in code. Add searchable commands such as “Find hidden elements.” Preserve visible focus, return focus after closing panels, and avoid intercepting ordinary typing. |

**3. Usability test plan**

Run an initial formative round with **six noncoding marketeers and five developers**, mixing prior builder experience. Use a disposable site containing nested components, shared styles, filtered projects and a mobile-hidden element. Test unreleased features with prototypes. Allow 60–75 minutes; reset fixtures between tasks where learning would distort results.

Record unassisted/assisted completion, time, wrong-scope edits, misdrops, recovery, and post-task ease (1–7). Ask participants to predict affected pages/viewports before consequential edits. Moderator hints count as assistance.

**Marketeer tasks**

| Task | Success criteria | Observe |
|---|---|---|
| **1. Build a Services page from an empty page and replace its opening copy.** | Inserts an appropriate section and edits text without code or unintended structural changes. | Empty-state comprehension; first-click choice; selection versus typing. |
| **2. Add “Oak & Ash” with its own page and homepage project card.** | Correct URL, image and description; exactly one linked listing; page opens. | Page/record/card mental model; expectation of automatic inclusion. |
| **3. Put a testimonial between services and recent work.** | Correct parent and order; no overlap; can correct a misplaced insertion. | Drop prediction, repeated attempts, discovery of precise alternatives. |
| **4. Change one card’s CTA to “View project,” keeping other cards unchanged.** | Only intended instance changes; link remains correct. | Confusion between slots, shared template and nested text. |
| **5. Make the hero stack vertically on mobile.** | Mobile works at two nearby widths; desktop remains intended. | Breakpoint assumptions, content deletion as a layout workaround. |
| **6. Change the brand colour everywhere.** | Updates the relevant token and verifies another page. | Repeated local edits, token recognition, understanding of exceptions. |
| **7. Make the missing project appear on Home, then recover an accidentally deleted section.** | Identifies the filter/limit causing absence; restores section without losing other edits. | “Where did it go?” diagnosis and confidence in Undo. |
| **8. Add Services to navigation, save, and establish whether customers can see it.** | Correct navigation link; saved changes; accurately identifies live, pending, failed or unknown status. | Whether Save, Publish and preview are conflated. |

**Developer tasks**

| Task | Success criteria | Observe |
|---|---|---|
| **1. Find a selected heading’s markup and winning CSS rule; edit both ways.** | Correct source mapping; canvas/source remain consistent; unrelated code preserved. | Focus stealing, unexpected scrolling, cascade comprehension. |
| **2. Add an optional component image and expose it to a content editor.** | Instance control works; fallback/condition is understandable; shared scope clear. | Slot versus attribute confusion; need for editor-only metadata. |
| **3. Convert a project grid into a collection, newest first, limited to three.** | Correct bindings and conditions; adding a page regenerates ordinary HTML correctly. | Template/output confusion; missing fields; dependency visibility. |
| **4. Repair mobile overflow using existing CSS.** | Fix works across intermediate widths; desktop preserved; readable source diff. | Override provenance, specificity traps, unwanted class generation. |
| **5. Save after an overlapping upstream edit, then recover an earlier design.** | Reviews conflict without losing either contribution; understands commit versus draft restoration. | Trust, conflict wording, history boundaries, deployment assumptions. |

Provisional acceptance target: **at least five of six marketeers complete core content tasks unassisted; no participant unknowingly changes shared content or mistakes Saved for Live.** Treat these as iteration gates, not statistically representative rates.

**4. Fifteen improvements, ranked**

Impact estimates concern task success and recovery. Effort is relative: S = local interface change; M = coordinated interaction; L = cross-file/state work.

| Rank | Specific recommendation | Impact / effort |
|---:|---|---|
| **1** | Align the screenshot’s Publish action with actual commit/deployment behaviour; display persistent draft, saved and live status. | Very high / M |
| **2** | Add an edit-scope strip: instance, shared component, selector, collection template and applicable breakpoint. | Very high / M |
| **3** | Guarantee one Undo for page-plus-card creation and dependent collection updates; label Undo visibly. | Very high / L |
| **4** | Give every insertion an explicit destination; select and reveal the result afterward. | High / M |
| **5** | Add clickable Move before/after/inside controls alongside existing keyboard reordering and drag. | High / S |
| **6** | Standardise nested selection, breadcrumbs and source linking; visually separate hover from selection. | High / M |
| **7** | Separate collection item editing from template editing; prevent accidental edits to regenerated output. | Very high / L |
| **8** | Add inherited/overridden responsive indicators, query ranges and reset controls beside affected properties. | High / M |
| **9** | Put existing colour, type and spacing variables before raw CSS controls; preview shared effects. | High / M |
| **10** | Add hidden/filtered/conditional badges and “Why isn’t this visible?” explanations in structure and collections. | High / M |
| **11** | Extend page creation with duplicate-URL validation, template preview and collection eligibility feedback. | High / M |
| **12** | Keep selection properties prominent; move lengthy page metadata into Page settings and remember pane sizes. | Medium / S |
| **13** | Make text-editing state unmistakable; stabilise the toolbar and protect typing from global shortcuts. | High / M |
| **14** | Replace technical empty-state copy and provide useful basic-element choices when no components exist. | Medium / S |
| **15** | Extend palette synonyms, linked-page navigation and contextual shortcut hints; retain the existing help sheet. | Medium / S |

The README records inside-section insertion as previously withdrawn pending product confirmation. Treat its renewed interaction design as a scope decision before implementation; this research does not establish that the feature already exists.