---
title: Hand off the kitchen-everywhere build plan
type: task (AFK)
status: closed
assignee: claude (planning helper)
blocked_by: [05-grill-rollout]
---

## Question

Build tickets in `build/` for the decisions in tickets 01 and 05 and the findings of research 02–04, in order, with builders, Agent Kit commands and evidence, in the style of [the factory build](../../software-factory/build/README.md): the shared kit's own repo and machine checkout with launcher and update timer, the project settings file (this editor first, working the same), own-command folders, the shared rulebook with per-project extras, machine-wide Grok count with weekly usage, an OpenCode path for `kit review` and the per-kind second look, the three fixes from the old copies, `kit init`, each project's move in the decided order, Issues to ticket files, the combined `kit score` table, and the `lex-coding` rule last. The README starts with a `**Not started:**` line until Lex says when the build begins.

## Resolution (2026-10-26)

Build plan handed off in [build/README.md](../build/README.md) (`prefix: ke`, **Not started** until Lex says when it begins), with 24 tickets in `build/tickets/`:

- **10s, ready inside this repo, the editor working the same:** 10 three fixes from the old copies; 11 the project settings file `scripts/agents/kit.json`, this editor first; 12 own commands in `scripts/agents/project.d/`; 13 shared helpers through `KIT_HOME`; 14 settings for projects unlike the editor; 15 one Grok count for the computer with its weekly use in the sweep; 16 an OpenCode path in `kit review`; 17 a second look on every change, per review kind.
- **20s, setup pieces:** 20 shared rulebook plus per-project extras (`kit rulebook`); 21 the launcher and `kit update`, with hooks that never fail silently; 22 `kit init`; 23 GitHub Issues into ticket files once; 24 `kit score --all` and a kit-problem line per project in the sweep.
- **30s, the kit's own home (wait for Lex):** 30 the new public repo and the move, this editor through the launcher; 31 the 15-minute user timer.
- **40s, each project's move in the decided order (each waits for Lex):** 40 `techies-reviews` (light plus its own checks; `.assetsignore`; `feat/melapress-course` first; editor saves to `main`), 41 `techies-playground` (`node --test` trap), 42 `chat` (its kit test goes), 43 `creator-studio-poc`, 44 `TechiesTools` (Issues to ticket files, its own agent rules), 45 `lexvd-site` and `dogsfitandfun` (light), 46 the starter in or out (recommended out: every new site copies it), 47 `camframe` when Lex builds there again.
- **50, last:** the `lex-coding` kit rule, wording approved by Lex.

Thirteen helper decisions are listed in the README for Lex to check; the main ones: prepare everything here and move the kit last; one second look per change with a fallback that never blocks landing; a missing kit warns rather than blocks; the starter stays out.
