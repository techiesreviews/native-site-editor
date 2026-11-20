# Round-two validation

The lead’s browser review accepted the original pages’ basic opening/switching but rejected their fidelity. Round two replaces the thin frames with catalogue 51’s actual tree renderer, row anatomy, styles, icon paths, component and slot badges, and workspace layout. Each page has a complete bakery site, System / Light / Dark controls and 4–5 guided steps plus Start again. The guidance is explicitly marked as mock-up controls outside the editor. Media also repeats those labelled mock-up controls above its modal editor surface, so the modal does not block the walkthrough.

## Browser evidence

One owned Playwright Chromium instance runs at a time, launched directly with `nice -n 15` under the lead’s explicit fallback authorization. It navigates local HTML files; no preview server or external request is needed. It closes in `finally`. Screenshots and contact sheets are in the ignored runtime folder `.scratch/ux-round2/`, not in git.

`browser-check.mjs` checks all 88 combinations: eleven pages × Today/After × 1440/390 CSS pixels × light/dark. It plays each walkthrough in order without forcibly closing popups between steps. It also runs 44 independent keyboard flows with real Tab navigation, Enter, Shift+F10, arrows and Ctrl shortcuts. It checks actual DOM state, popup/text geometry, target size and horizontal overflow. The image sheets were visually inspected for all eight comparison/width/theme groups; individual popup and modal images were inspected for layout details.

- Row menu: met — selected a nested section with real siblings and children; opened the row menu, duplicated, moved and removed it; verified 24+ px desktop and 44 px phone targets and synchronized canvas/tree state.
- Link popup: met — Today overlaps the real paragraph; After clears its rectangle. Keyboard Ctrl+K, address entry and Enter create the actual link.
- Canvas identity: met — following About leaves Today’s top control at Home; After shows About immediately while source remains index.html until the heading is selected.
- Media: met — desktop After places Description beside the image near its top. Unfinished text disappears through Back in Today, survives in After, and explicit Discard restores saved text. Keyboard save/reopen retains description and collection.
- Paste: met — Today flattens the prepared list; After retains two list items, emphasis and a link with no foreign style attributes. A ClipboardEvent at the caret retains existing copy; keyboard Undo removes the paste in one step.
- Anchors: met — repeated Today duplicates keep work; After produces work, work-2 and work-3, each with matching internal href. New anchor names appear on the control immediately.
- Multi-select: met — After selects heading/paragraph in tree and canvas, wraps a real Div, unwraps it, copies/pastes both, and selects a paragraph and deeper list item. Wrap is disabled across different parents.
- Command search: met — primitive insertion remains in Today. After finds the existing paragraph in context and duplicates that selection. Ctrl+K, typing and Enter work without a pointer.
- Shared preview: met — After opens both affected pages before saving, keeps the draft brand visible on About, and shows Saved on both pages on the control. Undo returns it to a pending shared save.
- Client bar: met — designer permissions and client preview sit over the complete page. Keyboard changes the approved heading and image; client mode hides structure controls and keeps the designer return control.
- Style source: met — source chain includes token, component, element and phone override; removing width override reveals 32 px, removing element override reveals 24 px, and Undo restores the override.

The illustration, text and page data are simulated; this is prototype validation, not proof of production permissions, clipboard interoperability, source persistence or physical-device behaviour. No application code changed.

## Checks and review

- `RESULT: ok doctor 11/11 checks passed`
- `RESULT: fail unit 0/11 (1 files) log .scratch/unit/20261120T002459-3923839.log` — expected red checks before the real shell and guidance existed.
- `RESULT: ok unit 11/11 (1 files) log .scratch/unit/20261120T003344-219238.log`
- `RESULT: ok skill-guard`
- `RESULT: ok prototype-browser 88 comparison states; 44 keyboard flows` — repeated after fixing issues found by browser and screenshot review; final runtime path is in the PR.

The initial browser runs caught a malformed style-source step and keyboard navigation being intercepted on native page-link buttons. Both were fixed before the completed matrix. The original round-one blocked-browser record is superseded by this real-browser evidence. Final Agent Kit review, PR and CI results are recorded in the PR handover.

## Review fixes proved in the browser

The first round-two Opus review (`20261120T004957Z`) found three P2 issues and smaller defects. `review-regressions.mjs` first failed all nine defect cases, then passed 9/9 after fixes. Three additional context checks first failed (9/12), then passed after preserving hero/component duplication and protecting component slots from structural operations. The extended 26-case run also confirms media-save focus, deselection by click and Space, Cancel/Escape return focus, matching navigation slots, stable footer content, compatible paste destinations, phone hit targets and every remaining browser gap named by the reviewer.

