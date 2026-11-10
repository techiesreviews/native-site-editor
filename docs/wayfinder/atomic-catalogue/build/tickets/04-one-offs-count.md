---
title: "The one-way count of one-offs"
type: task (AFK)
status: closed
assignee: fleet-lead
builder: claude
blocked_by: [03-motion-layers-shadows]
---

## Goal

Count hand-typed values per CSS file and let the count only go down ([ticket 10](../../tickets/10-grill-one-way-check.md#resolution-2026-10-25)).

## Decided behaviour

- Seven kinds: px spacing, radii, shadows, timings, local custom properties, z-index values, px font sizes; counted with research 04's scripts (`git show origin/research/ac-04-parts-inventory:docs/wayfinder/atomic-catalogue/research/04-parts-inventory.md`, "Re-running the counts").
- Counts per CSS file in one committed file; `kit pr`'s css tier runs the check beside `scripts/check-colours.mjs`.
- A rise is blocked unless the lead waives it with a written reason (`kit pr --waive`); a fall rewrites the file.
- Values that use a token never count.

- **Trace check** (Lex, 2026-10-25, ticket 07's comment): a molecule or organism may use only catalogue parts and shared values. The count also reports, per part, what does not trace to a part, so the board can show it.

## Files

Expected: `scripts/agents/one-offs.mjs` and `scripts/agents/one-offs.json` (new), `scripts/agents/pr-tier.mjs`, the kit's `pr` command, `docs/agents/guardrails.md`, `docs/agents/agent-scripts.md`, tests (`tests/one-offs.test.ts`).

## Done when

- The baseline file matches research 04's totals give or take today's changes (state the numbers).
- A test diff that adds a raw `padding: 10px` fails the check; one that replaces a raw value with a token lowers the file's count.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-ac-04 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ac-04 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- The one-offs count (slice 04, once landed) does not rise; quote its `RESULT:` line.

## Done (2026-11-10)

- `scripts/agents/one-offs.mjs` counts the seven kinds per CSS file under `src/` with research 04's rules: px margin, padding and gap; raw radii; raw `box-shadow`; hand-typed `transition` and `animation` times; local custom properties (any `--x:` outside `src/theme.css`); raw `z-index`; px `font-size`. A value written with a token never counts, a `var(--x, 4px)` fallback included. Two differences from the research script: `z-index` and px spacing also ignore digits inside `var(...)`, as the other kinds do (neither changes today's numbers). A local custom property counts even when it only holds a token, as in the research. The scanner reads whole property names (custom properties with digits, capitals or underscores count; other names are case-insensitive), signed times (`animation-delay: -120ms` counts, a name such as `fade-2s` does not), and removes a whole `var(...)` with nested parentheses before looking at a value.
- `scripts/agents/one-offs.json` is the committed count: 69 files with at least one value, 1,595 values. Research 04 gave 1,006 / 158 / 57 / 77 / 97 / 68 / 39 (spacing / raw radii / raw shadows / timings / local properties / z-index / px font sizes, 1,502 in all) on its tree. The same research script run on today's tree gives 1,032 / 164 / 60 / 88 / 135 / 72 / 41 (1,592). The baseline is 1,032 / 164 / 60 / 88 / 138 / 72 / 41 (1,595): the same, plus 3 custom properties with digits in their names in `src/tokens/framework-editor.css` that the research script's name matcher skipped (the count file was regenerated from the corrected scanner; no value was added to the CSS). The rise since research 04 is today's changes (local properties 97 to 135 from the agent pins, carets, chips and MCP menu; spacing and timings from the new parts).
- `node scripts/agents/one-offs.mjs check` fails with `file:line: <kind> … rose from N to M` and `RESULT: fail one-offs rose by N in M files` when a file has more of a kind than the file says (a new CSS file starts at 0). Without `--no-write` a fall rewrites `one-offs.json` and prints `RESULT: ok one-offs fell by N …, commit it`; with `--no-write` a fall fails with `RESULT: fail one-offs fell by N … was not updated` until `update` is run and the file committed. No change prints `RESULT: ok one-offs 1595 hand-typed values in 69 files, none above scripts/agents/one-offs.json`.
- `node scripts/agents/one-offs.mjs update` rewrites the count: a builder who lowers a count runs it and commits the file (no waiver when nothing rose). `update --waive "<reason>"` is the in-repo waiver for a rise: only a `*-lead` owner (`ASE_OWNER`, else the second field of `.scratch/owner`), and it records date, file, kind, from, to and reason under `waivers` in the count file. Without `--waive` a rise is refused.
- `report [--json]` lists every counted value with file and line: what does not trace to a shared value, for the board (ticket 05). Until the parts list exists a "part" is its CSS file.
- `scripts/agents/kit.json` `checks.css` is now `node scripts/agents/one-offs.mjs check --no-write --then scripts/check-colours.mjs`: the kit runs that setting as one command split on spaces (no shell), so the one command runs the count and then the colour check. `--no-write` keeps the kit's mid-slice runs (`kit ux`, `kit pr`) from rewriting the count and leaving the tree dirty; the paths `kit ux` appends are passed on to the colour script. The old value's `&& node scripts/tokens-from-framework.mjs check` part was never run by `kit pr` (it only reached `check-colours.mjs` as extra arguments); `npm run check` still runs the tokens check.
- `tests/one-offs.test.ts` (16 tests): a diff that adds a raw `padding: 10px` fails `check`; swapping a raw value for `var(--space-xs)` lowers the file's count and rewrites the baseline; the waiver needs a reason and a lead and is recorded; tokens, `0`, `none` and comments never count; kit-appended paths are ignored and `--then` runs the colour check; `report` output; the owner fallback from `.scratch/owner`; numbered and capitalised custom properties, negative delays and nested token fallbacks; a `var()` fallback holding a px value never counts in any kind; the real `checks.css` value from `kit.json`, split on spaces as the kit does, runs against a temp project and never writes the count file (a fall and a rise both fail, a colour still fails); and the real tree's count equals the committed count exactly, no rise and no fall (this is what makes the count bite in CI through `npm test`, and forces a fall to be committed).
- `docs/agents/guardrails.md` and `docs/agents/agent-scripts.md` describe the check, the builder's `update` step, the waiver, a rename counting as a rise, the `kit ux` label and the `checks.css` value.
- Feature list: no change (build tooling only, nothing a user sees).
- Evidence: `RESULT: ok unit 16/16 (1 files)` from `scripts/agents/kit unit --affected` ; `npm run lint` green; docs guard files `tests/kit-editor.test.ts`, `tests/mcp-runtime.test.ts` and `tests/code-map.test.ts` pass; `RESULT: ok one-offs 1595 hand-typed values in 69 files, none above scripts/agents/one-offs.json`. `kit specs --affected` and `kit size` were not run: no file under `src/` changed.
- Not done here: `kit pr --waive` does not reach the count, so a lead's `kit pr --waive` does not accept a rise and no kit integration test exists. `pr-tier.mjs` and `kit pr` live in the agent-kit repo, outside this project and outside this slice's Files; the machine copy hands its css check no waiver (its children get the kit's own environment only). The change the kit needs is small: when `flags.waive` is set, `kit pr` runs the `checks.css` command with the reason in an environment variable and records the waiver where it records the others (PR body, comment, scoreboard); the count's side would then read that variable. Until then the lead waives with `update --waive` and commits the file. Follow-up for the lead (a builder does not write to the board): open an Orbit card for the agent-kit repo for that, and a second for `kit ux` to label `checks.css` findings by source instead of "raw colour"; or Lex agrees that `update --waive` is the waiver.
