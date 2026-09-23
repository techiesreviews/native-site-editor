# Production visual-editor smoke check

## Initial smoke state

The isolated visual-editing checks passed after a manual click recovered iframe interaction. This is not a clean verdict for editing after structural code changes: the user subsequently confirmed that the duplicated-button draft hides the button's Link action and later heading/paragraph edit bars, while the new button never appears in preview. That original draft scenario is now under regression investigation. The earlier wordmark-link check used an unchanged layout file and did not cover it. Publish and file-history checks cover UI state, guards, and restore confirmation/cancellation; they do not verify a new GitHub write or deployment.

The editor and starter remote heads matched the previous handoff after fetching:

- Editor: `1abe737281d88149ce7fdd3572eb15a30e18c609`.
- Starter: `e61d26ba76fe354528ddaad66b8816f90fdd091b`.
- Fresh worktree: `/home/ubulex/Projects/astro-site-editor-smoke`.
- Branch: `fix/visual-editor-production-smoke`, based on `origin/main`.

Both pre-existing dirty worktrees were preserved. During the initial smoke check, no application code was changed. No GitHub publication, history restore commit, integration update, or deployment was performed.

## Live checks

Target: `https://astro.techies.tools/#repo=1374631084&branch=main&file=src%2Fpages%2Findex.astro`.

| Check | Observed result |
| --- | --- |
| Authentication and repository | Existing authenticated session opened the private starter and requested file. |
| Preview revision | Reported `e61d26b`, built 11:04:45, same as `main`. |
| Integration | Reported current; Prepare integration update was disabled. |
| Heading level | H1 to H2 changed both source tags. |
| Size | XL generated `class="heading-title"` and a page-local style rule using `var(--text-xl)`. It did not create a separate stylesheet draft. |
| Bold and italic | Selected heading text became `<strong><em>This is a test</em></strong>` in source. |
| Undo and Redo | Undo removed italic while preserving bold; Redo restored italic. |
| Text | Backspace changed `This is a test` to `This is a tes`; typing `t` restored it. Actual iframe input messages and stored source agreed. |
| Unsupported selection | Selecting unmapped `main` reported that it was not mapped to a source literal. |
| History | Listed seven real file revisions; current revision was marked current. Existing draft blocked restoration. On a clean baseline, selecting an older revision showed file, branch, SHA and new-commit warning; cancellation succeeded. |
| Publish | Disabled on clean baseline. Enabled with the existing draft; menu selected `src/pages/index.astro` and identified `main`. Final publication was not executed. |
| Link | Selected the native wordmark link in `src/layouts/Layout.astro`, whose source had no existing draft. Changed `/` to `/about/?smoke=link` through the Destination form. The stored source equalled the original with only that href replaced. Reselecting the rendered link reported the new href. Undo removed the layout draft; Redo restored the changed href; final Undo and reselection confirmed rendered `/`. |

## Draft preservation and tooling limitation

The browser already contained an unpublished `src/pages/index.astro` draft with a duplicated button. It was not test data. Its original serialized storage record was backed up privately to `/tmp/astro-production-smoke-original-draft.json` before briefly isolating a clean baseline. Test edits were removed and the original record was restored byte-for-byte. Other draft records were not removed. Both editor tabs were reloaded to recover the restored state. Final comparison confirmed identical draft content, original source, baseline SHA and scope; only `updatedAt` advanced when the app resaved the recovered draft.

Collaborative-browser snapshots repeatedly failed with `PreviewAutomationExecutionError`. DOM inspection through `preview_evaluate` worked. Coordinate clicks and keyboard input initially exercised the iframe, but after reload, clicks no longer produced iframe selection messages. A fresh tab and iframe reload did not resolve this. The user clicked the heading manually; selection and subsequent automated iframe interactions then worked. The failure's cause remains unproven and is not sufficient evidence of an application defect.

After the link check, only the pre-existing `src/pages/index.astro` draft remained. Its content, original source, baseline SHA and scope matched the saved state. The test-created layout draft was gone, the rendered link was restored to `/`, and the editor returned to the page heading. A fresh remote-head read still returned starter commit `e61d26ba76fe354528ddaad66b8816f90fdd091b`.

No local build or test suite was run during that initial check: it exercised the deployed system without application changes.

## Recommended next slice

The earlier candidate was editing the existing literal `alt` value of a native `<img>`, with planning confidence 9/10 for that restricted scope. Defer it while investigating the user's structural-code-edit case. The actual production capability probe returns HTTP 404 (`Endpoint not found.`); any recommendation must account for the missing production draft renderer rather than treating the local fixture proof as shipped functionality.

## Follow-up diagnosis: structural source changes

The user's duplicated-button scenario reproduces all reported symptoms. A direct comparison of the saved production draft with the deployed annotated HTML reports two draft buttons and one preview button. The dedicated browser diagnostic has a passing unchanged-source control and four failing structural-draft checks: the second button is absent, the original button's Link action is absent, and the later heading and paragraph edit bars are absent. These are intentional diagnostic failures, not passing regression coverage or a completed fix.

