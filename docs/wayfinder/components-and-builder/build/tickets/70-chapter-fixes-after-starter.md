---
title: "Conventions: fix the Components chapter where the starter showed it wrong"
type: task (AFK)
status: closed
assignee:
blocked_by: [16-conventions-components-chapter, 17-starter-agents-components-chapter, 68-starter-card-links-in-components]
builder: sol
phase: 2
---

## What

Found by slice 17 (see its Done note). Fix the editor's Components chapter in `worker/site-conventions.ts`, then copy it byte for byte into the starter's `AGENTS.md` `## Components` (starter `dev`, as slice 17 did), in one editor commit and one starter commit:

1. **Card links:** the bullet quotes only the `.cards` rule. Describe the rule by behaviour (a link that is a card title's whole content stretches over the card, in a `.cards` grid and in a component's items slot; other links in the card stay clickable; card components set `:host { position: relative; }`) and quote slice 68's selectors as the starter's example, so the chapter's own `section-work` example is correct.
2. **Example slot names:** the `section-work` example fills `card-project` with `slot="text"`; the starter's slot is `body`. Make the example match a real starter component (or use a neutral made-up card whose slots are consistent with ticket 03's role names), so an agent copying it doesn't hide content.
3. **Tones:** the chapter describes `data-tone` and `--brand` as present. Say "where the site's CSS defines tones" (the starter gains them in slice 60), without promising they exist.
4. **Precedence:** "a component rule beats any shared rule" overstates it for `::slotted()` rules (document CSS wins over `::slotted()` for the slotted element). Word it correctly.

Keep `tests/mcp-runtime.test.ts`'s chapter assertions passing (update the ones these fixes change).

## Done when

- The four points read correctly; `npm run check` and `npm test` pass; the starter's `## Components` is byte-identical to `componentsChapter()` of the editor's conventions.

## Done (2026-10-09)

- `worker/site-conventions.ts`' Components chapter: the card link bullet says where the stretch works (a `.cards` grid and a component's items slot) and quotes slice 68's four starter rules; the `section-work` example fills `card-project`'s real `body` slot (`<p slot="body" class="body">`); Tones apply where the site's CSS defines them; the precedence bullet says a component rule wins on the template's own elements, while the page's CSS beats `::slotted()` rules on slotted elements (hence `:not([slot])`).
- Commit "Components chapter: card links, slot names, tones and precedence (slice 70)" (Sol built, Claude reworded tones/precedence); the starter's `## Components` copied byte for byte on its `dev`. `tests/mcp-runtime.test.ts` asserts the new selectors, the `body` slot in the example, conditional tones and the `::slotted()` precedence.
