# Phase 5 review fixes

## Current state: 2026-10-07 15:14 Amsterdam

Claude continued from the 14:33 Codex snapshot. Nothing has been merged into
`dev`, pushed or deployed. Review completion is not approval to merge or deploy.

**Latest complete code stack:** `build/p5-title-touch-grace`, immutable
`9d6cb007c378a360f30dcca6bfa78fc6acb667a7`, worktree
`/home/ubulex/Projects/native-site-editor-p5-title-touch-grace`. On top of
`ce4008f` it adds:

- `f56ea19` (test only): touch/pen releases without a click, and a touch
  `pointercancel`.
- `8c4d254` (`src/main.ts` only): a matching touch/pen `pointerup` schedules
  `finishNativePageTitlePointer()` after `NATIVE_PAGE_TITLE_TAP_GRACE_MS`
  (1000 ms), only if the same pointer object is still pending. Delayed tap/pen
  clicks keep their target; a gesture without a click, or a click whose
  `pointerId` differs in some engine, no longer leaves Pages titles stale until
  the next interaction. Mouse, click, cancel, dragend, blur and drag-busy paths
  are unchanged.
- `9d6cb00` (test only): pins the lower bound (old titles still shown 500 ms
  after release), shows another pointer's release schedules nothing within
  1500 ms, and shows a new gesture inside the grace period outlives the previous
  release's timer.

### Results of the two jobs left running at 14:33

1. The full native-save run on `ce7ec53` did **not** complete. Its process tree
   was gone by 14:37, most likely ended with the Codex session; the log stops at
   case 225 of 787 with no summary (208 passed, 17 skipped, none failed). Its
   orphaned fixture server on port 5216, verified as owned by the
   `p5-review-final` worktree, was stopped. No full-suite result exists for
   `ce7ec53`.
2. The narrow Claude Opus 5.5 / medium review of `ce7ec53..ce4008f` completed:
   exit zero, `is_error: false`, no errors or denials, exact `claude-opus-5-5`.
   Its wrapper records `verified: false` only because one sentence precedes the
   `REVIEW_STATUS: complete` line. No concrete defects. It recorded that touch/pen
   releases without a click kept titles stale until the next interaction, and
   that a click with a different `pointerId` would never release them. Both are
   resolved by `8c4d254`.

### Validation, attributed to exact commits

| Commit | Result | Log |
| --- | --- | --- |
| `56cc8a0` (failing-before, test only on `ce7ec53`) | Both delayed touch/pen cases fail: the original target is detached before the click (spec line 227). | `p5-title-touch-red/.scratch/p5-review/title-touch-red-browser.log` |
| `ce4008f` | All **12** title-refresh browser cases pass. | `p5-title-touch-fix/.scratch/p5-review/title-touch-browser.log` |
| `f56ea19` (failing-before) | The two new no-click cases fail; 13 pass. The cancel case passes before the fix as a guard. | `p5-title-touch-grace/.scratch/p5-review/title-grace-red-browser.log` |
| `8c4d254` | Type checks, **1,050** units, `build:ui`, strict test TypeScript and **15/15** title cases pass. | `title-grace-*.log` |
| `9d6cb00` | Strict test TypeScript, **16/16** title cases and the **full native-save suite: 708 passed, 85 skipped, 0 failed** (793, 29.1 min). Byte gate **344 KB** of 350 KB. Cold paint/usable 1.197 s / 1.206 s, warm 0.777 s. | `title-pins-*.log` |

`9d6cb00` changes only tests relative to `8c4d254`, so the check, unit and build
results carry to the same source. A first full run started at `8c4d254` was
stopped after 56 cases because a test commit landed in its worktree mid-run; its
log is kept as `title-grace-full-native-save-aborted-8c4d254.log` and is not
evidence either way.

