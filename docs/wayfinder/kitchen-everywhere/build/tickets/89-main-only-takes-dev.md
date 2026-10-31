---
title: "Every project lands on `dev`; `main` only takes `dev` (a release); `kit init` sets this up"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [90-fresh-start-branches]
---

## Goal

Lex (2026-10-31): "Yes a branch can go into dev, main can only get dev." Every project works like the editor: work lands on `dev` (with a test address where the project has one), and `main` (live) changes only by releasing `dev`.

## Decided behaviour

- **`kit init`** writes `branches.land: dev` and `branches.release: main` by default (a project can name others), and creates `dev` from `main` when it is missing.
- **`kit pr`:**
  - a PR into the release branch is refused unless its head is the landing branch (`kit pr --release`);
  - every other branch goes into `dev`;
  - the RESULT line names the rule.
- **The push guard (68)** already refuses agents' raw pushes to `dev` and `main`; unchanged.
- **Exceptions** (Lex to confirm in the Tuesday pack; defaults taken now):
  - **Native Site Editor saves** to a site's live branch (techies-reviews, lexvd-site) keep going to `main`. They are Lex's own edits through his editor, and the README rule "Editor saves stay untouched" holds.
  - **The chat workspace's backup routine** keeps committing to its own branch as today.
  - **The kit itself** (agent-kit) lands on `dev`, and the orchestrator releases `dev` to `main` once a day after its checks (the machine copy follows `main`). The kit isn't a live site, so this needs no "ship".
  - **A critical security fix while `dev` holds unreleased work:** default, an urgent question to Lex each time (fix alone onto `main` and merge back into `dev`, or release all of `dev`).
- `kit doctor` warns when a project has no `dev` or its settings still land on `main`.

## Files

In the kit repo: `kit.d/init`, `kit.d/pr`, `kit.d/doctor`, `docs/kitchen.md` (branches station), `tests/`.

## Done when

- Tests, failing first:
  - `kit init` sets `dev`/`main` and creates `dev`;
  - `kit pr --base main` from a feature branch is refused;
  - `kit pr --release` from `dev` passes;
  - doctor warns on a project landing on `main`.
- `kit init --all` reports every project on `dev`/`main`, or names its exception.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA.
