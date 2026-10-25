---
title: The UX rulebook, seeded from Lex's 35 corrections
type: task (AFK)
status: closed
assignee: sf-40
builder: claude
blocked_by: []
---

## Goal

One UX rulebook of how the editor should look and feel, seeded from the interaction contract and Lex's past corrections; every new correction is added and, where possible, becomes an automatic check ([ladder resolution](../../tickets/02-grill-ux-confidence-ladder.md#resolution-2026-10-22) item 1). Until it exists the kitchen's stopgap rule holds: visible tickets stay minimal, no explainer lines, hints, counts or badges unless Lex asked ([kitchen](../../../../agents/kitchen.md) station 3).

## Decided behaviour

- New file `docs/agents/ux-rulebook.md`, read by ticket writers, builders and the UX reviewer (slice 43). Sections by the four kinds Lex's corrections fall into (research 01): **Say less** (too much text or decoration), **Looks** (below the bar), **Behaviour** (felt wrong once used), **Bugs a user sees** (interaction, phone, motion).
- Each rule: one line in plain words, a short **why** naming its source (the correction's ticket or PR from research 01, e.g. `components 90: the locked-part hint`, linked to `docs/wayfinder/components-and-builder/build/tickets/90-no-locked-hint.md`), and a **check** tag: `script` (a scripted check can find it; say which: text length, new badge or count class, raw colour, layout finding, tap target) or `eye` (the reviewer judges it from screenshots).
- Seed sources, all read-only: the 35 items in research 01 (`git show origin/research/sf-01-line-today:docs/wayfinder/software-factory/research/01-line-today.md`, sections A–D, with every linked ticket); the interaction contract from the Astro User Editor spec (memory note "Page builder reference is the Astro User Editor spec": `astro-site-editor` `interaction-contract.md`, find it under `~/Projects/` read-only); `docs/editor-colors.md`; the good-css skill's rules that apply to the editor. One rule may cover several corrections; aim for 25–40 rules, none invented without a source.
- Ends with **How rules are added**: a correction in a build's feedback log (slice 22) or from chat learning (slice 52) becomes a rule here only after Lex has seen it; a `script` rule names the kit check that enforces it once built.
- Kitchen station 3 and 8 point to the rulebook; the stopgap sentence is replaced by "follow the rulebook".

## Files

- `docs/agents/ux-rulebook.md` (new)
- `docs/agents/kitchen.md` (stations 3 and 8), `AGENTS.md` (one line under Review: "UX: `docs/agents/ux-rulebook.md`")

## Done when

- Every one of the 35 items in research 01 (A 7, B 9, C 8, D 11; the one not reproducible is left out) is covered by at least one rule or listed under a short **Not a rule** list with the reason (for example a one-off bug fixed for good). The Done section has the coverage table (item → rule).
- Every rule has why, source link and check tag; links resolve (`node scripts/agents/tickets.mjs check` and the doc-link unit test, if any, via `kit pr`'s docs tier).
- The lead shows Lex the rule list (plain, one line each) before landing; his changes go in. Note the date in Done.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Docs only; `kit slice` still runs the Claude review before `kit pr`'s docs tier.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-sf40 -- scripts/agents/kit slice --ticket docs/wayfinder/software-factory/build/tickets/40-ux-rulebook.md --builder claude-opus-5-5 --no-pr`; `scripts/agents/kit wait job slice-sf40 --timeout 2h`; Lex's look; the same command without `--no-pr` lands it.
- Report: rule count by section, coverage table summary (35 of 35 placed), Lex's changes, review decisions, PR and merge SHA.

## Done (2026-10-25)

`docs/agents/ux-rulebook.md` holds 40 rules: Say less 7 (S1–S7), Looks 12 (L1–L12), Behaviour 13 (B1–B13), Bugs a user sees 8 (U1–U8). Each has a why with its source link and a check tag: `script: layout` (`kit shots` layout findings), `script: colours` (`scripts/check-colours.mjs`), `script: spec` (names the browser specs that pin today's cases; new cases still need `eye`), the planned `script: text` / `frames` / `drag` from slice 42, or `eye`. Extra sources beyond research 01: `docs/editor-colors.md`, the media audit, the factory map's no-toasts decision and Lex's requests 01–02 (2026-10-23), and the `good-css` skill. B1 follows Lex's click-to-type request (clean-up 28, 2026-10-23), which replaced components 79's click-selects, double-click-edits. The Astro interaction contract is no longer on this machine (no `interaction-contract.md` anywhere under `/`), so no rule cites it; the rulebook says so. Kitchen station 3 replaces the stopgap sentence with "follow the rulebook", station 8's UX review points to it, and `AGENTS.md` has the UX line under Review.

Coverage, 35 of 35 placed (A8, not reproducible, left out):

| Item | Source | Rule |
| --- | --- | --- |
| A1 Duplicate/Remove/move on the template root | components 92 | B5 |
| A2 Section grip on the template root | components 41, `c27d560c` | Not a rule (grip removed by 36) |
| A3 Drop within 8 px of an edge refused | components 33 | U2 |
| A4 Press inside selection, image in Div, lagging boxes | components 36 | U1 |
| A5 iPhone upload "disappears" | media 103 | B12, U4 |
| A6 4 px gap under the search bar | media 122 item 4 | L5 |
| A7 Image popup flicker | clean-up 93 | U3 |
| B1 Locked-part hint | components 90 | S1 |
| B2 Drag label explanation line | components 91 | S1 (B3 keeps refusal reasons) |
| B3 Show toggle in Edit component mode | components 89 | S5 |
| B4 "Filled from" strip | components 101 | S4 |
| B5 Group headings in "Link to a page…" | components 101 | S6 |
| B6 Media tab count | media 122 item 1 | S2 |
| B7 Page button's blue dot | media 122 item 2 | S2 |
| B8 Media keyboard-hint footer | `39925ac8` | S1 |
| B9 Empty Clean up note | `39925ac8` | S3 |
| C1 Page Structure rings, two attempts | `a5c4fe72`, `1f080f39` | L11 |
| C2 Tile details only on hover | media 122 item 3 | L7 |
| C3 Filter label | media 122 item 5 | L6 |
| C4 Selection bar too thick | media 122 item 6 | L4, L10 |
| C5 File details | media 123 | L1, L8 |
| C6 Files tab | media 124 | L1, L3, L9, S7 |
| C7 Pages tab | media 125 | L1, L3, L9 |
| C8 Discard into the Publish menu | components 87 | L10 |
| D1 Click selects, double-click edits | components 79, since replaced by clean-up 28 | B1 |
| D2 Delete key, no row delete | components 81 | B2, B10 |
| D3 Move any element | components 82 | B3 |
| D4 Make component on containers only | components 80 | B5, B4 |
| D5 Make component on page header/footer | components 104 | B5, B4 |
| D6 Text editing in Page Structure | components 102 | B4 |
| D7 Auto-add the component loader | components 103 | B6, B10 |
| D8 Plain cards fill text and image | components 99 | B8 |
| D9 Starter follows the visitor's scheme | components 75 | B13 |
| D10 Rename renames the CSS | components 76 | B9, B10 |
| D11 Image placeholder first | components 105 | B7, B6 |

Rules sourced only outside the 35 (agent-found or house rules): L2, L12, U6–U8, U5 in part (components 85 and 96 beside item B3's 89), and S7's audit half. Lead PRs #109 and #110 (requester not recorded) are cited as supporting, never as the only source.

Tests: docs only. Every relative link and anchor in `ux-rulebook.md` and `kitchen.md` resolves (checked with a one-off node script, rerun after the review fixes); the three commit links resolve on GitHub; every spec file the rulebook names exists. `node scripts/agents/tickets.mjs check` passes (521 tickets); `kit unit --affected`: none affected; the docs guard tests (`agent-scripts`, `code-map`, `mcp-runtime`) pass 74 of 74; `npm run lint` passes.
