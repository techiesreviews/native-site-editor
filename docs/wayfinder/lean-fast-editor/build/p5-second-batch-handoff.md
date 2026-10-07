# Phase 5 continuation review handoff

This continues the [first review batch](p5-review-handoff.md), from Claude's
thread `7d475731-adb3-4c9c-9930-edfb1997bdad`. Review is reserved for Claude Opus
5.5 at medium effort after 2026-10-07 13:00 Europe/Amsterdam. No Claude review,
merge to `dev`, or deployment is claimed here.

## Frozen slices

The controller stack starts from the isolated title-refresh fix `49061eb`.
Monaco remains a separate final landing slice. Each new controller keeps domain
transactions in their existing host until its callers have narrow interfaces.

| Slice | Branch | Base | Immutable head |
| --- | --- | --- | --- |
| Setup checklist | `build/p5-setup-checklist` | `49061eb` | `ac19da335f29518be4cb92b5b4a1417a670ebcd3` |
| Setup entry | `build/p5-setup-entry` | `ac19da3` | `f625d107f1eef3f95c38a9e6eac4b042eb5ccac1` |
| History panel | `build/p5-history-controller` | `f625d10` | `c5af463ae40f68e31c42e76deaf35556c0d10ff7` |
| Command palette | `build/p5-palette-controller` | `c5af463` | `d0983ba2aa3ed5371b8be4014cb16a544a883b7f` |
| Palette revision contract fix | `build/p5-palette-revision-fix` | `d0983ba` | `de8c74d14d9817cc21ea6086d1f3f1172ebcd4b7` |
| Concurrent boot helper and server proof | `perf/boot-parallel-reads` | `f625d10` | `aa0cca2f8898af31380445c863240be11a29893e` |
| Concurrent startup adapter | `build/p5-boot-parallel-adapter` | `d0983ba` | `aa9ad844264a9e081173caa83ccbc28d561b9a10` |
| Pages actions controller and host integration | `build/p5-pages-controller` | `aa9ad84` | `1fba7788efef08350c89753ae7cf7ac7a6a0c48b` |
| Pages normal-retitle guard fix | `build/p5-pages-retitle-fix` | `1fba778` | `77dcdfdcd71943d67c6e11727391498cba686331` |
| Media/gallery controller, with required retitle fix | `build/p5-media-controller` | `1fba778` | `d5942510986128bf6d3bec90408483f57854728e` |
| Compact Page Structure indentation | `ui/compact-structure-indent` | `ac19da3` | `165645d5fc44f9f54b08ed7ef5bb3d92b64ac61b` |
| Second combined validation candidate | `build/p5-review-candidate-two` | `963f569` | `bf5dec1f87bcd590358c72537823409bbab8c76a` |

Worktrees are under `/home/ubulex/Projects/`, named
`native-site-editor-p5-setup-checklist`, `native-site-editor-p5-setup-entry`,
`native-site-editor-p5-history-controller`,
`native-site-editor-p5-palette-controller`,
`native-site-editor-p5-palette-revision-fix`, `native-site-editor-boot-parallel`,
`native-site-editor-p5-boot-parallel-adapter`,
`native-site-editor-p5-pages-controller`, `native-site-editor-p5-pages-retitle-fix`,
`native-site-editor-p5-media-controller`, `native-site-editor-compact-structure`
and `native-site-editor-p5-review-candidate-two`. Slice notes live in
each worktree's `docs/wayfinder/lean-fast-editor/build/` directory. Browser and
build logs live in `.scratch/p5-review/`.

