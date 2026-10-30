---
title: "`kit release-check` before every live deploy: nothing unsaved, and exactly what is on the release branch (second half of the gate begun in 68)"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [68-push-guard-for-live-branches, 77-check-the-retro-tickets]
---

## Goal

Lex (2026-10-30), after the script-editor retro: a project's deploy or release must not go out with uncommitted files, failing checks or unreviewed commits. With ticket 68 (lexvd.nl went live by a raw push) this is one gate before going live: 68 stops the push that skips `kit pr`, this checks what `kit pr --release` and a project's own deploy command send out.

## Check (ke-77, 2026-10-30): build smaller

Verdict on the [retro check](../retro-check-2026-10-30.md): build smaller. Once 68 refuses raw pushes, the only way onto a release branch is `kit pr`, which already runs the project's checks and the review before it merges. So "every commit reviewed" and "checks passed" come from the branch itself. What is left is a deploy run from a local checkout holding unsaved files, or from a commit that never reached the release branch. Dropped: the review-evidence bookkeeping, `--mark` and its record, the "no checks wired" rule (69 warns about that), and the blocks on 69 and 74.

## Decided behaviour

- `kit release-check` fails, in plain words with a `RESULT: fail` line, unless: the working tree is clean (no changed or untracked files outside `.scratch/`); and HEAD is exactly `origin/<release>` after a fetch (`branches.release`; for a project whose landing branch is live, the same branch). A project with no `branches.release` fails with the line saying so.
- A project's own live deploy command calls it as its first step (`docs/kitchen-extras-template.md` shows the one line). `kit pr --release` runs it on the landing branch's merge result before opening the release PR. A lead-only `--waive "<reason>"` like `kit pr`'s, printed in the RESULT line.
- Not checked: preview deploys from a landing branch that is not live (the editor's `deploy:preview` from `dev`), and editor saves (`techies-reviews`, `lexvd-site`; README rule "Editor saves stay untouched").

## Files

- In the kit repo (`~/Projects/agent-kit`, public; a PR through its own `kit pr`): `kit.d/release-check`, `kit.d/pr` (`--release`), `tests/kit-release-check.test.ts`, `tests/kit-pr.test.ts`, `docs/kitchen.md` (station 12, Release), `docs/kitchen-extras-template.md`.

## Done when

- Tests: a dirty tree, a HEAD ahead of or behind `origin/<release>`, and no release branch each fail with their own line; a clean HEAD equal to `origin/<release>` passes; `--waive` passes and names the reason; nothing is pushed. They fail before the change.
- `kit pr --release --dry-run` here shows the check as its first step.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `scripts/agents/kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA, and one `kit release-check` run here. This ticket's Done lands on `dev` here with `scripts/agents/kit pr` (docs tier).
