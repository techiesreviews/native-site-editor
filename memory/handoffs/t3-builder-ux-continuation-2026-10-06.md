# Builder UX, scroll and speed continuation, released to preview

Updated 2026-10-06. Resume this checkpoint for T3 thread `020d820b-06f2-4af5-a58c-5e8a6968cc2e`: the chat checklist's UI polish, scroll tracking, speed audit and authored preview scrollbars. The previous checkpoint is `t3-listings-continuation-2026-10-05.md`; its resource IDs are stale. Verify Git, the preview and running resources before acting.

## Next action

The active chat checklist in `docs/page-builder/completion-checklist.md` is complete and released to preview. Continue only with new user work, a reproducible slow interaction (with before/after evidence), or the open manual checks: human screen-reader (`docs/page-builder/browser-checks.md#human-screen-reader-check`) and live authenticated editing. No speculative rewrites. The final documentation commit is local; do not push merely to sync docs, since every push needs a fresh displayed capture and triggers CI.

Roles (user direction): the actual Claude implementer (Opus 5.5 medium via CLI) does implementation; the root only reviews, collects evidence, tracks and informs. Independent review stays with actual Claude Opus 5.5 medium. Earlier slices were built by Sol workers. The D3 avoidance runtime change and its test were already written and frozen by Sol when the user switched roles; Claude reviewed that patch and committed it unchanged (`f169998`, correcting only its documentation). Claude then implemented the authored-scrollbar fix and its new regressions (`2469aba`), and handled the audit records, review corrections, final checks and release. Claude does not claim D3's source or any earlier Sol patch.

## Release

- Commits: `9f569bf` (grips, H1/Default selects, diamond gap), `b70b6f3` (prefix autocomplete, content selection, immediate show/hide), `7aab54e` (simplified builder chrome, saved-section history), `13c5411` (stationary-pointer re-hit-test), `4f2a6a9` (shadow-root scroll tracking), `d15b98f` (popover and keyboard focus kept while scrolling), `f169998` (label-only avoidance repaint), `2469aba` (authored preview scrollbars), `5e3dc66` (audit records; approved application), `ed5386c` (documentation-only review corrections; released).
- `origin/dev@ed5386c58432ace5ee068f7d880d405146ca5445`; CI https://github.com/techiesreviews/native-site-editor/actions/runs/37380454956 passed types and 1,123 units; its publication was skipped (no `CLOUDFLARE_API_TOKEN`; no secret added).
- Manual `npm run deploy:preview` (existing local OAuth) exit 0: https://preview-editor.techies.tools serves version `76144585-fd58-48e3-86ac-ea879d5486f6` at 100% (deployed 2026-10-05T22:10:52Z). Root verified all 57 public files by same-origin SHA256 (`final-public-assets.json`). Main JS `assets/index-YWvI6pOf.js`, SHA256 `782ff35e2ed57423c5679377cb1e8b0f3889eed03d4f27e9ac6ae3f42eed41f2`, 1,050,464 bytes. The build matches the code; published sites have no framework or publishing-transform dependency.
- Production/main and starter/main untouched; no PR. Public `/api/session` is HTTP 200, configured, signed out, with the ordinary Continue with GitHub screen. A read of `/api/state` returned 401, which is expected signed-out behaviour, not a product bug.

## Evidence

Review directory: `.scratch/continuation-ui-review-2026-10-05/`.

- Final review `.scratch/continuation-ui-review-2026-10-05/claude-final-review.report.txt` and `.scratch/continuation-ui-review-2026-10-05/claude-final-review.validation.json` (exact model, no errors, no permission denials) accepts `5e3dc66` for preview only. It closes the authored-scrollbar, popover/focus and duplicate-avoidance Must fixes; its two documentation corrections were applied in `ed5386c` and verified by the root. Optional notes stay open: at narrow widths the Style drawer covers the edit bar's right edge (pre-existing); the per-render scrollbar text check is unmeasured.
- Final checks on `5e3dc66`: 1,123/1,123 units, app/worker types, UI build, runtime `node --check`, `git diff --check` (`claude-final-{check,units,build}.log`). Browser checks are focused, not a whole-suite run: authored scrollbars 7 true RED → 7 green; canvas 13 + D3 2 = 15; D1 edit-bar scrolling 35 bounded + 1 adjacent address-identity = 36; stationary-pointer/shadow scrolling 9. Other feature counts are in the checklist; do not sum them globally.
- D3 work counts, six genuine avoidance messages each, normal and reduced motion: the permanent RED/GREEN test (bar y340→280) went from 18 to 0 RAF schedules and 18 to 6 rectangle reads; the label still clears the bar; source and drafts stay exact. The separate baseline probe (bar y280→220, `.scratch/canvas-avoid-findings.md`) found the same 18 reads and 18 schedules. Work counts only, no latency guarantee.
- Captures (under `/home/ubulex/.t3/userdata/browser-artifacts/`), all inspected and displayed. Final candidate (`final-candidate.json`): component desktop `…muvsibtk-3f71f4b7.png`, component narrow `…muvsj786-048ea91c.png`, native desktop with Style open `…muvsl0x9-c735c0cb.png`, native narrow `…muvsmsgr-bec4df7b.png`. Push gate `…muvsvfy2-9c60ed3b.png`; manual deploy gate `…muvsyiht-af954a91.png`. The first T3 capture was blank and recovered through ordinary readiness and selection; no iframe or security workaround, no flawless first-load claim.
- Unmeasured backlog (ranked in `docs/page-builder/architecture-review.md`): hover-only plus-row layout, card-description source analysis, collision/bar sizing, topology, typing payloads, and caching the scrollbar guard.

## Resources now

- Root's fake native-static harness on port 5361 (session `15104`, PID `2829678`) and strict dist proxy on port 5362 (session `6598`, PID `2829287`) stay up for inspection.
- Root-owned tabs: candidate `tab_16`, public `tab_17`, older attempt `tab_15`. User tab `tab_14` must be preserved. No tab-close tool is exposed.
- All Sol workers and actual Claude CLI phases have finished. Test ports 5242/5243/5244 are closed; no CI watch or wrangler process is running. The temporary RED runtime copy was deleted; `.scratch` logs remain as evidence.
- On "you are done": stop the root-owned harness/proxy sessions and remove owned temporary helpers. Preserve committed work, evidence, user tabs and configuration.
