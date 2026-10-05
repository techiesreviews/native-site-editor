# Reviewed component reuse and preview release

Updated 2026-10-05. Start here when resuming this work. Verify Git and deployment state before acting; the earlier transfer handoff contains historical context.

## Current release

`origin/dev` at `3eb195d3193b4d27f3bc360e833bf8972431872a` is deployed to https://preview-editor.techies.tools. Preview Worker `native-site-editor-preview` is 100% on version `fbe5a1c0-a709-41ee-a8f2-0aeace1953b2`, confirmed by a fresh deployment listing. The account matched the previously verified preview account. `wrangler.preview.jsonc` targets only that preview domain with `STARTER_SOURCE=native-static`. Production/main, starter/main, tool/authentication configuration and old WIP were preserved.

The final documentation commit is intentionally local only, one commit ahead of origin/dev. Its application and test bytes match the released commit. Do not push merely to synchronize this note: every release action needs a fresh displayed T3 candidate screenshot, and another push would trigger unnecessary CI.

## Component permission and implemented scope

The user explicitly permits Web Components in BOTH the editor UI and generated sites (2026-10-05). This supersedes earlier assumptions that generated sites must avoid custom elements. Permission does not require a migration: choose the component approach that provides real reuse for the task and preserve relevant source/output compatibility checks.

The latest slice extracts the repository-name field shared by Get Started and the setup wizard into `src/components/repository-name-field.ts`. It uses the existing DOM factory convention and returns native input/label/hint elements. Construction, validation, error state and change-event normalization now have one implementation. Callers retain their distinct preview wording, owner selection, typing callbacks, prompt updates, wizard memory and submit behavior. No Web Component registry, new dependency or generated-site markup change was needed for this slice.

Approved author commit `c9a3f9d` integrated as `b1d13aa`; a meaningful test follow-up `3c8af7f` integrated as `3eb195d`. That follow-up types “My New Site,” normalizes it, navigates Back then Next, and expects the rebuilt field to contain “My-New-Site.” Removing the wizard's normalization callback makes it fail. Independent MEDIUM review approved the app extraction and found the four-option API a reasonable maintenance trade. No runtime-speed claim was made for this extraction.

Previously released improvements remain included: Style variable lookup indexed per snapshot, bounded canvas source mapping, lazy section-link parsing once per operation, effectiveSource shared across ten native specs, durable mapping/resolver regression tests, and the Node 24 SVG test-loader repair. The previous release was `d79d186` / version `d646b2ce-b94e-4b56-99c2-5713c2e3e3ab`.

## Validation and evidence

Evidence root: `.scratch/t3-continuation/background-lead/`. Extract final result records from JSONL streams; avoid whole transcripts or thinking blocks.

- Latest actual GitHub Node 24 CI: https://github.com/techiesreviews/native-site-editor/actions/runs/37283981092 — types and 1105/1105 units passed (`repo-field-ci.log`). Local exact Node 24.21 also passed 1105/1105 (`repo-field-final-units24.log`); app+worker types and UI build passed (`repo-field-combined-check.log`, `repo-field-combined-build.log`).
- Focused new-field/setup tests: 11/11 on Node 24.21 (`repo-field-node24.log`, `repo-field-normalised-node24.log`). Normalization mutation: 10 pass, 1 expected failure (`repo-field-normalised-mutation-node24.log`), then app source restored. New behavior tests also passed against the old implementation; an empty-input validity mutation failed two tests.
- Author ran asserted Chromium probes for both flows: initial/owner previews, invalid feedback, normalization, selection, empty Enter-submit focus and wizard memory. Those were temporary scripts, not committed durable browser coverage; the script was removed. The committed tests use a small DOM stand-in. Real sign-in/setup completion was not tested.
- Earlier app changes had 32 default and 21 native combined browser passes, plus the helper author's 40 affected native cases. They were not rerun merely for the latest form-field extraction. Earlier actual Node 24 CI passed 1102 units after repairing the SVG loader; failure/fix evidence and CI links remain in `ci-failed.log`, `ci-final.log`, `ci-review.jsonl`.
- Latest independent review and author results: `repo-field-review.jsonl`, `repo-field.jsonl`, `repo-field-proof.jsonl`. Implementations used actual Claude Opus 5.5 LOW, independent reviews Opus 5.5 MEDIUM; successful results and empty permission-denial arrays were verified. Luna examined real reuse candidates. No actual Claude quota was reached, and no artificial work was added to consume quota.
- CI explicitly skipped publication because no `CLOUDFLARE_API_TOKEN` secret was configured. After a separate fresh T3 screenshot, existing local OAuth successfully ran `npm run deploy:preview`; no secret or configuration changed. Deployment evidence: `repo-field-deploy.log`, `repo-field-deployments-after.log`.
- `repo-field-public-assets.json` records exact SHA256/byte matches for eight public artifacts: root HTML, new `/assets/index-B803bBVh.js`, CSS, native-preview runtime, v6a9ca44 starter manifest, starter HTML/CSS/PNG. All match the deployed local build. Main JS SHA256: `01b6cce113bd78228dd3e503cb291b684a01cfee0e1e3a2c113c7d2209693dd5`.

