---
title: Plan copying the kitchen to Lex's other projects
type: task (AFK)
status: open
assignee: sf-70 (this session)
builder: claude
blocked_by: [23-one-page-per-build, 31-heartbeat, 43-kit-ux-reviewer, 52-chat-learning, 60-context-card]
---

## Goal

The map's destination: proven here first, then copied as the template for Lex's other projects (Lex, 2026-10-22, F1). Its Not yet specified: "How the recipe is copied to other projects (template repo, shared skill, or kit command), once it is proven here." This slice is **planning only**: it changes no code and copies nothing; it prepares the questions and a build plan.

## Decided behaviour

- Research, read-only: which kit commands and docs are project-neutral (likely `bg`, `wait`, `review`, `fix`, `slice`, `pr`, `doctor`, `status`, `next`, `heartbeat`, `score`, `feedback`, `card`, `learn`, `sweep`, `tickets.mjs`, the hooks) and which are this editor's own (`shots`, `specs`, `size`, `preview`, `ux` tries, ports, fixtures, budgets); what each neutral one assumes (paths such as `~/Projects/native-site-editor-*`, `origin/dev`, the main root `.scratch/`, Node 24, `gh`). Lex's projects and their state from `~/Projects/chat/memory/projects/local-project-inventory.md` and `project-notes/README.md`; the `lex-coding` skill's kit rule (it already requires the kit in every project).
- Compare three ways (template repo, a shared kit package or skill that projects pull, a `kit init` that copies and adapts), each with what changes for Lex (updates, how a fix reaches every project, risk of drift), and recommend one.
- Output: `docs/wayfinder/software-factory/research/70-copy-the-kitchen.md` (findings, comparison, recommendation) and a draft new map `docs/wayfinder/kitchen-everywhere/map.md` with its first grilling ticket(s) for Lex (plain choices, each with a recommended answer) and one research or task ticket per open fact. No build tickets yet: they follow Lex's answers.
- The software-factory map's Not yet specified line for copying points to the new map.

## Files

- `docs/wayfinder/software-factory/research/70-copy-the-kitchen.md` (new)
- `docs/wayfinder/kitchen-everywhere/map.md` and `docs/wayfinder/kitchen-everywhere/tickets/*.md` (new)
- `docs/wayfinder/software-factory/map.md` (Not yet specified: one line)

## Done when

- The research names every kit command as neutral or project-own with its assumptions, and the comparison has a recommendation.
- The new map passes `node scripts/agents/tickets.mjs check` and `node scripts/agents/tickets.mjs frontier kitchen-everywhere` shows its first tickets.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Docs only (docs tier); reads other projects, writes nothing outside this repo.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-sf70 -- scripts/agents/kit slice --ticket docs/wayfinder/software-factory/build/tickets/70-copy-the-kitchen-plan.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-sf70 --timeout 2h`.
- Report: the recommendation in one line, the new map's frontier output, review decisions, PR and merge SHA.
