---
title: Answer the styling questions from how components and variants work today
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

Lex: "the rest is already as we have built it, so for questions look at how it's done now in terms of variants and components." For each of round 1's questions (tokens or free values, screen sizes, hover and focus, dark colours, where variant rules go, elements outside components, the starter's older CSS, site styles in the style list, which files are tokens, swatch click, the Components faults), find what today's code and earlier decisions already settle. Sources: the components-and-builder map, the variant controls in the edit bar, Edit component mode, component CSS, `tokens.css`, ADRs and `CONTEXT.md`. Say which questions are answered (with file:line or ticket) and which stay open.

## Resolution (2026-10-26)

Findings: [research/09-answers-from-the-code.md](../research/09-answers-from-the-code.md), read on dev at `a49729f24`.

- **Answered by the code or earlier decisions (7):**
  - free values with design values suggested (Lex);
  - dark colours (three-way tokens; `--accent` is derived from `--brand`);
  - code stays in the bottom pane, which can already be aimed at one rule (`revealRule`);
  - "only this variant" goes to `:host([data-…])` in the component's own CSS;
  - elements outside components are styled through site classes;
  - which files count as tokens today;
  - all 11 Components faults are still present, with known fixes.
- **Open (5):**
  - screen sizes (recommendation: All and Narrow, reusing the 720 px query where it exists, else a container query);
  - hover and focus (recommendation: four states, hover guarded and shared with focus, plus a preview switch to show a state);
  - the starter's older CSS (recommendation: convert once in the starter's own repo);
  - site styles in the chip list (recommendation: one folded chip);
  - swatch click (recommendation: it shows the colour only).
- **Smaller open choices:**
  - 6b: the panel can make a new look ("+ New look");
  - 7b: the panel may edit or add a site class, like Bricks global classes.
- **New findings:**
  - Text size can write inline styles on sites without `text-*` classes (`src/native-text-size.ts:9-14`);
  - variant previews can reuse the card look gallery (`src/components/card-look-gallery.ts`);
  - no screen shows an element's classes today.