Reproduction command: `npx playwright test -c .scratch/structural-draft/playwright.config.ts --reporter=line`. Final result: **1 passed, 4 failed in 26.3 seconds**. The source is `.scratch/structural-draft/structural-draft.spec.ts`; screenshots and traces are under its `results/` directory. This diagnostic is outside the default test suite. Initial harness attempts had source-pane readiness and moved-config working-directory failures; the final run corrected those and failed on the actual reported symptoms.

The connected causes are:

1. The production capability probe returns 404, so no Astro build consumes the uncommitted source overlay. The iframe still renders the committed revision.
2. `mappedLinksForSource()` in `src/components/preview-panel.ts` requires the source anchor count to match the compiled inventory. Adding an anchor violates that condition, and `rebuildLinkInventory()` disables link actions for the path.
3. The later text elements retain positions from the compiled source. The inserted line shifts their positions in the draft. `rangeOf()` in `src/components/code-editor.ts` rejects selections whose expected source no longer matches, so their edit bars do not open.

This is not specific to buttons. Structural insertions can invalidate subsequent mappings. Removing the validation would risk writing to the wrong source location; an optimistic text patch cannot compile a newly inserted Astro element.

No application fix or deployment was made during diagnosis. The functional priority is real production preview builds for code drafts, followed by adoption of each build's matching source snapshot. The accepted preview-branch ADR provides a GitHub-build direction, while the existing optional local renderer is only a fixed-fixture proof. A status/guard improvement can make the limitation clearer, but cannot be represented as fixing draft rendering or restoring visual editing of newly inserted elements.

## Production fix under validation

The implementation adds an authenticated GitHub Actions draft adapter. It validates the exact source head and canonical workflow, creates a separate immutable preview branch for each snapshot, and adopts the compiled result only when its revision stamp matches the draft commit. Visual mapping baselines follow the compiled overlay while publication originals remain unchanged. Undo back to clean source resets the overlay baseline, and the comparison frame remains the committed page.

The slice keeps direct Publish behavior and does not implement the later fast-forward Publish ADR. Draft branches are retained; see [repository preview](../repository-preview.md#draft-previews) for supported inputs and limits. No existing dirty worktree or custom integration file was overwritten.

Initial implementation checks: 96 unit tests passed, TypeScript checks passed, and the production UI/Worker dry-run build passed. Browser and live deployment results are recorded below when completed.

Final pre-deployment verification:

- `npm test`: 96/96 passed.
- `npm run build`: TypeScript, Vite, and Worker dry-run passed.
- Final targeted controller/Worker tests: 27/27 passed.
- `npx playwright test -c playwright.heading-bar.config.ts draft-preview-protocol.spec.ts button-link.spec.ts link-heading-recovery.spec.ts production-draft-preview.spec.ts`: 15/15 passed in 1.8 minutes.

The browser run caught an introduced committed-preview reload regression: eagerly seeding a source baseline bypassed the existing draft hydration behavior. The fallback is now limited to draft builds; the existing long-heading/link/reload regression and the new production build tests pass together. New coverage uses actual Astro fixture builds behind mocked asynchronous API responses, including duplicate button rendering, Link/heading/paragraph controls, clean overlays, and readonly committed comparison frames.

## Deployment and live confirmation

Deployed implementation commit `30cbfd9` from `fix/visual-editor-production-smoke` with `npx wrangler deploy`. Cloudflare version: `d7f95b4e-1768-4472-9363-2605755919ef`. Previous version for rollback: `a2034ad4-3653-47d0-9603-2e6b5f111b05`. No editor branch was merged or pushed.

Reloading the authenticated production editor restored the user's original duplicate-button draft. The capability probe returned 200 and the draft request returned 202. It created only `editor/draft-4462a369-f436a9f9e114e47e`, commit `ccc9b5b51547b20201a4531713491f6fdf60a925`. [GitHub Actions run 35715966361](https://github.com/techiesreviews/astro-editor-starter/actions/runs/35715966361) completed successfully; live-site build/deploy steps were skipped. The editor adopted the matching draft URL and displayed `Draft preview ready ccc9b5b.`

Inspection of the deployed preview in a standalone browser tab confirmed two real `a.button` elements, both with `/about/` destinations, and both later headings. The starter `main` head remained `e61d26ba76fe354528ddaad66b8816f90fdd091b`. Browser draft content, original content, base SHA and scope matched the private backup by SHA-256; no test changes were published.

Live iframe locator clicks and snapshots again failed through the collaborative browser tool; coordinate clicks did not establish an editable selection. Therefore live toolbar interaction is not claimed as verified in this deployment pass. The 15 passing local browser regressions cover those controls using real compiled Astro output, and the live end-to-end build/adoption path is confirmed. The user can now test the deployed editor.
