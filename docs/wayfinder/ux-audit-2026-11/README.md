# November editor UX prototypes

Open [the index](prototypes/index.html) directly. Every page contains its own CSS and JavaScript, starts on Today, and has After, System / Light / Dark, and Play a step controls. Comparison and guidance controls are explicitly marked as mock-up controls outside the editor. All eleven reuse catalogue prototype 51’s real tree row markup, tree CSS, icons, component and slot badges, selection styling and workspace layout. The full bakery page has a header, hero, inline bread illustration, product list, contact section and footer. No server, build, login, network request or application change is required. Data is simulated and resets on reload. These are proposals for Lex to try, not approved editor changes.

The baseline is the local audit at `f2dfe9d27`, captured on 19–20 November 2026. The audit's working selection colours, component boundaries, slots, canvas presets and independent source navigation are retained rather than presented as missing capabilities. Today is a focused reproduction, not a full editor emulator. Research-only proposals show the existing route or missing capability without inventing an audit defect.

| Proposal | Why | Evidence | Size | Open choice for Lex; safe default used |
| --- | --- | --- | --- | --- |
| [1. Element row actions](prototypes/01-row-menu.html) | Work in the tree without moving to the canvas; enlarge actual targets while keeping slim icons. | NSE-03 and NSE-08; audit confirmed canvas actions already work. | Small | Which actions appear first? Keep Make component, then Duplicate, Move up/down, Remove last with confirmation. |
| [2. Link popup placement](prototypes/02-link-popup.html) | Keep selected words visible while entering the address. | NSE-04. | Small | Preferred side? Below the full text block, above when space is tight. |
| [3. Canvas page identity](prototypes/03-canvas-page.html) | Name the visible page immediately after following a page link. | NSE-06; independent source navigation is intentional. | Small | Separate source title? Keep it in the source pane, unchanged until that file is opened. |
| [4. Media details and unfinished descriptions](prototypes/04-media-details.html) | Keep desktop fields near the top and preserve an unfinished form through Back. | NSE-01 and NSE-07; Save details is an intentional transaction. | Medium | How long to retain unfinished text? While navigating this Media session; explicit Discard restores saved words. |
| [5. Paste with structure](prototypes/05-clean-paste.html) | Keep paragraphs, lists, emphasis and safe links while dropping foreign styling. | NSE-05; Pinegrow, Webstudio, Webflow, Squarespace. | Medium | Default paste mode? Keep structure, with Plain text on the same control; one Undo restores the previous content. |
| [6. Unique anchors on duplicate](prototypes/06-unique-anchors.html) | Avoid ambiguous section links; keep copied internal references pointing to the copy. | NSE-02. | Medium | Rename or omit anchors? Add the next available suffix; show the resulting name on the new section immediately. |
| [7. Multi-selection and structure](prototypes/07-multi-select.html) | Wrap, unwrap, copy and paste sibling elements without rebuilding them. | Research patterns 4, 9, 10: Bricks, Builder.io, Bootstrap Studio, WordPress, Webstudio, Etch. Audit did not find whole-element operations. | Large | Selection gesture? Shift/Ctrl/Cmd click plus a touch selection toggle. Restrict this first sketch to valid sibling elements in one page-owned section. |
| [8. Extend command search](prototypes/08-command-search.html) | Keep existing primitive insertion; add page element search and selection actions to the same palette. | Research recommendations 7/8: Webflow, Webstudio, Bricks; existing `src/page-builder/palette-catalog.ts` and catalogue prototype 59. | Medium | Search scope? Current page for element search; retain existing page/component/action commands. No second palette. Add Heading and Add Paragraph already exist on Today; only finding elements and selection actions are new. |
| [9. Shared-change preview](prototypes/09-shared-change.html) | Inspect each affected page before saving a shared component change. | Research recommendations 13/14 and pattern 19: Webflow, Webstudio, Etch, Pinegrow; audit verified shared headers on Home/About. | Large | Mandatory review? Only at shared-save boundary; page list opens each preview and Cancel keeps the draft. |
| [10. Client edit bar](prototypes/10-client-bar.html) | Let a designer preview exactly which text, links and images a client may change. | Research recommendation 12: Pinegrow, Webstudio, Webflow, Bricks; Lex's 2026-11-09 question. Audit verified existing guest text editing. | Large | Permissions and publishing? Text/link/image allowlist per page; no structure or publishing controls. Real enforced sharing remains a separate implementation. |
| [11. One value's style source](prototypes/11-style-source.html) | Trace the winning value through site token, component, element and screen width, and remove only the chosen override. | Research recommendations 5/6/11 and patterns 14/15/17: Webflow, Webstudio, Bricks, Plasmic. Styling v3 already has scope chips, inherited placeholders, Clear and responsive fields. | Medium | Entry point? One Padding source control; Reset removes an override and reveals inheritance. Do not redesign v3 or repeat its panel. |

## Boundaries and assumptions

- No proposals dropped. Persisting Undo across reload (NSE-09) was not in the eleven requested prototypes; existing prototype Undo demonstrates one action per step, not persistent history.
- File details keeps its explicit Save details transaction. Other edits apply immediately to the simulated draft. Shared preview gates saving, not typing. No toasts, banners or explanatory strips were added to editor controls.
- The styling v3 comparison was read before prototype 11. It already offers component/site scopes, width chips, property Clear, group Clear, token suggestions and an inherited effective value. Only the missing per-value provenance chain is new. Today shows the shipped CSS/source route; v3 is planned, not shipped.
- Selection can span different depths and parents; Wrap is limited to adjacent siblings with compatible ownership; Copy requires compatible siblings, and Paste checks the destination (list items stay in lists); no claim is made about cross-component selection, slots, invalid nesting, a real system clipboard or permission enforcement. Client mode is a UI sketch, not an access-control implementation.
- Unfinished media descriptions survive Back and reopening within this page, not browser reload. Anchor suffixing checks all simulated section names; only copied subtree links are rewritten. Production implementation must handle every descendant ID and reference type.
- Real fonts cannot be fetched offline. Inter and Roboto Mono are named with system fallbacks. The editor's blue/component violet and light/dark tokens come from the existing catalogue, with component markup adapted into inline HTML because importing application modules would require a build.
- Feature list: no change (standalone planning pages do not alter a shipped editor feature; task forbids changes outside this folder). `kit ux` has no matching feature to try. `kit shots --spec` requires a scenario under `.scratch/`, outside the permitted authored-file scope; its rejection is recorded, not bypassed.

## Sources

- Audit: the lead’s November 19–20 local UX audit, including **What already works well** and **Could not reach**. Its nine findings are referenced by NSE identifiers in the table above.
- Research: the lead’s **How other visual editors handle elements and components** report (15 recommendations, 25 patterns, November 19–20). Relevant tools and pattern numbers are named in the table above.
- Catalogue shells: `../atomic-catalogue/prototypes/51-page-structure.html` and `../atomic-catalogue/prototypes/59-command-palette.html`.
- Existing styling v3: `../styling/prototypes/03-styling-panel.html`, especially `effective`, `chipsHtml`, `propRow` and the property/group clear handlers.

## Validation

The generated HTML opens directly. `build-prototypes.py` maintains the inline copies from the repository’s existing catalogue 51; regenerating is optional and does not alter that reference.

```sh
python3 docs/wayfinder/ux-audit-2026-11/build-prototypes.py
ASE_OWNER=gpt-nse-ux-protos scripts/agents/kit unit docs/wayfinder/ux-audit-2026-11/round-two.test.ts
nice -n 15 node docs/wayfinder/ux-audit-2026-11/browser-check.mjs
nice -n 15 node docs/wayfinder/ux-audit-2026-11/review-regressions.mjs
```

The shell checks failed 0/11 before round two, then passed 11/11. The browser script launches and closes one owned Chromium instance, serially checks 88 combinations (eleven pages × two widths × Today/After × light/dark), plays every guided step, exercises 44 additional keyboard flows, checks visible state and horizontal overflow, and saves screenshots only under the ignored runtime folder `.scratch/ux-round2/`. It makes no server or outside requests. This is manual prototype validation, separate from production application tests. Final results are recorded in validation.md and the PR.