Earlier timings remain narrow evidence: synthetic Style classification about 75.4 to 1.879 ms at 501 variables; shared resolver pure function 96.4 to 14.6 ms at 120 pages; repeated canvas lookup about 3.3 to 0.5 ms at 10k tags with a coarse timer. These do not establish whole-editor latency improvements.

## T3 gates and live verification limit

The collaborative browser is on another machine. A temporary HTTPS quick tunnel exposed only a reviewed whitelist of built dist files and fake harness APIs, never the Vite workspace. Its encoded-query filter initially blocked repository names; independent review verified the fix and sensitive-path refusals. The final candidate's 58 built files matched the fresh integrated build byte for byte. Proxy source and review evidence are retained under `.scratch/t3-continuation/secure-candidate/` and `secure-*.jsonl`.

Fresh actual T3 screenshots of the real Larkspur starter were inspected and displayed inline before the latest push and manual deployment, with selected hero, Style panel and two code panes visible. No draft edits or Publish clicks were made. Platform screenshots were soft; they were not described as sharp.

- Push gate: `/home/ubulex/.t3/userdata/browser-artifacts/browser-screenshot-spread-started-puzzle-alberta-trycloudfl-muuzn5kw-bcb16451.png`.
- Manual-deploy gate: `/home/ubulex/.t3/userdata/browser-artifacts/browser-screenshot-spread-started-puzzle-alberta-trycloudfl-muuzq6tu-23863aea.png`.

During this session, actual public-preview navigation loaded Native Site Editor, proceeded through `/auth/setup` for `techiesreviews`, and reached GitHub Confirm access requiring human passkey/authenticator/email confirmation. No sensitive confirmation or email-code action was clicked. Live version/public assets are verified; authenticated editing remains unverified at this owner-confirmation boundary. The latest UI-only extraction does not change that authentication flow. The final T3 retry timed out, so it did not re-confirm authenticated UI access. A fresh public `/api/session` request returned `configured: false`, `user: null`, `installUrl: null`, `ownerSetupUrl: "/auth/setup"`, and `ownerSetupOpen: true` (`repo-field-public-session.json`), confirming that owner setup is still required.

## Cleanup

All Claude workers/reviewers and the Luna planner finished. Own final quick tunnel and harness/proxy process groups `2386998`, `2387087`, `2387089` were stopped; ports 5361/5362 and the earlier own 5356/5357 are closed. Invocation briefs and the temporary candidate build `/tmp/nse-rnf-build` were removed. Relevant logs and reviewed proxy source remain as evidence with a STOPPED marker; worktrees are preserved. T3-managed cloudflared PID 14403 and tool/MCP configuration were not touched.

Root owns T3 tabs and recording cleanup. The latest recording stop reported a desktop copy remaining after transfer failure; subsequent automation also failed. Do not claim that desktop copy was deleted. Historical frozen ports 5345/5214 were already absent earlier; this continuation did not stop those historical PIDs or assume that demo still runs.

No implementation or release work remains for this bounded slice. Further authenticated live editing verification requires the owner's normal GitHub confirmation, without bypassing trust or authentication.

## Owner setup opens the wizard — 2026-10-05 (continued in Claude Code)

A fresh editor with no GitHub App no longer redirects `/` to `/auth/setup`. It opens the existing Setup wizard on Connect GitHub with a "Create this editor's GitHub App" button, which is the only way into `/auth/setup` (`77e9df2`, plus `5ad143e`, which drops the unusable Next button). The private-link locked sign-in is unchanged. Codex hung (no output even for a trivial prompt), so an independent Claude review approved it instead. Its remaining P3s: an `?error=` notice is hidden behind the wizard, and the wizard is not `aria-modal`/inert (a pre-existing pattern). 1105 units, types, build and 16/16 wizard browser tests pass. Preview version `13905353-4d4e-419a-ae1b-f284e9f679a5` serves the same main JS (`7723e2ef…`), and a live Chromium check shows the wizard with no navigation away from `/`. `git push origin dev` failed because the gh token is invalid, so `dev` is ahead of origin until Lex runs `gh auth login`. The local demo servers (5210/5211/5212/5214/5312/5342/5345) were already down.
