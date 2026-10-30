---
title: "`kit release-check` before every deploy: clean tree, checks passed on this commit, every commit reviewed (second half of the gate begun in 68)"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [68-push-guard-for-live-branches, 69-doctor-warns-no-tests-and-due-reminders, 74-failure-details-kept]
---

## Goal

Lex (2026-10-30), after the script-editor retro: a project's deploy or release must not go out with uncommitted files, failing checks or unreviewed commits. With ticket 68 (lexvd.nl went live by a raw push) this is one gate before going live: 68 stops the push that skips `kit pr`, this checks what `kit pr --release` and a project's own deploy command send out.

## Decided behaviour

- `kit release-check` fails, in plain words with a `RESULT: fail` line, unless: the working tree is clean; the project's checks passed on HEAD (it runs them, or reads fresh evidence recorded for exactly HEAD); and every commit since the last release has a `kit review` evidence entry (the main root's `.scratch/reviews/…`). Merge commits and commits that change only evidence or ticket files are exempt; the builder documents the exact rule. A project with no checks wired (ticket 69's helper) fails with the line saying so.
- `kit release-check --mark` records a release: the builder picks a file under the main root's `.scratch` or a lightweight local tag and documents it; it never pushes.
- `kit pr --release` runs it first; a project's own deploy or release command calls it as its first step (`docs/kitchen-extras-template.md` shows the one line to add). A lead-only `--waive "<reason>"` like `kit pr`'s, recorded in the evidence.
- Editor saves stay untouched: sites the Native Site Editor saves to (`techies-reviews`, `lexvd-site`) deploy on its commits to `main` without this check (README rule "Editor saves stay untouched").

## Files

- In the kit repo (`~/Projects/agent-kit`, public; a PR through its own `kit pr`): `kit.d/release-check`, `kit.d/pr` (`--release`), `tests/kit-release-check.test.ts`, `tests/kit-pr.test.ts`, `docs/kitchen.md` (station 12, Release), `docs/kitchen-extras-template.md`.
- `blocked_by` 74: both change `kit.d/pr`; a failed check here names its `error.txt` the same way.

## Done when

- Tests: a dirty tree, failing checks, an unreviewed commit and no checks wired each fail with their own line; a clean, checked, reviewed HEAD passes; exempt commits pass; `--mark` moves the start of the next check; `--waive` passes and is recorded; nothing is pushed. They fail before the change.
- `kit pr --release --dry-run` here shows the check as its first step.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `scripts/agents/kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA, and one `kit release-check` run here. This ticket's Done lands on `dev` here with `scripts/agents/kit pr` (docs tier).
