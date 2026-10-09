# Build: components, variants and a block builder

The build plan for the [components-and-builder map](../map.md). Requirements, flow per slice, test plan and the decisions taken at handoff: [spec.md](spec.md). Each slice is one ticket in [tickets/](tickets/), one branch, about half a day or less, built on `dev` and deployed to preview only.

## Phases

1. **Removals** (6 slices)
2. **Component model** (16 slices)
3. **Make component and New component** (7 slices, one dropped)
4. **Block builder** (13 slices)
5. **Edit component mode, in place** (11 slices)
6. **Add card** (9 slices)
7. **Tone** (5 slices)

★ = a Claude agent builds it; the rest go to Sol (codex). Starter slices are commits on the `dev` branch of `~/Projects/native-site-editor-starter`. Slices 64 and 65 were added at handoff (Lex's decisions, 2026-10-09) and belong to phase 2.

**Design change (Lex, 2026-10-09):** Make component creates at once (no dialog, no making mode, no slim bar), named from its first heading, and lands in Edit component mode, where slots are changed with the slot chip and the component is renamed. Slice 22 was rewritten, 23, 24, 26, 44, 46, 49 and 66 reworded, 25 dropped and 76 added; see the spec's [decision 8](spec.md#decided-at-handoff-lex-2026-10-09).

## Slices

### Phase 1: Removals

| Slice | Builder | Blocked by |
| --- | --- | --- |
| [01 Remove the masters code and Save shared](tickets/01-remove-masters-and-save-shared.md) | sol | – |
| [02 Put Make component back on the edit bar](tickets/02-make-component-on-edit-bar.md) | sol | 01 |
| [80 Make component only on container elements](tickets/80-make-component-containers-only.md) | sol | 02, 19 |
| [03 Reword the conventions for the header, footer and skip link](tickets/03-conventions-header-footer-wording.md) | sol | – |
| [04 Cut the element catalogue to the six blocks](tickets/04-six-block-catalogue.md) | sol | – |
| [05 Starter: move the skip link into each page](tickets/05-starter-skip-link.md) | sol | – |
| [06 Starter: add the .btn class](tickets/06-starter-btn-class.md) | sol | – |

### Phase 2: Component model

| Slice | Builder | Blocked by |
| --- | --- | --- |
| [07 Slot plan: whole-element slots named by role](tickets/07-slot-plan-whole-elements.md) | claude ★ | – |
| [08 Slot plan: repeated groups and lists](tickets/08-slot-plan-repeated-groups-and-lists.md) | claude ★ | 07 |
| [09 Slot plan: nested instances and card links](tickets/09-slot-plan-nested-instances-and-stretched-links.md) | claude ★ | 07 |
| [10 Make component: the repeated item becomes a card component](tickets/10-card-becomes-component.md) | claude ★ | 08, 09 |
| [11 Variant parser: a component's own CSS](tickets/11-variant-parser-component-css.md) | sol | – |
| [12 Variant parser: site CSS, global attributes and class rules](tickets/12-variant-parser-site-css.md) | sol | 11 |
| [13 Variants in the edit bar](tickets/13-edit-bar-variant-controls.md) | claude ★ | 12 |
| [14 Variants in the code pane](tickets/14-code-pane-variant-suggestions.md) | sol | 12 |
| [15 Starter: variants on its components](tickets/15-starter-variant-examples.md) | sol | – |
| [16 Conventions: one Components chapter for agents](tickets/16-conventions-components-chapter.md) | claude ★ | 03 |
| [17 Starter: the Components chapter in AGENTS.md](tickets/17-starter-agents-components-chapter.md) | sol | 16, 05 |
| [70 Conventions: fix the Components chapter where the starter showed it wrong](tickets/70-chapter-fixes-after-starter.md) | sol | 16, 17, 68 |
| [18 Drift test for the starter's AGENTS.md](tickets/18-agents-md-drift-test.md) | sol | 17, 70 |
| [19 MCP: make_component](tickets/19-make-component-mcp-tool.md) | sol | 10 |
| [20 MCP: get_site lists variants](tickets/20-get-site-variants.md) | sol | 12 |
| [71 Variants: leave out script-set attributes in the editor; write yes/no the way the CSS reads it](tickets/71-variant-followups.md) | sol | 13, 20 |
| [74 Starter: base resets skip slotted parts](tickets/74-starter-resets-skip-slotted.md) | sol | – |
| [64 Make component copies the element's page CSS into the component](tickets/64-make-component-carries-css.md) | claude ★ | 10 |
| [65 Starter: the card link rule](tickets/65-starter-card-link-rule.md) | sol | – |
| [67 Starter: title links look like the title, stretched only in cards](tickets/67-starter-title-link-look.md) | sol | 65 |
| [68 Starter: card title links stretch inside a section component's items slot too](tickets/68-starter-card-links-in-components.md) | sol | 67 |

### Phase 3: Make component and New component

| Slice | Builder | Blocked by |
| --- | --- | --- |
| [21 Names made valid as typed](tickets/21-name-normalising.md) | sol | – |
| [22 Make component creates at once and opens Edit component mode](tickets/22-make-component-creates-at-once.md) | claude ★ | 02, 10, 21, 64 |
| [23 The slot chip: one control for the label and Structure](tickets/23-slot-chip.md) | claude ★ | 41 |
| [24 Slot chips rename in place](tickets/24-slot-chip-rename-in-place.md) | claude ★ | 23 |
| ~~[25 Making mode in Structure: frame and slot badges](tickets/25-making-mode-structure.md)~~ dropped, folded into 46 | – | – |
| [26 Make component from Structure and right-click](tickets/26-make-component-entry-points.md) | sol | 22 |
| [72 Undo and redo of steps that create files are all or nothing](tickets/72-atomic-redo-with-files.md) | claude ★ | – |
| [27 + New component in Add](tickets/27-new-component-in-add.md) | sol | 21 |

### Phase 4: Block builder

| Slice | Builder | Blocked by |
| --- | --- | --- |
| [28 The block rail beside Structure](tickets/28-block-rail.md) | sol | 04 |
| [29 Heading level from position](tickets/29-heading-level-from-position.md) | sol | 04 |
| [30 Click a block to insert it by selection](tickets/30-click-insert-by-selection.md) | claude ★ | 28, 29 |
| [31 Edit bars for Div, Button and Image blocks](tickets/31-block-edit-bars.md) | sol | 04, 12 |
| [32 The preview reports nested containers](tickets/32-nested-container-geometry.md) | sol | – |
| [33 Drop target model](tickets/33-drop-target-model.md) | claude ★ | 32 |
| [34 Sections snap between page bands](tickets/34-section-snap.md) | sol | 32 |
| [35 Drag blocks from the rail onto the canvas](tickets/35-canvas-drag-new-blocks.md) | claude ★ | 28, 33, 34 |
| [73 Edit bar: update the controls spec for Make component; call a.btn a Button](tickets/73-edit-bar-spec-and-button-label.md) | sol | – |
| [36 Blocks drag themselves](tickets/36-drag-existing-blocks.md) | claude ★ | 35 |
| [79 Click selects, double-click edits, everywhere on the page](tickets/79-click-selects-double-click-edits.md) | claude ★ | 36 |
| [81 Delete key removes the selected element; no delete icon on Structure rows](tickets/81-delete-key-and-no-row-delete.md) | sol | 79 |
| [83 Refusal reasons show on screen](tickets/83-visible-refusals.md) | sol | – |
| [82 Move any element anywhere HTML allows](tickets/82-move-any-element.md) | claude ★ | 36, 37 |
| [37 Structure mirrors drags and takes depth from x](tickets/37-structure-mirror-and-x-depth.md) | claude ★ | 35 |
| [38 Folded Structure rows spring open](tickets/38-spring-open-rows.md) | sol | 37 |
| [39 Alt+←/→ move out of and into containers](tickets/39-alt-arrow-depth-keys.md) | sol | – |
| [78 Alt+↑/↓ moves any block among its siblings on the canvas](tickets/78-alt-up-down-siblings-on-canvas.md) | sol | 39 |
| [40 Drops into an instance's items slots](tickets/40-items-slot-drops.md) | claude ★ | 30, 33 |

### Phase 5: Edit component mode, in place

| Slice | Builder | Blocked by |
| --- | --- | --- |
| [41 Edit component mode: in place, no flicker](tickets/41-edit-mode-shell.md) | claude ★ | 01 |
| [42 Edit component mode: edit the template's text in place](tickets/42-edit-mode-fixed-text.md) | claude ★ | 41 |
| [85 The edit bar never covers the text being edited](tickets/85-edit-bar-never-covers-text.md) | sol | – |
| [43 Edit component mode: build with the rail](tickets/43-edit-mode-blocks.md) | claude ★ | 41, 35, 40 |
| [44 Edit component mode: the slot chip in the edit bar label](tickets/44-edit-mode-slot-chip-label.md) | sol | 41, 24 |
| [45 Slot changes rewrite the template and every page at once](tickets/45-slot-change-rewrites-pages.md) | claude ★ | 44 |
| [46 Edit component mode in Structure](tickets/46-edit-mode-structure-badges.md) | sol | 44 |
| [47 Edit component mode: open a nested card component](tickets/47-edit-mode-nested-card-drill.md) | sol | 41 |
| [48 Fixed parts are locked on the page](tickets/48-locked-fixed-parts-on-page.md) | sol | 41 |
| [49 Make component and + New component open Edit component mode](tickets/49-create-lands-in-edit-mode.md) | sol | 41, 22, 27 |
| [66 Right-click slot items in Edit component mode](tickets/66-slot-context-menu.md) | sol | 24, 26, 44 |
| [76 Rename the component from Edit component mode's bar](tickets/76-rename-component-in-edit-mode.md) | claude ★ | 41, 45, 72 |

### Phase 6: Add card

| Slice | Builder | Blocked by |
| --- | --- | --- |
| [50 Add card adds the slot's card component](tickets/50-add-card-adds-card-component.md) | claude ★ | 40 |
| [51 Card fill mapping](tickets/51-card-fill-mapping.md) | sol | – |
| [52 Link to a page… on a new card](tickets/52-link-to-page-combobox.md) | claude ★ | 50 |
| [53 Fill the card from a page, with the info strip](tickets/53-fill-card-and-info-strip.md) | claude ★ | 51, 52 |
| [54 Create page from the card's combobox](tickets/54-create-page-from-combobox.md) | sol | 53 |
| [55 Card links follow the card](tickets/55-stretched-link-on-non-link-grids.md) | sol | 53, 09 |
| [56 Add card ▾: choose the card's look](tickets/56-add-card-look-gallery.md) | claude ★ | 50, 12 |
| [57 Swap a card's look and keep its content](tickets/57-look-chip-swap.md) | claude ★ | 56, 53 |
| [58 Starter: a second card look](tickets/58-starter-card-looks.md) | sol | – |

### Phase 7: Tone

| Slice | Builder | Blocked by |
| --- | --- | --- |
| [59 Tone formulas and the contrast sweep test](tickets/59-tone-formula-sweep-test.md) | sol | – |
| [69 Tone: cap the band surface's chroma to sRGB](tickets/69-tone-chroma-cap.md) | sol | 59 |
| [60 Starter: four tones from one brand colour](tickets/60-starter-tone-rules.md) | claude ★ | 59, 69 |
| [75 Starter: pages follow the visitor's light or dark setting](tickets/75-starter-follows-visitor-scheme.md) | sol | 60 |
| [77 Conventions: a band with no tone follows the page](tickets/77-chapter-tone-default.md) | sol | 75 |
| [61 Tone in the edit bar, on page bands only](tickets/61-tone-on-bands-only.md) | sol | 13 |
| [62 Browser check of the starter's tones](tickets/62-tone-contrast-browser-check.md) | sol | 60 |
| [84 Nightly CI runs the @actual and @native-static groups](tickets/84-nightly-runs-tagged-groups.md) | sol | – |
| [86 Make native-site-settings.spec.ts:216 deterministic](tickets/86-site-settings-flake.md) | sol | – |
| [87 Discard changes moves into the Publish menu](tickets/87-discard-in-publish-menu.md) | sol | – |
| [63 Vendor the new starter for the preview editor](tickets/63-vendor-starter-for-preview.md) | sol | 05, 06, 15, 17, 58, 60, 65 |

## Finding the frontier

A slice is takeable when its ticket has `status: open`, an empty `assignee:`, and every ticket in `blocked_by` is `status: closed`. Take the lowest phase first, then the lowest number; slices on the frontier can run in parallel, each in its own worktree. Claim a slice by filling in `assignee:` before any work. A quick look:

```sh
cd docs/wayfinder/components-and-builder/build/tickets
grep -l '^status: open' *.md | xargs grep -l '^assignee: *$'   # open and unclaimed
grep -l '^status: closed' *.md                                # done
```

Then keep the open, unclaimed tickets whose `blocked_by` names only closed ones.

At the start the frontier is: [01](tickets/01-remove-masters-and-save-shared.md), [03](tickets/03-conventions-header-footer-wording.md), [04](tickets/04-six-block-catalogue.md), [05](tickets/05-starter-skip-link.md), [06](tickets/06-starter-btn-class.md), [07](tickets/07-slot-plan-whole-elements.md), [11](tickets/11-variant-parser-component-css.md), [15](tickets/15-starter-variant-examples.md), [21](tickets/21-name-normalising.md), [32](tickets/32-nested-container-geometry.md), [39](tickets/39-alt-arrow-depth-keys.md), [51](tickets/51-card-fill-mapping.md), [58](tickets/58-starter-card-looks.md), [59](tickets/59-tone-formula-sweep-test.md), [65](tickets/65-starter-card-link-rule.md).

The decisions Lex took at handoff are listed in the [spec](spec.md#decided-at-handoff-lex-2026-10-09); tickets cite them as "decided at handoff, N".
