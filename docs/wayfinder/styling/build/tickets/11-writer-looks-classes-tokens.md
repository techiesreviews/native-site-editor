---
title: "The writer learns looks, site classes and design values"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [10-css-writer-back]
---

## Goal

Extend the writer to the three other places a style can go ([ticket 05](../../tickets/05-grill-where-styles-go.md#resolution-2026-10-26); [research 09](../../research/09-answers-from-the-code.md)). Size: M–L.

## Decided behaviour

- **Element in a component:** the component's own stylesheet (`components/<tag>/<tag>.css`), with the shortest selector from the element's class or tag, as research 02 says.
- **Looks:** "only this look" writes `:host([data-<axis>="<value>"]) <selector>` in the component's CSS (`worker/site-conventions.ts:113-116`; example `section-hero.css:77-84`). **New look** adds the first rule for a new axis or value, so the edit bar's variant controls (`src/page-builder/variant-intelligence.ts`, `variant-fields.ts`) offer it at once.
- **Site classes:** edited in place in the file that holds them (`styles/classes.css` and similar); **New site class** appends a rule there. Elements outside components are styled this way (research 09).
- **Design values:** changed in place in `styles/tokens.css`, keeping `@layer tokens`. A colour changes in all three places together: its plain fallback, its `light-dark()` pair under `@supports`, and its `tones.css` overrides (research 02, rule 6). `--accent` stays derived from `--brand` (`tones.css:135-147`): the writer refuses to give it a literal.
- **No conversion:** existing CSS is never rewritten beyond the declarations touched (Lex: "use what exists").

## Files

Expected: `src/page-builder/css-write.ts`, `tests/css-write.test.ts` (look rules, a new look axis, site class in place and new, the three-way colour, the `--accent` refusal, an untouched neighbour rule), `docs/agents/code-map.md`.

## Done when

- A unit test writes a new look into a copy of `fixtures/actual-starter`'s `section-hero.css` and the variant reader lists it.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-st-11 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-st-11 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)). The panel and everything it needs load lazily; the lazy chunk's size is quoted in Done.
- `kit shots` for anything visible, light and dark, 390 and 1280 wide.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
