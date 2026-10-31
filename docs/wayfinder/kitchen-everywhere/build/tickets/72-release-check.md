---
title: "`kit release-check` before every live deploy: nothing unsaved, and exactly what is on the release branch (second half of the gate begun in 68)"
type: task (AFK)
status: closed
assignee: ke-72
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

- In the kit repo (`~/Projects/agent-kit`, public; a PR through its own `kit pr`): `kit.d/release-check`, `kit.d/pr` (`--release`), `tests/kit-release-check.test.ts`, `tests/kit-pr.test.ts`, `docs/kitchen.md` (station 12, Release), `docs/kitchen-extras-template.md`. Added in the build: agent-kit `README.md`, a short section beside ticket 68's push-guard one, as this is the second half of that gate. In this editor: `docs/agents/agent-scripts.md` (the `kit release-check` line and the `kit pr --release` step), as a new kit command gets its line there.

## Done when

- Tests: a dirty tree, a HEAD ahead of or behind `origin/<release>`, and no release branch each fail with their own line; a clean HEAD equal to `origin/<release>` passes; `--waive` passes and names the reason; nothing is pushed. They fail before the change.
- `kit pr --release --dry-run` here shows the check as its first step.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `scripts/agents/kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA, and one `kit release-check` run here. This ticket's Done lands on `dev` here with `scripts/agents/kit pr` (docs tier).

## Done (2026-10-31)

- **The kit PR:** https://github.com/techiesreviews/agent-kit/pull/10, landed through the kit's own `kit pr` as `7335e5e` on the kit's `main` (`RESULT: ok merged #10 7335e5e`), with the lead's waiver after seven fix rounds: the last Claude review had only P3 findings and test gaps, the second look two P2s and gaps (see Follow-ups). CI run 41157081105 green (the kit's tests and this editor's tests from `dev`). Second look: `opencode/deepseek-v4.1-flash-free` (Grok's weekly count used up, 8/8 in 2026-W44), kind `agent`.
- **`kit release-check [--land] [--waive "<reason>"]`** (`kit.d/release-check`): fails, each with its own `RESULT: fail …` line and a `problem:` line, on changed or untracked files outside `.scratch/` (named, five at most and a count; ignored files do not count), a HEAD ahead of, behind or split from `origin/<release>` after fetching that branch by name (a single-branch or CI clone works too), a release branch missing on origin, no origin, a fetch that fails or gets no answer within `KIT_RELEASE_CHECK_TIMEOUT` seconds (default 120; no HTTPS prompt), no commit checked out, and no `branches.release` (`RESULT: fail no branches.release in scripts/agents/kit.json: name the branch that goes live there`). A clean HEAD equal to `origin/<release>` passes: `RESULT: ok release-check <sha> is origin/main, nothing unsaved`. Only a `*-lead` owner may `--waive`; the RESULT line names the owner, the reason and what it let through. It pushes nothing. The advice follows the project: where land and release are one branch (a live site, agent-kit) `kit pr` alone; else land on the landing branch, then `kit pr --release`. Branch lookups are 68's: the same `branches.release` key the push guard reads (`kitBranch("release")`).
- **`kit pr --release`** runs `kit release-check --land` as its first step, before the guards and the fetch (`release-check: ok (<sha> is origin/dev, nothing unsaved)`): the release is cut from exactly `origin/<land>`, then rebased onto `origin/<release>` as before. A failure stops it with the check's whole RESULT text and nothing pushed. A lead's `--waive` is handed on; a waiver the check used is named on the final RESULT line (`… (release-check waived: <reason>)`) and in the PR body's Tests. A rerun on a cut an earlier run already rebased says to cut it again (`git reset --keep origin/<land>`), and only when every commit of the cut already landed (`git cherry`); a hand-made commit gets "land it with kit pr first".
- **Docs:** agent-kit `docs/kitchen.md` station 12 (Release check), `docs/kitchen-extras-template.md` (Release: `scripts/agents/kit release-check &&` as the deploy's first step, how a lead deploys past it, a built folder rebuilt in the same command), `README.md` ("Nothing unsaved goes live"), the `kit pr` and `kit release-check` usage text; this editor's `docs/agents/agent-scripts.md#kit`.
- **Tests:** `tests/kit-release-check.test.ts` (26: every line above, the front door, a live landing branch, a force-pushed origin, paths with spaces and accents, a token in origin's URL kept off the output, a stalled origin stopped within 5 s, nothing pushed) and 19 release tests in `tests/kit-pr.test.ts` (the first step in a dry run and a real run, a real check through `kit pr` passing a cut at `origin/dev` and failing an unlanded commit, waivers, a rebased release and its rerun). The 11 first `kit-release-check` tests and the two first `kit pr` ones failed before the change (no command; no `release-check` call).
- **Kit commands:** agent-kit `kit doctor` → `RESULT: ok doctor 11/11 checks passed`; `kit unit --affected` → `RESULT: ok unit 173/173 (2 files)` (last standalone run); `npm test` 1404/1404, `npm run lint` and `npm run test:kit-clean` exit 0; `kit review` (claude-opus-5-5) three standalone rounds and five inside `kit pr`. Two `kit pr` runs failed on unrelated timing tests (`kit fix refuses a branch change while its builder is held`, `Sol expiry kills its process group`), each passing alone three times; the reruns passed.
- **On this machine:** the update timer brought `7335e5e` at 03:15 CET (`kit version` → `RESULT: ok version 7335e5e node v24.21.0`). This editor's `kit doctor` → `RESULT: ok doctor 11/11 checks passed`. One `scripts/agents/kit release-check` here, in this thread's `dev` worktree (the lead's main checkout holds other work on another branch, so it was left alone): `RESULT: fail HEAD 00caf9dc2 is 599 commits ahead of origin/main: what goes live must be on main; land it on dev with kit pr, then kit pr --release`, the right answer for a `dev` checkout, which is not live.
- **`kit pr --release --dry-run` here:** from a throwaway worktree on `release/ke72-dryrun` at `origin/dev` (machine kit `7335e5e`), the first step after the log line was `release-check: ok (0410d6351 is origin/dev, nothing unsaved)`, then `guards: ok`, `deps: ok`, `fetch: ok`, `rebase: ok`, `skills: ok`, `tier: full (528 files, …)`. Stopped there, before the editor's whole test suite; nothing was pushed (no `release/ke72-dryrun` on origin), and the worktree and branch are removed.
- **Left for the lead:** this editor's own live deploy, `npm run deploy:techies` (`package.json`) and its line in `docs/agents/kitchen-extras.md` ("Release to production"), does not start with `scripts/agents/kit release-check &&` yet. The ticket's Files name only the kit repo and its close is docs-only, so wiring it is a separate one-line change, and it changes how Lex's production goes live. Ticket 74 (also `kit.d/pr`) was still open; this slice came first.
## Follow-ups

Waived on kit PR #10:

- P1 (second look on editor PR #291, waived by the lead 2026-10-31 as a follow-up): editor's `npm run deploy:techies` runs `scripts/agents/kit release-check` first, plus its line in docs/agents/kitchen-extras.md: the lead files it as its own slice (it changes how production goes live, so it lands before the next Tuesday ship, listed in the pack).
- Gap (second look on editor PR #291): with that slice, a unit test that reads `package.json` and asserts `scripts["deploy:techies"]` starts with `scripts/agents/kit release-check &&`, and that the Release to production line in `docs/agents/kitchen-extras.md` includes the check.
- P2 (second look): station 12 says "nothing that skipped `kit pr` goes live", but a commit a person pushed straight to `main` from their own terminal passes the check; reword to "nothing unsaved and nothing that is not on `origin/<release>`".
- P2 (second look): when `kit release-check` exits without its own RESULT line, the front door's `RESULT: fail release-check exited N …` comes back as `release-check: release-check exited …`; strip the repeat and test it through the real front door.
- P3: a 1-second limit prints "no answer within 1 seconds"; use `plural`.
- P3 race: under `--land` the `git cherry` limit is the local `origin/<release>`, which the check does not fetch, so a stale ref could count a commit as landed; fetch it too.
- Gaps: a cut whose HEAD is a merge commit (`git cherry` lists no merges); `kit pr --release` with no origin; one waiver covering open review findings and the check at once; a staged rename; the deploy form's `--waive` through the front door; a bad `KIT_RELEASE_CHECK_TIMEOUT` in a fast test.

