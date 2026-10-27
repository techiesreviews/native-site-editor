---
title: Doctor skips a failing kit home only when version caused it
type: task (AFK)
status: closed
assignee: ke-36
builder: claude
blocked_by: [27-doctor-commands-on-broken-settings]
---

## Goal

The OpenCode second look on [ticket 19](19-doctor-gate-and-fix-builder.md#done-2026-10-27) (P2, evidence `.scratch/reviews/ke19-second-look/20261027T154049Z` in the main checkout) found the `kit home` exemption wider than ticket 19 decided: whenever `version --help` exits non-zero or times out, any failing `kit home` check is skipped under `KIT_DOCTOR_SKIP=help` (`scripts/agents/kit.d/doctor:288`), also when the copy's `kit version` failed for another reason (for example a missing helper). A build can then start on a broken kit home, though ticket 19 says every other check still runs.

## Decided behaviour

- The `kit home` failure is skipped only when the copy's `kit version` failed because of `version` itself: its exit status and output match the broken help seen by the `help` check (same command, same exit or timeout). Any other failure of the copy keeps `✗ kit home` and the gate.
- The five test gaps from ticket 19's second look and Follow-ups get cases (below).

## Files

- `scripts/agents/kit.d/doctor`
- `tests/kit-doctor.test.ts`
- `docs/agents/agent-scripts.md` (the doctor gate line, only if the wording changes; also "a build (or a resumed build)" at `:122` becomes "a build, or a resume whose `status.json` records `kind: build`")

## Done when

- A broken `version` help plus a copyable home whose copy fails through a missing helper: `agent.sh build` is refused (exit 3) and doctor prints `✗ kit home`.
- `version (timed out)`: `version` help sleeps past `KIT_HELP_TIMEOUT`, the failing home is skipped, and the RESULT ends `skipped help, kit home`.
- `version (no usage)` with a copyable home whose `kit version` fails: help is skipped, `kit home` still fails.
- A run without `--quiet` shows the `problem: help` line among the `✓` lines, no `✓ help` or `✗ help`, and `✓ commands`.
- A resumed build with a full `status.json` (`kind: build`, session, model, CLI, brief, worktree) and a fake builder really starts, and the builder sees no `KIT_DOCTOR_SKIP`.
- `scripts/agents/kit unit --affected` green; real `scripts/agents/kit doctor` and `scripts/agents/kit status` `RESULT:` lines in the Done.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke36 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/36-doctor-kit-home-skip-only-for-version.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke36 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says.
- Report: unit, doctor and status `RESULT:` lines, review decisions, PR and merge SHA.

## Done (2026-10-27)

- `kit doctor` skips a failing `kit home` under `KIT_DOCTOR_SKIP=help` only when the copy's `kit version` fails as `version --help` did: both time out, or both exit with the same status and print the same lines in the same order, reading the copy's path as the kit's and leaving out the RESULT line the front door adds. A missing helper, another exit status, a `version (no usage)` help or a home that cannot be copied keeps `✗ kit home`, so `agent.sh build` is refused (exit 3). Each side keeps its own limit: the help `KIT_HELP_TIMEOUT`, the copy's `kit version` and the `kit` note's `version` `KIT_HOME_TIMEOUT` (default 10, as before); both timing out counts as alike, also when one was killed (137) and the other stopped (124). A copy stopped by a timeout says so: `fails kit version: (timed out)`, or its last line followed by `(timed out)`. The front door relays only stdout, so a `version` writing to both streams may come out reordered and keep the gate; the docs say so.
- `docs/agents/agent-scripts.md`: the doctor gate wording says when `kit home` is skipped, and a resume gates as a build only when its `status.json` records `kind: build`.
- Tests (`tests/kit-doctor.test.ts`): a copy that fails through a missing helper, or with the same words but another exit, refuses `agent.sh build` with `✗ kit home`; a `version` whose help and copy both hang skips both (`skipped help, kit home`) while a copy that fails fast does not; `version (no usage)` with a copyable failing home still fails `kit home`; through the real front door, a version whose error names its own path, one that prints nothing (only the front door's RESULT line), one that prints its own RESULT line (no line from the front door), one whose last line has no newline and one that hangs (`RESULT: fail version interrupted (timed out)`) are skipped and fail without the skip, while one naming the copy's project folder, or printing an extra line in the copy, keeps `✗ kit home`; a help killed after ignoring SIGTERM matches a copy stopped by it; the `kit` note's `version` stops at `KIT_HOME_TIMEOUT`, leaving the note out; a run without `--quiet` puts the `problem: help` line between `✓ commands` and `✓ kit home` with no `✓ help` or `✗ help`; a resumed build with a full `status.json` starts its builder with `--resume <session>` and no `KIT_DOCTOR_SKIP`. The missing-helper and hang cases fail on the old doctor.
- Validation: `RESULT: ok unit 57/57 (1 files)` (`kit unit --affected`); `tests/kit-settings.test.ts`, `tests/kit-tests-clean.test.ts`, `tests/agent-scripts.test.ts` pass 60/60; `npm run lint` exit 0; `RESULT: ok doctor 11/11 checks passed`; `RESULT: ok status all 770 tickets, 593 closed, 1 open PRs`.
- Commits: b7cf6b9d7 (the change), e4efb0ff9 (review fixes round 1), 23a963300 (review fixes round 2), then review fixes round 3.
- Review decisions:
  - Round 1: the copy's `kit version` had been given `KIT_HELP_TIMEOUT`, which left a healthy copy 0.3 s in tests (P2 race); fixed with its own `KIT_HOME_TIMEOUT`, also used by the `kit` note. Added real front-door cases for a silent version, a hanging version and output naming the copy's project. Declined: a typed `status.json` fake (no such type in the tests yet); `timed out` for an empty message (later taken in round 2).
  - Round 2: the output order between stdout and stderr can differ in the copy (P3 race); kept the exact match and documented the order rule. Declined: comparing sorted sets of lines, because that would accept output that differs only in order. Added the 137/124 timeout pair, the `kit` note's limit and an extra copy-only line; `timed out` for a copy stopped before printing.
  - Round 3: added commits and review decisions here (P3 ticket); a version with its own RESULT line and one whose last line has no newline, through the real front door; ` (timed out)` after any stopped copy's last line; a longer hang so the `kit` note's time bound has margin. Declined: asserting that a two-stream version keeps `✗ kit home`, because whether its lines swap is a race, not a fixed outcome.
- Feature list: no change (kit-internal doctor gate, nothing a site editor user sees).

### Follow-ups

- Spec (P3): 9dcaa86b8:docs/wayfinder/kitchen-everywhere/build/tickets/36-doctor-kit-home-skip-only-for-version.md:48 — P3 ticket: the Done's "Commits:" line names b7cf6b9d7, e4efb0ff9 and 23a963300. None of these is on the branch. The commits in scope are 26fe6f62c (the change), 53a979fef (round 1), 3e59eeba6 (round 2) and 9dcaa86b8 (round 3), so the record points at SHAs nobody can find after the rebase. Fix: replace them with the branch's SHAs, or with the merge SHA after `kit pr`.
- Spec (P3): 9dcaa86b8:docs/wayfinder/kitchen-everywhere/build/tickets/36-doctor-kit-home-skip-only-for-version.md:50 — P3 ticket: round 1 declines "a typed `status.json` fake (no such type in the tests yet)". That is wrong: `tests/agent-resume.test.ts:14` already declares `interface Status` for exactly this file. Fix: correct the decision text, and take the finding (see the Standards item below).
- Standards (P3): 26fe6f62c:tests/kit-doctor.test.ts:1064 — P3 style: the full `status.json` fake for the resumed build test is an untyped object literal passed to `JSON.stringify`. This breaks CODING_STANDARDS.md › Test fixtures: "Type fakes with `satisfies` or a declared type". A typed fake would also have caught a field mismatch: the existing `Status` type has `effort: string`, but this fake writes `effort: null`. Fix: move `Status` from `tests/agent-resume.test.ts:14` into a shared test support module (or export it), mark the literal `satisfies Status`, and widen `effort` to `string | null` if the runner really writes null.
- Validation gaps (gap): `scripts/agents/kit.d/doctor:267` resolves `help_dir` to its real path so the copy's path can be read back as the kit's. No test proves this: on a machine where `/tmp` is not a symlink, the tests pass with or without the line. Test to add: in the real-front-door case (`tests/kit-doctor.test.ts`, the "through the real front door" test), set `TMPDIR` to a symlink pointing at a real folder. Run the version that names its own path (`printf "%s: …" "$0" >&2; exit 1`) with `KIT_DOCTOR_SKIP=help`, and assert exit 0 with `skipped help, kit home`.
- Validation gaps (gap): Nothing tests the cross case where the help exits non-zero but the copy times out (`doctor:331`/`:332`: `help_code=1`, `code=124`). Test to add: the `version` help runs `exit 1`, the home's `kit` runs `sleep 5`, with `KIT_HOME_TIMEOUT: "0.5"` and `KIT_DOCTOR_SKIP: "help"`. Assert exit 1, `✗ kit home: a copy of … fails kit version: (timed out)`, and a RESULT ending `1 failed: kit home`. Also test the reverse: the help hangs and the copy exits 1 fast. The existing "fast" case covers only a copy whose message differs, not one with the same exit as an exit-1 help.

