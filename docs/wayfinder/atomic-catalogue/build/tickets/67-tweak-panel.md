---
title: "Design board: a CSS tweak panel with Send to agent"
type: task (AFK)
status: closed
assignee: fleet-lead
builder: claude
blocked_by: [08-live-frames]
---

## Goal

Lex (2026-11-10): "build some kind of CSS/HTML panel so I can do some manual tweaking." Orbit card TOOLS-204. T3 Code's preview has no style mode (only annotate), so the board gets its own: a Tweak section in the right panel for the selected part, which changes its live cell by hand and hands the change to an agent as plain text.

## Decided behaviour

- The right panel shows a Tweak section for the selected part (atoms, molecules, organisms): its real CSS values, read from the stylesheets that style it: the theme tokens from `src/theme.css` its rules use, and its own rules' colours, spacing, corners, shadows and font size, as editable fields, with a colour picker or a slider beside the text where one fits.
- Editing changes the part's live cell at once, and nothing else: not the state cells, not the editor's own styles. Colours are edited for the theme the live cell shows (Options, Colours: Light or Dark); other values for both.
- Reset puts the part back. "Send to agent" copies a short plain-text change request (the part's name and `data-part`, each selector, each value before and after, light or dark) and says Copied on the button. Lex pastes it into the Fleet manager thread.
- Nothing is saved to the code or GitHub by the panel; no toasts or explainers.
- The editor's boot stays at 355 KB: the board only loads when opened.

## Files

`src/catalogue/tweak.ts` (new), `src/catalogue/tweak-panel.ts` (new), `src/catalogue/board.ts`, `src/catalogue/frame.ts`, `src/catalogue/board.css`; `tests/catalogue-tweak.test.ts` (new), `tests/native-save/native-catalogue-board.spec.ts`; `docs/agents/code-map.md`.

## Done when

- Selecting a part shows its CSS values; editing one changes the live part in light and dark.
- "Send to agent" copies a short change request (part, values before and after).
- A reset puts the part back; nothing reaches the code or GitHub by itself.
- `kit size` shows the editor's boot at 355 KB or lower.

## Done (2026-11-11)

- **Values read from the real stylesheets:** when a part is first selected, `readFields` walks the stylesheets of its live cell's and light state cells' documents (the frame's own page for menus and dialogs; forced hover, pressed and focus cells left out, so their rule copies never show), keeps the rules of the part's own (a class, not the board's `.cat-…`) that match its elements, and reads colours, spacing, corners, shadows and font size, shorthands before the longhands they cover. Only a declaration that wins on some element counts (specificity, then order), so an old prototype rule the editor overrides (`utilities.css`'s `.button` padding) is left out. A declaration that is one theme token alone becomes that token's field, with the rules that use it; values are read in light and dark on two hidden probes.
- **The live cell only:** edits are CSS under `:where(<live cell in that theme>)`, so a rule keeps its own specificity and its hover and pressed rules still win as in the code. Inline parts get one `<style data-tweaks>` last in the board's head; frames get it through `data-tweaks` on the live `<iframe>`, which the frame page writes last in its own head (again after the part's stylesheet loads, and after a theme switch makes the frame anew). A value with `;`, braces or a comment is never written.
- **The panel:** fields grouped as Colours · Light/Dark, Spacing, Corners, Shadows, Font size; a colour picker beside a colour (not for `currentcolor`), a slider beside a single length; an edited field shows a dot and the action colour, an invalid one the problem colour. Reset and Send to agent are dimmed (`aria-disabled`, so the focus stays) until something changed; Send to agent reads Copied (or Couldn't copy) for two seconds and the status line says so.
- **Tests:** `tests/catalogue-tweak.test.ts` (new, 8, seen failing before `tweak.ts` existed): property kinds, `soleToken`, `splitSelectors`, `specificity`, `changedSides`, `tweakCss` (only what changed, per theme, item by item, no breaking values) and `changeRequest`. The spec +2, both seen failing first: the live Button's padding, `--radius` and a dark-only `--primary` change the live cell and not the state cells, the light theme keeps its colour, Send to agent copies the request and says Copied, Reset puts it back; a `--radius-panel` edit reaches the live Row menu's frame and not its state frames.
- Feature list: no change (the board is a preview-only page, not an editor feature; `docs/agents/features.md` has no area for it, and `tests/features-list.test.ts` fixes the areas)
- **Checks:** `RESULT: ok size boot 355 KB (±0 KB) vs dev@7fb56d4, budget 355 KB`; `RESULT: ok unit 20/20 (2 files)` (`kit unit --affected`); `RESULT: ok specs 1/1 passed` (18 passed, WebKit skipped); `npm run check` (`RESULT: ok tokens in step`) and `npm run lint` exit 0; `RESULT: ok shots 6 files, 0 failed, 2 layout findings` for the Tweak steps at 1280 px light and dark, and 390 px light (the findings, the selected card's title contrast and the zoomed live button's tap size, are the board's as on dev).