The fixed cases cover shared-save focus, root/slot action availability, anchored Shift-arrow selection, sequential anchor suffixes, typing Undo after a rich paste, required client headings, blank-brand save protection, toolbar focus and preserving an open link-address draft. Copy/link state also changes the control’s glyph, and the media Back/Undo paste controls use the appropriate arrows. Media mock-up controls retain focus when their modal contents redraw.

```text
RESULT: fail prototype-regressions 0/9
RESULT: ok prototype-regressions 9/9
RESULT: fail prototype-regressions 9/12
RESULT: ok prototype-regressions 12/12
RESULT: ok prototype-regressions 13/13
RESULT: fail prototype-regressions 21/25
RESULT: ok prototype-regressions 25/25
RESULT: fail prototype-regressions 25/26
RESULT: ok prototype-regressions 26/26
RESULT: ok unit none affected
RESULT: ok ux nothing visible touched
RESULT: skip second look (gpt-6.1-sol not used: docs-only change)
```

The 88-state / 44-keyboard-flow matrix passed again after these implementation fixes. Lint, standalone TypeScript checking of the shell test, JavaScript parsing and the skill guard also passed. The next Opus review checks the final diff and closes or retains the prior finding IDs; its result and the open-PR/CI results are in the PR handover.

The second round-two review (`20261120T010036Z`) identified additive-selection toggling and Remove cancellation focus. Both now have browser regressions and are fixed. The selected tree row scrolls into view within its own panel on phones; the document stays in place. Phone slot hit areas grow around the original slim pill, and walkthrough buttons retain 44 px height.

The final round-two review (`20261120T011657Z`) found that rerendering reset the phone tree scroll and Space deselection moved focus. Focus is now tracked independently from selection, the tree restores its scroll before revealing a row, and the Menu slot matches adjacent navigation padding. Added browser checks first failed 25/28 and now pass 28/28; the short-viewport popup check also proves it exercised the constraint fallback before reopening.

```text
RESULT: fail prototype-regressions 25/28
RESULT: ok prototype-regressions 28/28
```

## Second-look fixes

The first round-two `kit pr --no-merge` reached PR #414, then stopped on seven P2 findings from `opencode/deepseek-v4.1-flash-free` (`20261120T013415Z`). Eight focused cases first failed (28/36). The corrected paths cover route-specific client headings and bar scope, valid-only Duplicate commands, independent source-scope inspection, explicit Today source/paste guidance, long/bidirectional names, accessible popup names and expanded state through Escape/outside dismissal, and temporary link highlighting. The tree grid now constrains each row to its panel; its menu trigger can be clicked directly without the canvas intercepting the hit. New selection targets are recorded before rendering, and tree focus prevents document scrolling.

Declined in part: SL-1's suggestion to make Today's page control follow the canvas would remove the audited problem that the user explicitly requires. NSE-06 (`audit.md` row 6) records Home still naming the canvas after following About, then the top control/source changing when About's heading is selected. Today preserves that stale source identity, including when navigating back to Home. Its extra bar now uses the same stale identity; the mock-up guidance explicitly names the mismatch. After follows the visible route immediately. The new browser case exercises all four Today steps and checks this distinction. This retains the audited fault deliberately; it is not a claimed After fix.

The client preview uses separate Home and About heading drafts; its permissions remain simulated. The screen-width chip filters source inspection without changing the phone-canvas padding. Real system-clipboard interoperability, exhaustive content/contrast coverage and physical devices remain outside the claims here.

```text
RESULT: fail prototype-regressions 28/36
RESULT: fail prototype-regressions 35/36
```

`RESULT: ok prototype-regressions 36/36`

The full 88-state / 44-keyboard-flow matrix passed after these second-look fixes, including replacing the link address with Ctrl+A. The 36 regression cases passed again. All eleven index links resolve exactly once, and regenerating the pages leaves their bytes unchanged.

The follow-up main review (`20261120T014936Z`) found a non-focusable fallback popup invoker and asked for RTL layout isolation. Popup invokers are now actual controls; leaf text alone chooses its direction, with the navigation still aligned at the end of the header. The requested phone Add test also proves unchanged document scroll, an in-panel new row and focus on that row. Checks first failed 37/39 and now pass 39/39.

```text
RESULT: fail prototype-regressions 37/39
RESULT: ok prototype-regressions 39/39
```
