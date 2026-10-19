---
title: "kit tests leave no trace in real worktrees"
type: task (AFK)
status: closed
assignee: ke-09
blocked_by: [04-kit-slice]
builder: sol
---

## What

kit's own tests write into the worktree that runs them. Example: `tests/kit-doctor.test.ts`
(`gateFixture()`; "agent.sh test bypass reaches runner validation …", "agent.sh silently consumes
successful doctor output") and `tests/agent-scripts.test.ts` (line ~229) run
`agent.sh build <real repo> /tmp/kit-doctor-*/missing.md`. `startRun()` in
`scripts/agents/agent-run.mjs` creates `<worktree>/.scratch/agent/build-<time>-<pid>-*/status.json`
before the brief is read, so each run leaves a "failed, exit 2" build-status folder in the real
worktree, where a later `agent.sh --resume` or `kit fix` (ticket 03) could pick it up.

- Every kit test points each run at a temp worktree or `--out` dir and removes its temp dirs
  (`t.after`). Find all offenders by running the guard below, not only the two named files.
- `agent-run.mjs` validates the brief (exists, readable) before creating the out dir, so a run that
  cannot start leaves no status folder anywhere (exit 2 as today).
- **Guard test** `tests/kit-tests-clean.test.ts`: lists the real worktree's `.scratch/agent`,
  runs the kit test files (`tests/kit*.test.ts`, `tests/agent-scripts.test.ts`,
  `tests/agent-resume.test.ts`) in a child `tsx --test`, and asserts no new folder appeared there and
  no `kit-doctor-*` / test temp dirs were left in `os.tmpdir()` by that run. It must not recurse
  into itself.
- **Lead addition (2026-10-19).** Ticket 04's runner saw `kit fix` pick a builder folder that
  unit tests run inside `kit pr` had left in `.scratch/agent`. The guard must cover every test
  file that `kit pr` runs and that calls `agent.sh` or `kit`: at least `tests/kit-fix*.test.ts`,
  `tests/kit-slice*.test.ts`, `tests/agent-resume.test.ts`, `tests/agent-run*.test.ts` and any
  other test that spawns `agent.sh`/`kit`, not only `kit doctor`.
- **One-off cleanup** of existing leftovers, documented in Done, not automated: list folders under
  `.scratch/agent/` of the live worktrees whose `status.json` has `"state": "failed"`, `"exitCode": 2`
  and a `brief` under `/tmp/kit-doctor-*` (or another test temp path); delete only those, and list
  them in Done. Never delete other people's runs. (On 2026-10-19 the ticket writer found no
  `.scratch/agent` folders in the five checkouts present; record what you find.)

## Files

- `tests/kit-doctor.test.ts`
- `tests/agent-scripts.test.ts`
- other kit test files the guard test flags
- `scripts/agents/agent-run.mjs` (brief check before the out dir), `scripts/agents/agent.sh` if needed
- `tests/kit-tests-clean.test.ts` (new; also holds the missing-brief case below)

## Done when

- `tests/kit-tests-clean.test.ts` passes, and fails when one offending case is put back (say how you
  checked in Done).
- A unit test in `tests/kit-tests-clean.test.ts` proves `agent.sh build <worktree> <missing brief>` exits 2 and creates no
  `.scratch/agent` folder.
- The guard test runs every test file that `kit pr` runs and that calls `agent.sh` or `kit`
  (kit-fix, kit-slice, agent-resume, agent-run and the rest), and none of them leaves a folder
  in the real worktree's `.scratch/agent` (lead addition).
- Done lists the leftover folders found and deleted (or "none").
- The unit tests for the change pass (`scripts/agents/unit.sh tests/kit-tests-clean.test.ts tests/kit-doctor.test.ts tests/agent-scripts.test.ts`).
- Sol review via `kit review --ticket` with no open findings; landed via `kit pr --ticket` into
  `dev` with CI green.
- Dogfood: built with `kit slice`; the Done section says where it helped or failed.


## Done (2026-10-19)

