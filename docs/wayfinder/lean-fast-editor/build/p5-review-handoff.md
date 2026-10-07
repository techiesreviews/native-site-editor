# Phase 5 review handoff

Prepared for Claude after the 2026-10-07 13:00 Europe/Amsterdam availability reset.
This continues thread `7d475731-adb3-4c9c-9930-edfb1997bdad` and Wayfinder tickets
08, 06, 12 and the build sequence in ticket 15. Claude has not reviewed this batch.
An additional isolated fix addresses a deferred title-refresh race found by the
full browser run; it retains the existing page URL assertions.

## Scope and immutable commits

Phases 1–4 were already complete at `963f569d6176daf35da94f50f14142f4fe8f1c91`.
The draft-store wiring is preserved. These branches prepare the first Phase 5
store/controller slices and complete Claude's interrupted Monaco trim.

| Slice | Branch | Base | Head | Worktree |
| --- | --- | --- | --- | --- |
| Shared application state | `build/p5-app-store` | `963f569` | `95dcfcfce3d8d69311cedaf02764b14f3c923445` | `/home/ubulex/Projects/native-site-editor-p5-app-store` |
| Agent controller | `build/p5-agent-controller` | `95dcfcf` | `eaaf6b81434f1029c5fe89a30ad1459d691fd400` | `/home/ubulex/Projects/native-site-editor-p5-agent-controller` |
| Monaco contributions | `build/p5-monaco-trim-codex` | `963f569` | `da7cc2b1fdacbb23a6c30a3a019a60cfd9dd9abb` | `/home/ubulex/Projects/native-site-editor-p5-monaco-trim` |
| Deferred title-refresh fix | `build/p5-title-refresh-isolated` | `eaaf6b8` | `49061ebc23d8896a153f123d8229cd4c89b7f028` | `/home/ubulex/Projects/native-site-editor-p5-title-refresh` |
| Combined validation candidate | `build/p5-review-candidate-ready` | `963f569` | `47ea16954110cb059b0c4d1e067bc2f177c11c18` | `/home/ubulex/Projects/native-site-editor-p5-review-candidate` |

The combined branch merges preparation branches for validation only. `dev` and
`main` are unchanged; there is no preview or production deployment in this run.
Claude's original unfinished worktree and branch `build/p5-monaco-trim` are
preserved. The new trim branch starts from the completed Phase 4 base and copies
its interrupted changes before fixing and validating them.

The title fix is isolated on the shared-state/controller base so it can land
independently of Monaco. Its four product/test files are identical to the same
files at combined `47ea169`; only the slice note differs. The original
`build/p5-title-refresh` at `47ea169` remains preserved as the combined patch.

The app-store branch adds `@preact/signals-core`, moves the core state out of
module-level variables, and subscribes to settled state changes from the existing
draft text store. A separate `subscribeState()` surface handles persistence-only
changes and full clears without synthetic text events or manual refresh calls. The
agent branch extracts menu/probe lifecycle and keeps the UI module lazy. It also
invalidates asynchronous mounts/probes/Ask callbacks during teardown. The trim
removes unused Monaco contribution registration without removing TypeScript
IntelliSense or the existing editing/navigation shortcuts.

This is the first review batch. `main.ts` is still large; the full ticket 08
split and its roughly 500-line target remain in
[the controller plan](p5-controller-plan.md).

## Evidence

All commands use Node `v24.21.0`, with
`/home/ubulex/.npm/_npx/387698761821791d/node_modules/node/bin` prepended to `PATH`.
Browser runs are serial; the prior thread records memory exhaustion from
parallel suites. Logs are under each worktree's `.scratch/p5-review/`.

- Final combined candidate `47ea169`: production build and all **11 production
  Monaco feature checks** pass; the full native-save development suite passes
  **689 tests, zero failed, 85 skipped** in 28.1 minutes. The four new title-race
  cases and the original page-URL case pass in this run. Logs:
  `ready-build.log`, `ready-monaco-production.log`, `ready-native-save.log`.
  The 85 skips are fixture-specific checks outside the default fixture; this is
  not a claim of new actual-starter or signed-in remote proof. All **32 smoke
  checks** pass across native-save and native-preview (`ready-smoke.log`). The
  final **340 KB** pre-paint byte median passes the **350 KB** gate
  (`ready-budget.log`, three cold loads).