Checklist owns its mount/progress/spotlight/timer lifecycle. Setup entry owns
wizard mounting and deferred callback identity; Get Started and repository
creation transactions remain in the host. History owns panel loading,
positioning, close/dispose and captured callback proofs; the `VersionView`
comparison/restore transaction remains intact. Palette derives live pages,
components, selection and readiness and owns registration/disposal; its two
existing lazy UI stages and domain actions are preserved. These four slices
reduce `main.ts` from 9,007 to 8,775 lines. The deeper Pages actions controller
owns Rename, Duplicate, Delete, URL planning/change and move policy, retaining
the existing central transaction, redirect IO and page-title refresh in the
host. It reduces main by another 280 lines, to 8,495. It also refuses source or
workspace changes while indexing, picking a destination or confirming a move;
proofs are refreshed after legitimate source hydration. Ticket 08's full split
remains open. Media owns its captured workspace, image-picker source/master
proofs, gallery mount/disposal, busy observer and refresh coordination. Atomic
draft/upload/Undo writes remain in the original host transaction. Its hook
`cf9883f` reduces main by 85 more lines, to 8,410. The media branch applies the
retitle fix afterward as `d594251`.

The boot helper starts independently authenticated session and repository GETs
together. Both successful endpoints return an opaque SHA-256 session tag,
derived from the server's authenticated session ID. It is not an authentication
credential. The helper adopts a repository receipt only with the original
session-response identity, a matching nonempty tag, and current source/epoch
proof. It settles speculative repository errors without applying state. The
helper-only branch does not connect this behavior to `main.ts`; the startup
adapter cherry-picks it as `4cd6951` and connects it while preserving API retry,
error and in-flight accounting. Installation returns use a fresh listing.
Navigation that advances generation while the prefetched receipt waits causes
the old boot to return, preserving the newer workspace.

The user requested minimal Page Structure indentation. Its shared CSS spacing
is now 4 px per depth, down from 16 px, for rows, drag markers, slot editors and
shared-section controls. The same CSS commit is applied to the user's current
workspace as `1ee54aa`; the isolated branch remains available for review.

## Evidence recorded so far

All checks use Node `24.21.0`. Browser suites run serially.

- Checklist: type checks, production build, 991 unit tests, 49 focused browser
  checks, 32 smoke checks and the 340 KB pre-paint budget pass. Focused checks
  include `native-setup-wizard.spec.ts`, checklist, onboarding and lazy panels.
- Setup entry: type checks, production build, 997 unit tests and six focused
  lifecycle unit checks pass. The 33 checklist/onboarding/lazy checks and all
  16 wizard checks pass, as do 32 smoke checks and the 340 KB byte gate.
- History: type checks, production build, 1,003 unit tests and six focused
  lifecycle unit checks pass. All 25 History/action/store-history/lazy browser
  checks, 32 smoke checks and the 340 KB byte gate pass.
- Palette: type checks, production build, 1,007 unit tests and four focused
  lifecycle unit checks pass. The initial focused run had 28 passes and three
  failures; a three-case rerun reproduced all failures. The controller appended
  its mount epoch to the workspace revision, but the existing palette compares
  that revision exactly with the edit bar's captured origin. This blocked
  selection commands including Shift+Enter before the palette opened. The
  isolated `de8c74d` fix restores the host revision contract while retaining
  disposal guards; its new contract test fails before the fix and passes after
  it. All 1,008 units, five focused units, 31 focused browser checks, 32 smoke
  checks and the 341 KB byte gate pass on the isolated fix branch. The failing
  logs and artifacts remain in the original palette
  worktree's `palette-browser.log`, `palette-repro.log` and
  `palette-first-failure/`. Do not land `d0983ba` without this fix.
- Boot helper/server proof: type checks, production build, 1,005 unit tests and
  eight targeted helper/worker checks pass. This is helper-only evidence, not
  an integrated startup or performance claim.
- Startup adapter: type checks, production build, 1,018 unit tests and 11
  focused receipt/helper/worker checks pass. All 46 startup, hash, onboarding,
  wizard and lazy-panel browser checks pass, including two deterministic
  concurrency and late-receipt cases. The three-run byte gate passes at 342 KB.
  Cold paint/usable median is 1.178 s / 1.185 s, warm 0.783 s. The first warm
  waterfall has session 120–224 ms and repositories 120–226 ms, confirming
  overlap; snapshot/branches start at 236/237 ms, first text reads at 343/344 ms
  and linked-text reads at 451 ms. These measurements remain above the local
  targets. The cold first-run waterfall is not the median run; do not subtract
  its API completion time from the median paint value.