- Behaviour: fresh runs read the brief before creating any output directory; unreadable, missing, directory and dangling-link briefs exit 2 without artifacts. Explicit `--out` creates no default `.scratch/agent` directory. Resumes still use their recorded session and optional replacement prompt.
- Tests: the new guard discovers the `tests/*.test.ts` files used by the full `kit pr` tier, selects all kit tests and runner/wrapper callers, excludes itself, and ran 675 tests from 23 files. Each child suite has a private OS temp directory; the guard rejects surviving test paths and new real-worktree run folders. Only tsx's empty runtime IPC directory is permitted and is removed with the private directory. `NODE_TEST_CONTEXT` is cleared and a positive executed-test count prevents a silent empty run. Doctor gate tests use a disposable explicit output path; the adapter test now compares actual run-directory entries after a bad brief. The guard also caught Chromium leaving `.org.chromium.Chromium.*` directories during the first required three-file rerun (`.scratch/unit/20261019T110351-29.log`); `kit-shots-layout.test.ts` now gives Chromium a private temp directory removed by `t.after`, including launch failures.
- Negative verification: the original implementation failed the guard on two real-worktree folders and failed all three original bad-brief cases (`.scratch/unit/20261019T105518-21.log`). After the fix passed, temporarily restored one doctor fixture call targeting the real worktree without `--out`, using its valid fake brief (fake CLI exit 9). The guard failed on the resulting new folder (`RESULT: fail unit 5/6 (1 files) log .scratch/unit/20261019T110228-29.log`). Restored the fixture in `finally` and removed only the probe folder after checking its status, brief and worktree.
- Validation: `RESULT: ok doctor 7/7 checks passed`; `scripts/agents/kit unit --affected`: `RESULT: ok unit 102/102 (5 files) log .scratch/unit/20261019T110510-30.log` (after fixing the additional browser-temp leak); `npm run check` and `npm run lint` exited 0; `scripts/agents/kit specs --affected`: `RESULT: ok specs none affected`; `git diff --check` passed. The focused acceptance command `scripts/agents/kit unit tests/kit-tests-clean.test.ts tests/kit-doctor.test.ts tests/agent-scripts.test.ts` (which invokes the required `scripts/agents/unit.sh` with those three files) passed: `RESULT: ok unit 48/48 (3 files) log .scratch/unit/20261019T110620-28.log`. The final affected and focused runs both executed all 675 guarded tests successfully; check and lint also passed again after the browser cleanup change.
- Dogfood: this builder is running inside `kit slice`; `.scratch/kit-slice/09-kit-tests-leave-no-trace/state.json` records the generated brief, builder output, `gpt-6.1-sol`/high and completed `brief` phase. Its scoped brief and persisted phase state helped keep the build bounded and recoverable. The runner owns the remaining commit, Sol review, fix and PR phases.
- Commits and review decisions: changes intentionally remain unstaged; no real-worktree commits, pushes or agent delegations were performed by this builder. Independent `kit review --ticket` (Sol/medium), `kit pr --ticket`, merge into `dev` and green CI remain for the owning slice runner after this handoff, as required by the build contract. No independent review result or landed commit is claimed here.
- Cleanup: removed the two baseline probe folders `.scratch/agent/build-1792407351457-10800-Ue7Xv5` and `.scratch/agent/build-1792407351539-10815-LE6CGo` (both failed/exit 2, briefs under this guard's private `kit-doctor-*` directories), plus the regression probe `.scratch/agent/build-1792407756723-9893-SH2JB3` (failed/exit 9). No other matching leftovers were found in this worktree. All guard and brief-test temporary directories were removed by test cleanup.
- External cleanup limitation: the second audit found 26 matching failed/exit-2 test runs in other live worktrees. None was deleted: those worktrees are outside this builder's writable sandbox roots. The runner must remove the following audited folders after rechecking their status and test brief:

```text
/home/ubulex/.t3/worktrees/native-site-editor/t3-837034a2/.scratch/agent/build-1792244035216-1588313-OBMiGG
/home/ubulex/.t3/worktrees/native-site-editor/t3-837034a2/.scratch/agent/build-1792244035347-1588445-DWZqHV
/home/ubulex/.t3/worktrees/native-site-editor/t3-837034a2/.scratch/agent/build-1792271012719-3353909-7VNTzJ
/home/ubulex/.t3/worktrees/native-site-editor/t3-837034a2/.scratch/agent/build-1792271012854-3354122-qXOh0Q
/home/ubulex/.t3/worktrees/native-site-editor/t3-837034a2/.scratch/agent/build-1792299153580-2248626-X5xMjp
/home/ubulex/.t3/worktrees/native-site-editor/t3-837034a2/.scratch/agent/build-1792299153731-2248975-FKXghq
/home/ubulex/.t3/worktrees/native-site-editor/t3-837034a2/.scratch/agent/build-1792332893018-306592-v4mtlw
/home/ubulex/.t3/worktrees/native-site-editor/t3-837034a2/.scratch/agent/build-1792332893214-306732-uIXRJB
/home/ubulex/Projects/native-site-editor-build-ke-05-specs-digest/.scratch/agent/build-1792404764798-19261-wmEHNK
/home/ubulex/Projects/native-site-editor-build-ke-05-specs-digest/.scratch/agent/build-1792404765002-19414-9jVpvn
/home/ubulex/Projects/native-site-editor-build-ke-05-specs-digest/.scratch/agent/build-1792405242422-16459-SM9iec
/home/ubulex/Projects/native-site-editor-build-ke-05-specs-digest/.scratch/agent/build-1792405242732-16606-vHbtQq
/home/ubulex/Projects/native-site-editor-build-ke-05-specs-digest/.scratch/agent/build-1792405562264-16998-rHn2kh
/home/ubulex/Projects/native-site-editor-build-ke-05-specs-digest/.scratch/agent/build-1792405562502-17120-uwAhVY
/home/ubulex/Projects/native-site-editor-build-ke-05-specs-digest/.scratch/agent/build-1792405698651-337008-7SUkTf
/home/ubulex/Projects/native-site-editor-build-ke-05-specs-digest/.scratch/agent/build-1792405698777-337133-gKGKDA
/home/ubulex/Projects/native-site-editor-build-ke-05-specs-digest/.scratch/agent/build-1792406517037-452019-gbFQ2l
/home/ubulex/Projects/native-site-editor-build-ke-05-specs-digest/.scratch/agent/build-1792406517171-452145-YFUUmX
/home/ubulex/Projects/native-site-editor-build-ke-05-specs-digest/.scratch/agent/build-1792407376438-640653-DILgQ3
/home/ubulex/Projects/native-site-editor-build-ke-05-specs-digest/.scratch/agent/build-1792407376592-640765-hqe6WH
/home/ubulex/Projects/native-site-editor-fix-agent-menu-tidy/.scratch/agent/build-1792401243938-3577857-nxuv8W
/home/ubulex/Projects/native-site-editor-fix-agent-menu-tidy/.scratch/agent/build-1792401244069-3578196-znkPPJ
/home/ubulex/Projects/native-site-editor-fix-nested-component-editing/.scratch/agent/build-1792396867490-18753-OsI2yG
/home/ubulex/Projects/native-site-editor-fix-nested-component-editing/.scratch/agent/build-1792396867811-18849-OmBPIY
/home/ubulex/Projects/native-site-editor-fix-nested-component-editing/.scratch/agent/build-1792396975580-16085-Wlfnxj
/home/ubulex/Projects/native-site-editor-fix-nested-component-editing/.scratch/agent/build-1792396975832-16190-HiUjVd
```

The first audit also found these four matching folders in the ke-08 worktree. They no longer matched at the second audit; this builder did not delete or modify them:

```text
/home/ubulex/Projects/native-site-editor-build-ke-08-preview-timeout/.scratch/agent/build-1792406576066-19822-pOVbTT
/home/ubulex/Projects/native-site-editor-build-ke-08-preview-timeout/.scratch/agent/build-1792406576240-19951-oFHp5F
/home/ubulex/Projects/native-site-editor-build-ke-08-preview-timeout/.scratch/agent/build-1792406761561-553744-2TggRg
/home/ubulex/Projects/native-site-editor-build-ke-08-preview-timeout/.scratch/agent/build-1792406761683-553898-uLHlq1
```

### Review follow-up (2026-10-19)

- Accepted finding `7a1a36fc:docs/wayfinder/kit-economy/build/tickets/09-kit-tests-leave-no-trace.md:73` (P2): the required external cleanup remains incomplete; this finding is not declined.
- Rechecked all 26 listed folders: each is a real directory with `state: failed`, `exitCode: 2`, a `/tmp/kit-doctor-*/missing.md` brief and a `worktree` matching its containing checkout.
- Attempted the one-off deletion through the ordinary sandboxed runner. The first removal failed with `Read-only file system '/home/ubulex/.t3/worktrees/native-site-editor/t3-837034a2/.scratch/agent/build-1792244035216-1588313-OBMiGG'`. Deleted 0/26; all remaining folders were left untouched. This session cannot request elevated filesystem access.
- Resolution still required from the owning runner with write access to the listed worktrees: recheck the same status, brief and worktree predicates immediately before removing each listed folder, then record the removals here. No cleanup completion is claimed.
- Follow-up validation: `RESULT: ok doctor 7/7 checks passed`; ticket consistency and `git diff --check` passed. No source code changed, so the previously recorded unit, check and lint results remain applicable.

Declined: none.