- Shared state: final slice type checks, production build and 978 unit tests pass.
  The initial `99470b7` passed 32 focused browser checks.
  `store-targeted-corrected.log` records branch navigation, change
  status, History, Save and source-pane visibility. The initial filter also
  matched the whole native-save directory; that run was stopped and is not a
  completed full-suite result.
- Agent controller: the original `90e6b6c` passed type checks, build, 977 unit tests,
  including eight lifecycle cases, and 44 focused browser checks
  (`agent-targeted.log`: lazy panels, MCP, deletion races and onboarding). The
  controller was rebased onto the settled draft-state fix; final combined checks
  below cover that rebased commit.
- Monaco: type checks, build and 965 unit tests pass. Existing development-mode
  feature/deferred checks pass 17/17 (`monaco-development.log`). The first mixed
  production run had seven failures because older checks directly import or
  intercept `/src/` URLs; those contracts were retained and rerun in development.
- Monaco diff review found removed default sticky scroll, navigation and
  keyboard commands. Those imports were restored. A later new long-file test
  exposed its helper's assumption that all lines render at once; the helper now
  clears and copies the clipboard to verify the full source. The final
  production feature rerun passed 11/11 on the earlier combined `c082a7b`.
- Earlier combined candidate `64e8f2e`: type checks, production build and **986 unit
  tests** pass. All **11 production Monaco feature checks** pass on this exact
  candidate (`final-monaco-production.log`). The full native-save suite finished
  with **684 passed, 85 skipped and one failed** in 30.0 minutes
  (`final-native-save.log`). The failure waits for the `Fern & Kettle` row before
  creating or deleting a subpage; the API returned the correct title, but the
  tree retained its fallback `Fern and kettle` after a row menu closed. The
  relevant deferred render logic matches the Phase 4 baseline. A separate
  regression and fix were prepared separately. Other logs:
  `final-check.log`, `final-unit.log`,
  `final-build.log`. Failure artifacts are preserved in
  `.scratch/p5-review/full-suite-failure/` before subsequent browser runs.
- Additional title-refresh fix: deterministic checks on unchanged `64e8f2e`
  reproduced the stalled title refresh in all three cases (row menu, Rename,
  Change URL). The intercepted response contains the correct title; focus and
  typed values survive while busy, but Escape leaves the fallback for 15 seconds.
  Red evidence: the title-refresh worktree's
  `.scratch/p5-review/title-refresh-red.log`. The fix passes type checks, all
  **986 units**, build, **19 focused browser checks** including the original
  page-URL case, and the final **four-case** title regression (including new-page
  cancellation). All `title-refresh-*.log` files are in that worktree. The final
  `47ea169` integration results are listed above; its logs use the `ready-` prefix. The
  isolated `49061eb` passes type checks and diff checks; the browser/unit/build
  evidence above belongs to the identical product patch on combined `47ea169`.
- Shared-state byte gate: **339 KB** gzip before paint, median of three cold
  loads, within the **350 KB** gate. Baseline: **337 KB**. See
  `store-budget.log` and the root worktree's `baseline-budget.log`. These are
  earlier measurements; the final candidate measures **340 KB** as listed above.
- Local timing medians on the same 100 ms / 20 Mbps profile: baseline cold
  **1.284 s**, warm **0.896 s**; shared state **1.298 s**, **0.892 s**; final
  combined candidate **1.287 s**, **0.886 s**. All exceed ticket 02's local
  timing targets (1.0 s / 0.4 s). These runs do not establish a
  timing regression from the slice, and do not establish that the local timing
  targets are met. No new signed-in remote measurement was made.
- Final combined editor pair, Python `gzip.compress` on both emitted chunks:
  baseline **972,222 bytes**, final **884,618 bytes**, down **87,604 bytes (9.0%)**.
  The TypeScript worker stays **1,482,315 bytes** by the same method. These are
  code-editor load bytes, separate from the pre-paint byte gate.

