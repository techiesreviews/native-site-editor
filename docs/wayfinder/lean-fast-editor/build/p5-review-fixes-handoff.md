# Phase 5 review fixes

## Resume snapshot: 2026-10-07 14:33 Amsterdam

The user explicitly requested handover to Claude. Codex stops new work after
saving this snapshot. The following two existing jobs remain running so Claude
can collect their results; do not launch duplicate jobs or mutate their source.
No active implementation worker remains; named Codex workers are idle.

1. Full native-save suite on frozen `ce7ec53` in
   `/home/ubulex/Projects/native-site-editor-p5-review-final` (787 cases).
   At the snapshot it has reached case 172; no result is claimed. Its command
   PID is `2157231`, wrapper parent `2156790`, fixture uses port **5216**.
   Read `.scratch/p5-review/final-full-native-save.log` in that worktree for the
   final summary. Verify current PID ownership before any process action.
2. Narrow Claude Opus 5.5 / medium review of `ce7ec53..ce4008f`, CLI PID
   `2168831`, wrapper `2168827`. Read the preparation workspace's
   `.scratch/p5-review/claude-touch-followup/{status.json,result.md,stdout.json,stderr.log}`.
   The wrapper verifies exit/errors/denials/exact model and records `verified`;
   it is still running at this snapshot.

**Latest complete code stack:** `build/p5-title-touch-fix`, immutable
`ce4008fe683e05e9ccb73095a0f9e6c4ae95e7f8`, in
`/home/ubulex/Projects/native-site-editor-p5-title-touch-fix`. It adds only a
mouse-only pointerup fallback to the previous final candidate, keeping touch/
pen targets until click, plus delayed-input tests. Its type checks, 1,050 units,
strict test TypeScript and production build pass. Its browser checks are pending.
Tests simulate touch/pen ordering; they are not hardware touch proof.

**Next actions, in order:** collect both running jobs; assess the narrow review;
after the full browser suite releases its server, run the touch tests serially:

- Failing-before tree: `native-site-editor-p5-title-touch-red`, test-only
  `56cc8a0e78346b3b55a303b532c5c50e91ca29a3`. Run the two delayed touch/pen cases.
- Fixed tree: `native-site-editor-p5-title-touch-fix`, `ce4008f`. Run all twelve
  `tests/native-save/native-page-title-refresh.spec.ts` cases, retaining every
  assertion. Keep full-suite proof attributed to `ce7ec53`, and this added proof
  to `ce4008f`; do not claim a full run on the later head.
- Address genuine failures; update this handoff and the map with actual results.
  Assess the independent review before landing. No merge, push or deploy has
  happened. The wider Wayfinder timing and main-module split remain open.

Use Node 24; the existing executable directory is
`/home/ubulex/.npm/_npx/387698761821791d/node_modules/node/bin`. Existing worktrees
have dependency symlinks. Follow applicable AGENTS.md and lex-coding. Root
preparation workspace is on `build/p5-review-handoff`; only the requested CSS
changes and handoff documentation are integrated there. Preserve all worktrees,
failure artifacts, original Claude dirty worktree and user configuration.

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
**344 KB**. The full native-save suite is running on port 5216. Logs live in this worktree's
`.scratch/p5-review/final-*.log`. Browser suites use Chromium; pointer task ordering
is not separately proved across other engines.

Claude Opus 5.5 / medium reviewed only `1cc9cbc..ce7ec53`; its records are
in `.scratch/p5-review/claude-final-followup/` under the preparation workspace.
Exit zero, `is_error: false`, no JSON errors or permission denials, exact
`claude-opus-5-5` model usage and `REVIEW_STATUS: complete` are verified. All three
preceding low findings are resolved and no blocking defects are reported. A
possible delayed touch/pen-click regression from the pointerup fallback is being
fixed on `build/p5-title-touch-fix`, without changing the running suite's head.
The conditional lost-dragend scenario remains unverified and optional.
The final candidate remains separate from the original frozen candidates and
has not been merged, pushed or deployed.

The original six reviews' ten denied calls were all recovered and audited;
their conservative raw runner status is retained. The audit is in
`.scratch/p5-review/claude-1300/denial-recovery-audit.md`.

Ticket 02 timing targets and ticket 08's remaining main-module split are still
open. The previous timings exceed 1.0 s cold / 0.4 s warm. No signed-in remote
deploy proof or image-byte-before-paint guarantee is supplied by these fixes.