Claude Opus 5.5 / medium reviewed `ce4008f..8c4d254` (records in the preparation
workspace's `.scratch/p5-review/claude-touch-grace/`): verified, no concrete
defects. Its validation gaps (an ignored-pointer assertion that tested nothing,
the unpinned lower bound, and a stale timer) are covered by `9d6cb00`, which was
not separately reviewed. Remaining notes: any non-mouse `pointerType`, including
an empty one, takes the grace path; pen `pointercancel` and grace expiry while a
menu, input or drag is busy are untested; all touch/pen evidence is synthetic
Chromium event ordering, not hardware or other engines. The conditional lost-
`dragend` case remains unverified and optional.

The Page Structure indentation remains 4 px per level (`--structure-indent`) on
this stack and in the preparation workspace.

**Remaining work:** decide whether to land `build/p5-title-touch-grace` (it
contains the whole review-fix stack) into `dev`; preview deploy and visual proof;
ticket 02 startup timing targets (1.0 s cold / 0.4 s warm, still missed); and
ticket 08's larger main-module split.

Use Node 24 from `/home/ubulex/.npm/_npx/387698761821791d/node_modules/node/bin`.
Worktrees use dependency symlinks. Preserve all worktrees, failure artifacts, the
original Claude dirty worktree and user configuration.

Continuation of [the second batch](p5-second-batch-handoff.md), following the
six Claude Opus 5.5 / medium reviews that started at 13:00 Amsterdam.

The original candidate stays frozen at `679f931`. The new candidate is
`build/p5-review-fixes`, head `1cc9cbc030ad79fab24e2f2513c0081ecbcd8035`, in
`/home/ubulex/Projects/native-site-editor-p5-review-fixes`. It has not been merged
to `dev`, pushed or deployed. Product fixes remain separate from the user's
current preparation branch except for the requested structure CSS.

| Finding | Fix and behavior |
| --- | --- |
| History anchor remount | `0dce29f` uses the current anchor for position; opening files preserves the site History panel's ownership. |
| Accepted restore closed mid-flight | `0dce29f` separates UI close from domain restore ownership; stale account/repository/branch/file/new-mount work still refuses. |
| Unread source hydrated during a page-move confirmation | `f6a1fef` compares only sources actually captured at opening, while retaining genuine source-change refusal. |
| Deferred title refresh removes pointer targets | `3ea477e` waits through the real click/cancel sequence before flushing. `ac8ea63` reopens the normally closed Pages panel before checking titles. |
| Startup failure lost after generation handoff | `47b4c9c` captures the repository-start epoch at its actual increment, preserving current-error display and stale-response refusal. |
| Slot rail still uses 16 px | `6817c8d` shares the rows' 4 px increment. The current preparation workspace carries it as `51d8243`. |
| Default-enabled editor drop omitted | `6622d0e` restores its contribution. `f88e019` fixes the existing upstream standalone plain-drop `$0` leak by decoding only the canonical escaped literal plus final tabstop. Genuine snippets keep their original handling; full snippet/tabstop support remains outside this fix. |
| Slot send probe attaches to a replaced button | Test-only `68b7f52` arms the actual clicked row button and keeps all timing/source assertions. |

## Validation

At this product stack, type checks, all **1,048 unit tests**, and production
build pass. At final head `1cc9cbc`, all **12 production editor checks** pass,
including real Files drag/drop, exact source text, Undo/Redo and local draft
recovery after reload. On their isolated fixed heads, all eight title browser
checks and all three concurrent-startup/error cases pass. New title and startup
tests have deterministic failing-before evidence. History units have failing-
before evidence; its two strengthened browser cases pass in the integration
focused run recorded in the prior handoff.

All **64 combined focused checks**, **32 smoke checks**, and the three-run byte
gate pass. The byte median is **344 KB**, within 350 KB. Cold paint/usable
medians are 1.165 s / 1.178 s, warm 0.783 s; timing targets still miss.
The full `1cc9cbc` run was deliberately interrupted to validate the three
follow-ups together; it is not a passing full-suite result. Its log is preserved
as `fixes-full-native-save.log`. The interrupted test and two subsequent attempts
blocked by its lingering server are not product-failure evidence. The old
fixture processes were stopped after checking their owning worktree.
The earlier **691 passed / 85 skipped** belongs only to `679f931`.

Logs live in the new candidate's `.scratch/p5-review/`. Previous failed tests,
traces and screenshots remain in their originating worktrees. The two title
assertion failures were verified from trace DOM: the closed panel's selected
tree item already had `aria-label="Fern & Kettle"`. Reopening the panel preserves
normal navigation behavior and allows the original visible-title assertion.

The native T3 browser was opened on a separate local tab `tab_1b`, but direct
and environment-port navigation failed with Electron preload/client errors.
No new visual or signed-in remote proof is claimed. The temporary demo server
was stopped. The earlier native T3 4 px screenshot remains in the second handoff.

## Independent follow-up

Claude Opus 5.5 / medium reviewed only immutable `679f931..1cc9cbc` and
necessary local call sites. Its read-only brief, raw JSON, result and status are
under the preparation workspace's `.scratch/p5-review/claude-followup/`.
The CLI exited zero, `is_error` is false, errors are empty, no commands were
denied, and `modelUsage` includes exact `claude-opus-5-5`. The report starts
`REVIEW_STATUS: complete`, confirms the main fixes, and finds no blocking defects.
It flags three low-severity remaining paths: History restore completion after a
new mount or new draft needs visible feedback; pointer release without a click
can delay titles; title refresh during a native page drag can replace its row.
The drag issue already existed. These follow-ups are being investigated on
separate worktrees; the reviewed head and full-suite source remain frozen.
Review completion does not constitute approval.

## Final follow-ups

The final candidate is `build/p5-review-final` at immutable
`ce7ec53ef713762c2690c94ac06ee60977339a53`, worktree
`/home/ubulex/Projects/native-site-editor-p5-review-final`. It includes:

- `b895484`: matched-pointer `pointerup` task fallback; Pages drag state counts
  as busy, with refresh after drag end. Two new browser checks fail before the
  patch (`72442da`) and pass after it. The original pointer-click checks stay.
- `ce7ec53`: an accepted server restore that cannot safely apply locally now
  announces completion only within the captured account/repository/branch/
  generation. It does not reload sources or clear drafts. Normal accepted
  restore completion and cross-workspace refusal stay guarded; unchanged results
  do not claim a new commit. Two held-response browser cases verify History
  remount feedback, no automatic snapshot load, and retention of a new draft.

At this final head, type checks, **1,050 units**, production build and all
**18 History/title browser checks** pass. The three-run byte gate passes at
**344 KB**. Its full native-save run stopped unfinished at case 225 (see Current state). Logs live in this worktree's
`.scratch/p5-review/final-*.log`. Browser suites use Chromium; pointer task ordering
is not separately proved across other engines.

Claude Opus 5.5 / medium reviewed only `1cc9cbc..ce7ec53`; its records are
in `.scratch/p5-review/claude-final-followup/` under the preparation workspace.
Exit zero, `is_error: false`, no JSON errors or permission denials, exact
`claude-opus-5-5` model usage and `REVIEW_STATUS: complete` are verified. All three
preceding low findings are resolved and no blocking defects are reported. A
possible delayed touch/pen-click regression from the pointerup fallback is being
fixed on `build/p5-title-touch-fix` and bounded on `build/p5-title-touch-grace`.
The conditional lost-dragend scenario remains unverified and optional.
The final candidate remains separate from the original frozen candidates and
has not been merged, pushed or deployed.

The original six reviews' ten denied calls were all recovered and audited;
their conservative raw runner status is retained. The audit is in
`.scratch/p5-review/claude-1300/denial-recovery-audit.md`.

Ticket 02 timing targets and ticket 08's remaining main-module split are still
open. The previous timings exceed 1.0 s cold / 0.4 s warm. No signed-in remote
deploy proof or image-byte-before-paint guarantee is supplied by these fixes.