### Reproduction commands

Run from `/home/ubulex/Projects/native-site-editor-p5-review-candidate` after
checking that `git rev-parse HEAD` is `47ea16954110cb059b0c4d1e067bc2f177c11c18`.
Do not run browser commands concurrently. The full native-save suite uses the
development fixture because some existing checks import/intercept source URLs;
the dedicated Monaco feature run verifies the emitted production chunks.

```bash
export PATH=/home/ubulex/.npm/_npx/387698761821791d/node_modules/node/bin:$PATH
npm run check
npm test
npm run build:ui
ASE_TEST_PORT=5590 ASE_NATIVE_SAVE_DIST=1 npx playwright test --project=native-save --workers=1 'native-monaco-features.spec.ts$'
ASE_TEST_PORT=5590 npx playwright test --project=native-save --workers=1
ASE_TEST_PORT=5590 npm run test:browser:smoke -- --workers=1
ASE_BUDGET_PORT=5594 npm run test:budget -- --no-build
```

## Review brief

Use Claude Opus 5.5, medium effort, after the availability reset. Review the
immutable commits above read-only, one slice at a time, then assess their
combined behavior. Do not change source or merge/deploy during the review.

Read the relevant slice notes from each candidate worktree and Wayfinder
tickets 08, 06, 12 and 15. Review these diffs:

```bash
git diff 963f569..95dcfcf -- src/app-store.ts src/draft-store.ts src/main.ts package.json package-lock.json tests/app-store.test.ts tests/draft-store.test.ts
git diff 95dcfcf..eaaf6b8 -- src/controllers/agent-controller.ts src/main.ts tests/agent-controller.test.ts
git diff 963f569..da7cc2b -- src/components/monaco.ts vite-monaco-trim.ts vite.config.ts tsconfig.json tests/native-save
git diff eaaf6b8..49061eb -- src/components/row-menu.ts src/components/pages-tree.ts src/main.ts tests/native-save/native-page-title-refresh.spec.ts
git diff 963f569..47ea169 -- src shared worker
```

Focus on one source of truth for state, batched transitions, draft subscription
lifetime, settled retry/adopt/clear notifications, event counts/order and listener
reentrancy; account/host/epoch guards, consent/retry and
captured-menu identity; Monaco service registrations and preserving default
features, shortcuts, language intelligence, Save comparisons and read-only
History; deferred title refresh, focus/typing preservation, interaction completion
and workspace identity. Check that no runtime import pulls optional UI or Monaco before paint.
Keep browser harness limitations separate from application defects.

Return blocking findings with file/line and a concrete failing scenario, then
nonblocking findings, evidence assessed, and a per-slice recommendation. Do not
claim that this batch finishes the full controller split or that local timing
targets passed. Verify the CLI JSON's `modelUsage` reports `claude-opus-5-5`
before recording that the pinned review model ran.

Suggested continuation prompt:

> Continue thread `7d475731-adb3-4c9c-9930-edfb1997bdad`. Read
> `/home/ubulex/Projects/native-site-editor/docs/wayfinder/lean-fast-editor/build/p5-review-handoff.md`.
> Verify its branch heads and evidence, then review the three Phase 5 slices and
> the separate title-refresh fix read-only using Claude Opus 5.5 at medium
> effort. Return actionable findings
> per slice. Keep the accepted Wayfinder sequence and the unfinished controller
> plan; merging and deployment follow review.

## After review

Fix findings on the owning slice branches. Revalidate changed behavior and the
combined candidate. Land one controller/module per reviewable change; keep
the title fix on its isolated branch and Monaco trim last in the approved order.
Follow ticket 15's merge to `dev`,
preview release, cold-start notes and real-starter proof. Production release
is a later phase gate. The prior handoff says the repository secret
`CLOUDFLARE_API_TOKEN` is not yet set; this run does not configure it.

Start the next controller slice from the accepted shared-state/controller base,
using the queued plan. Do not discard the original Claude branch, old worktrees
or existing drafts.