- Pages: type checks, production build, 1,029 unit tests and ten focused
  controller tests pass. Its stack cherry-picks the prep as `c1c2531` and the
  required palette revision fix as `05b90b7` before host commit `1fba778`.
  The initial browser run passed 34 checks and failed one normal Rename case:
  the host's successful metadata write legitimately rebuilt the site object,
  causing the controller's post-write reference check to report a repository
  change after writing the title. The isolated `77dcdfd` fix keeps generation,
  scope and captured-route checks and permits that normal rebuild. Its two new
  tests fail before the fix and pass after it; all 1,031 units and 12 focused
  units, 35 focused browser checks, 32 smoke checks and the 343 KB byte gate
  pass. Original evidence
  is retained as `pages-browser.log` and `pages-first-failure/`. Do not land
  `1fba778` without the fix.
- Media: `cf9883f` passes type checks, production build, 1,036 units, seven
  focused controller units and all 47 media/images/lazy browser checks. This
  tested worktree stayed frozen during that run. After it completed, the
  required retitle fix was applied and rebuilt at `d594251`; smoke/budget is
  passed on that updated head: 32 smoke checks and the 343 KB byte gate. Media
  product files are unchanged by the fix.
- Compact structure: production build and 48 browser checks pass, covering
  nested rows, drag placement, slot actions, keyboard access and narrow layouts.
  Native T3 preview then became available with the correct tab ID. The rendered
  tree verifies depths 0–3 have computed padding 6/10/14/18 px. The saved local
  demo screenshot is
  `/home/ubulex/.t3/userdata/browser-artifacts/browser-screenshot-localhost-muxxq21n-49d0f967.png`.
  Its temporary fixture server has been stopped.
- Combined `bf5dec1`: type checks, 1,038 units and production build pass. The
  candidate cherry-picks retitle fix `77dcdfd` as `acffbbe`, compact indentation
  as `f2c494c`, then merges the complete Monaco trim branch at `da7cc2b`.
  An initial attempt to cherry-pick only the final Monaco test commit hit
  missing-parent conflicts; it was aborted, and the whole branch merged cleanly.
  All 11 production Monaco feature checks pass. The full native-save suite is
  running; its final smoke and budget verification remains queued.

The checklist timing median is cold 1.273 s / warm 0.897 s. A separate
three-run waterfall on the first integration candidate measured cold usable
1.313 s / warm 0.883 s. Its first warm run shows session 118–222 ms,
repositories 232–337 ms, snapshot 340–447 ms, first text reads 449–555 ms and
linked-text reads 557–662 ms; paint is 883 ms. These sequential reads motivate
the boot experiment. They do not meet ticket 02's 1.0 s / 0.4 s local timing
targets and do not constitute new signed-in remote proof.

## Review focus and remaining work

Review immutable per-slice diffs, including each new controller's ports and
lifecycle tests. Check that disposed or replaced controllers refuse late
mounts, timers, callbacks and resize handlers; captured workspace/source proofs
survive navigation; palette readiness remains lazy; History restore behavior
and setup ownership remain unchanged. Assess the boot tag and adoption gates
separately from its future main adapter. Keep low-impact indentation separate
from behavioral controller changes.

The final second-batch candidate still needs its full native-save suite,
production Monaco checks, smoke and byte/timing measurements. The native T3
preview evidence above is a local demo, not signed-in remote or release proof.
Continue with the [controller plan](p5-controller-plan.md); preserve
the existing draft/history transactions and one main-file writer.

The next timing investigation may separate requested-branch painting from late
branch-menu hydration, then assess account-scoped last-repository metadata for
earlier snapshot reads. Snapshot adoption would need authenticated session and
canonical repo-ID proof. Its current server authorization may reuse membership
data for up to 60 seconds, so it is not proof of immediate permission revocation.
Persistent source caching is deferred: it would require accepted snapshot SHA,
account/repo identity, drafts-first reads, and refusal after auth denial. Existing
text reads already deduplicate/batch and parallelize each CSS dependency level.
No extra cache or speculative snapshot implementation is included in this batch.
