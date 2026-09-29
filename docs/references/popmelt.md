# Popmelt interaction ideas

Source: https://popmelt.com (v0.24.2), reviewed 2026-09-28. Future ideas only; nothing here is planned or built.

Popmelt is a browser toolbar for local dev projects: point at UI, leave a note, send it to Codex or Claude Code, and watch the change land in place.

**License:** PolyForm Shield 1.0.0. That forbids using its code in a product that competes with it, and this editor probably would. Borrow the ideas, not the code.

## Worth borrowing

| Popmelt interaction | How it could fit here | Size |
| --- | --- | --- |
| **Point and ask.** Select an element, type "make it pop" and the element's context is attached automatically. | Add an "Ask agent" field to the Edit bar that sends the selector, component name, current styles and a screenshot to the agent. It bridges the Edit bar and live agent collaboration. | Medium |
| **Live status on the element.** The selection outline says Thinking, follows the element while it changes, then says Done. | Show agent progress on the canvas selection instead of a separate panel. It reuses the Change status idea, but per element. | Small–medium |
| **Stacked threads.** Several comments run at once, each with a coloured rail above its element. One is thinking while the others wait in a queue. | Queue several agent requests on different elements, with one colour per thread. | Medium |
| **Double-tap to edit text.** Double-click selects all the text, you type, and clicking away keeps it. | Probably already close to this. Check that the whole text is selected on entry and that clicking away commits. | Small |
| **Style dial.** Scrub through values, e.g. radius or background shades. Drag to move and drag a handle to rotate. | Scrubbable number and colour controls in the Edit bar, limited to the prepared component's tokens so edits stay on-system. | Medium |
| **Imprint (taste memory).** The agent proposes saving a decision, and you answer *Yes* (project-wide), *This time* (local) or *No* (explain the misunderstanding). | Save these as a design-decisions file in the editor configuration directory. Agents read it before editing. The three-answer prompt is the best idea on the site. | Medium |
| **Double-tap ⌘/Ctrl to summon the toolbar.** | A cheap, memorable shortcut for showing or hiding the editor chrome. | Small |
| **Evals.** Check the UI against your decision history. | Later: a lint that flags values outside the tokens or rules in the Imprint file. | Large |

## Delight details

- The logo spins when dragged.
- The theme is set to "auto (follows local sunset)", not just the OS setting.
- A "looking" eye badge blinks while the AI reads the canvas.
- There is a "drop a heart" easter egg on the demo robot.

These are small, have character, and cost little.

## Suggested order

1. Live status on the selection (it makes agent work visible).
2. Point and ask from the Edit bar.
3. Imprint with the Yes / This time / No prompt.
4. Scrubbable token controls.
