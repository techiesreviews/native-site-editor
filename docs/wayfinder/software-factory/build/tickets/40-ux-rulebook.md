---
title: The UX rulebook, seeded from Lex's 35 corrections
type: task (AFK)
status: open
assignee:
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
