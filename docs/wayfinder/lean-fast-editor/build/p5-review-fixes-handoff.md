# Phase 5 review fixes

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

Combined focused, smoke and byte checks are running. A new full native-save run
is pending. The earlier **691 passed / 85 skipped** belongs only to `679f931`.
Do not transfer that record to the new head.

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

Claude Opus 5.5 / medium is reviewing only immutable `679f931..1cc9cbc` and
necessary local call sites. Its read-only brief, raw JSON, result and status are
under the preparation workspace's `.scratch/p5-review/claude-followup/`.
The review is running; completion and any findings require checking exit status,
JSON errors, permission denials and exact model usage before recording a result.

The original six reviews' ten denied calls were all recovered and audited;
their conservative raw runner status is retained. The audit is in
`.scratch/p5-review/claude-1300/denial-recovery-audit.md`.

Ticket 02 timing targets and ticket 08's remaining main-module split are still
open. The previous timings exceed 1.0 s cold / 0.4 s warm. No signed-in remote
deploy proof or image-byte-before-paint guarantee is supplied by these fixes.
