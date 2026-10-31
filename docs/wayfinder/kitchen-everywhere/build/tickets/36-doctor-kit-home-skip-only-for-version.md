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
- Tests (`tests/kit-doctor.test.ts`): a copy that fails through a missing helper, or with the same words but another exit, refuses `agent.sh build` with `✗ kit home`; a `version` whose help and copy both hang skips both (`skipped help, kit home`) while a copy that fails fast, or a copy that hangs after a help that fails fast, does not; `version (no usage)` with a copyable failing home still fails `kit home`; through the real front door, a version whose error names its own path, one that prints nothing (only the front door's RESULT line), one that prints its own RESULT line (no line from the front door), one whose last line has no newline, one ending in blank lines and one that hangs (`RESULT: fail version interrupted (timed out)`) are skipped and fail without the skip, while one naming the copy's project folder, or printing an extra line in the copy, keeps `✗ kit home`; a help killed after ignoring SIGTERM matches a copy stopped by it; the `kit` note's `version` stops at `KIT_HOME_TIMEOUT`, leaving the note out; a run without `--quiet` puts the `problem: help` line between `✓ commands` and `✓ kit home` with no `✓ help` or `✗ help`; a resumed build with a full `status.json` starts its builder with `--resume <session>` and no `KIT_DOCTOR_SKIP`. The missing-helper and hang cases fail on the old doctor.
- Validation: `RESULT: ok unit 57/57 (1 files)` (`kit unit --affected`); `tests/kit-settings.test.ts`, `tests/kit-tests-clean.test.ts`, `tests/agent-scripts.test.ts` pass 60/60; `npm run lint` exit 0; `RESULT: ok doctor 11/11 checks passed`; `RESULT: ok status all 770 tickets, 593 closed, 1 open PRs`.
- Commits: "Doctor skips a failing kit home only when version caused it" (the change), "Review fixes round 1" to "Review fixes round 3", the follow-ups commit, then "Fix blank-line match and cross timeout test after review" (by hand, after round 3); `kit pr` rebases, so the merge SHA is in `kit status`.
- Review decisions:
  - Round 1: the copy's `kit version` had been given `KIT_HELP_TIMEOUT`, which left a healthy copy 0.3 s in tests (P2 race); fixed with its own `KIT_HOME_TIMEOUT`, also used by the `kit` note. Added real front-door cases for a silent version, a hanging version and output naming the copy's project. Declined: a typed `status.json` fake (no such type in the tests yet: wrong, `tests/agent-resume.test.ts:14` has `interface Status`; now a follow-up); `timed out` for an empty message (later taken in round 2).
  - Round 2: the output order between stdout and stderr can differ in the copy (P3 race); kept the exact match and documented the order rule. Declined: comparing sorted sets of lines, because that would accept output that differs only in order. Added the 137/124 timeout pair, the `kit` note's limit and an extra copy-only line; `timed out` for a copy stopped before printing.
  - Round 3: added commits and review decisions here (P3 ticket); a version with its own RESULT line and one whose last line has no newline, through the real front door; ` (timed out)` after any stopped copy's last line; a longer hang so the `kit` note's time bound has margin. Declined: asserting that a two-stream version keeps `✗ kit home`, because whether its lines swap is a race, not a fixed outcome.
  - After round 3 (by hand): output ending in blank lines now matches, as `$(< …)` drops them from the help's side (P3 fault, with a real-front-door case that fails without the fix); a test for a help that fails fast while the copy hangs (gap). The reverse (help hangs, copy fails fast) was already the `fast` case.
- Feature list: no change (kit-internal doctor gate, nothing a site editor user sees).

### Follow-ups

- Standards (P3): 26fe6f62c:tests/kit-doctor.test.ts:1064 — P3 style: the full `status.json` fake for the resumed build test is an untyped object literal passed to `JSON.stringify`. This breaks CODING_STANDARDS.md › Test fixtures: "Type fakes with `satisfies` or a declared type". A typed fake would also have caught a field mismatch: the existing `Status` type has `effort: string`, but this fake writes `effort: null`. Fix: move `Status` from `tests/agent-resume.test.ts:14` into a shared test support module (or export it), mark the literal `satisfies Status`, and widen `effort` to `string | null` if the runner really writes null.
- Validation gaps (gap): `scripts/agents/kit.d/doctor:267` resolves `help_dir` to its real path so the copy's path can be read back as the kit's. No test proves this: on a machine where `/tmp` is not a symlink, the tests pass with or without the line. Test to add: in the real-front-door case (`tests/kit-doctor.test.ts`, the "through the real front door" test), set `TMPDIR` to a symlink pointing at a real folder. Run the version that names its own path (`printf "%s: …" "$0" >&2; exit 1`) with `KIT_DOCTOR_SKIP=help`, and assert exit 0 with `skipped help, kit home`.
- Nit: `scripts/agents/kit.d/doctor:267`: `help_dir=$(cd -- "$help_dir" && pwd -P)` leaves `help_dir` empty if the `cd` ever failed, sending the help files to `/0.out` and so on. Fix: `help_dir=$(realpath -- "$help_dir") || exit 1`, or `|| exit 1` after `mktemp -d`.
- Nit: the comment at `scripts/agents/kit.d/doctor:281-282` ("the shared version comes first") relies on the folder order filled at `:230-242` (`folders[0]` is the shared folder). Fix: point the comment at that loop.
- Standards (P3): 26fe6f62c:tests/kit-doctor.test.ts:1077 — P3 style: the `status.json` fake for the resumed-build test is an untyped object literal passed straight to `JSON.stringify`. This breaks CODING_STANDARDS.md › Test fixtures: "Type fakes with `satisfies` or a declared type". Evidence: `tests/agent-resume.test.ts:14` already declares `interface Status` with `effort: string`, but this fake writes `effort: null`, a mismatch a typed fake would have caught. Fix: export `Status` (or move it into `tests/support/`), add `satisfies Status` to the literal, and widen `effort` to `string | null` if the runner writes null. The ticket already records this under Follow-ups, so leaving it for later is fine.
- Validation gaps (gap): No test proves the real-path line at `scripts/agents/kit.d/doctor:267` (`help_dir=$(cd -- "$help_dir" && pwd -P)`). Where `/tmp` is not a symlink, the tests pass with or without it. Already recorded in the ticket's Follow-ups. Test to add: in the real-front-door test (`tests/kit-doctor.test.ts:986`), set `TMPDIR` to a symlink pointing at a real folder. Run the version that names `$0` with `KIT_DOCTOR_SKIP=help` and assert exit 0 with `skipped help, kit home`.
- Validation gaps (gap): The missing-helper "Done when" item is only faked. At `tests/kit-doctor.test.ts:907` a stub `kit` prints `kit-lib.sh: No such file…`; no copy actually lacks a helper. Test to add: in the real-front-door fixture, write `scripts/agents/extra.sh` into `f.build` only. Make `kit.d/version` run `source "$KIT_ROOT/scripts/agents/extra.sh" || exit 1; exit 1`. The help exits 1 with no output; the copy's project has no `extra.sh`, so it exits 1 with bash's "No such file" error. Run it with `KIT_DOCTOR_SKIP=help` and assert exit 1, `✗ kit home` and `RESULT: fail doctor 1 failed: kit home`.
- Validation gaps (gap): The breakage ticket 19 exists for is not tested through the real front door. That is a real bash syntax error in `kit.d/version`, whose message names `$0`, a line number and a quoted source line, on two stderr lines. Only a `printf "%s: …" "$0"` stand-in is tested. Test to add: in the real-front-door test, write `kit.d/version` as `#!/usr/bin/env bash\nif then\n`. With `KIT_DOCTOR_SKIP=help`, assert exit 0 and `skipped help, kit home`; without it, assert `RESULT: fail doctor 2 failed: help,kit home`.
