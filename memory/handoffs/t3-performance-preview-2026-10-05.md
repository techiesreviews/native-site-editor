# Reviewed performance cleanup: released preview

Updated 2026-10-05. Start here when resuming this work. Verify Git and deployment state rather than assuming this snapshot is current. The earlier transfer file retains historical frozen-demo details.

## Released result

`origin/dev` at `d79d18632e8bfd5568d3762ad993af4a905466b7` is deployed to https://preview-editor.techies.tools. Cloudflare preview Worker `native-site-editor-preview` is 100% on version `d646b2ce-b94e-4b56-99c2-5713c2e3e3ab`; deployment and subsequent deployment listing both confirmed it. Expected preview account was checked against the previously verified account. `wrangler.preview.jsonc` still targets the preview domain only and `STARTER_SOURCE=native-static`. Production/main, starter/main, authentication/tool configuration and old WIP were not changed.

This final documentation commit is intentionally local only, one commit ahead of origin/dev. Its app/test bytes match the deployed commit. Do not push it solely to synchronize documentation: each release action requires a fresh displayed real T3 candidate screenshot, and another push would trigger unnecessary CI.

Implemented app commits (original -> integrated): `c281819` -> `0b488e7` (Style variable lookup indexed per snapshot); `2b275fa` -> `7525af1` (bounded canvas source index); `d3e6ab9` -> `9ef04a2` (lazy section-link parsing once per operation). Durable tests: `143ecab` -> `d377cdc` (literal resolver expectations), `29d4b54` -> `344ffd1` (malformed/implied HTML mapping and source-cache regression), `4da4df8` -> `5541457` (effectiveSource shared across ten native specs; deleted draft and missing file mean undefined).

The first push at `9f46e09` exposed a real CI-only test-loader failure on Node 24.21: `collections-panel-static.test.ts` failed to load a resolved Phosphor SVG. Claude fixed only that test's asset load hook (`c98361a` -> `d79d186`), retaining all assertions. The exact reason its earlier resolve hook missed the import was not established; do not present a guessed loader-chain cause as verified. Local Node 24 reproduced failure before the fix and passed all 1102 units afterwards. The subsequent actual GitHub Node 24 job also passed all 1102 units.

## Review and validation

All implementations used Claude Opus 5.5 LOW; independent reviews used Opus 5.5 MEDIUM. Actual model usage, successful results and empty permission-denial arrays were checked. No real quota was reached. No broad CSS extraction, library upgrade, test deletion or speculative cache was added. A subsequent Luna investigation of current CSS fields, frame helpers and main parse paths found differing semantics or no measured gain, so those changes were declined.

Evidence root: `.scratch/t3-continuation/background-lead/`. Read final result records from JSONL streams, not entire transcripts or thinking blocks.

- `review.jsonl`, `review-tests.jsonl`, `ci-review.jsonl`: independent approvals for the app, durable tests/helper and CI loader fix.
- Combined app units 88/88 (`combined-units.log`); final resolver tests 41/41 (`final-css.log`); app+worker types and UI build passed (`combined-check.log`, `combined-build.log`), with the existing chunk-size warning only.
- Combined default canvas/Style/Code browser tests 32/32 (`combined-browser.log`, `combined-code.log`); combined native authoring/link/lifecycle and new mapping tests 21/21 (`final-native.log`). Helper author ran all ten affected native specs, 40/40 (`.scratch/effsrc-evidence/run.log`).
- Failed CI https://github.com/techiesreviews/native-site-editor/actions/runs/37280982418 is retained in `ci-failed.log`. Matching local Node 24 fail/pass/full logs are `cc-fail24.log`, `cc-pass24.log`, `cc-full24.log`.
- Final CI https://github.com/techiesreviews/native-site-editor/actions/runs/37281635237 passed types and 1102/1102 units (`ci-final.log`). Its deploy step explicitly skipped publication because no `CLOUDFLARE_API_TOKEN` secret was configured. After another fresh displayed T3 screenshot, existing local OAuth successfully ran `npm run deploy:preview`; no secret or configuration was changed.
- `deploy-preview.log`, `deployments-after.log` prove the active version. `public-assets.json` records exact SHA256 and byte matches for eight public artifacts: root HTML, main JS, main CSS, native-preview runtime, v6a9ca44 starter manifest, starter HTML, starter CSS and starter PNG. All matched local deployed build bytes.

Measurements remain narrow: synthetic Style classification about 75.4 to 1.879 ms at 501 variables; shared resolver pure function 96.4 to 14.6 ms at 120 pages; repeated canvas lookup about 3.3 to 0.5 ms at 10k tags using coarse headless timing. These do not establish whole-editor latency improvements.

## T3 evidence and live verification limits

The browser is on another machine. LAN HTTP was unsuitable: code inspection identified startup's secure-context `crypto.randomUUID()` requirement, but no browser exception was captured for that attempt. A temporary Cloudflare HTTPS quick tunnel solved remote access. It exposed a strict static whitelist of built dist files and fake API endpoints, never the Vite filesystem. Independent MEDIUM review found and verified a fix for an encoded-query filter that initially blocked repository names containing `/`; sensitive path checks stayed intact. Evidence: `secure-demo.jsonl`, `secure-review.jsonl`, `secure-fix.jsonl`, `secure-verify.jsonl` and `.scratch/t3-continuation/secure-candidate/`.

Fresh actual T3 screenshots were inspected and displayed inline in the active chat before each push and the final manual deployment. All showed the real Larkspur starter, not a substitute image; final captures showed Global styles variables and both code panes, with no draft edits or Publish clicks. The screenshot platform output was soft; it was not claimed to be sharp.

Artifacts under `/home/ubulex/.t3/userdata/browser-artifacts/`:
- Initial push gate: `browser-screenshot-smoking-fees-parker-findings-trycloudfla-muuyls1n-44e802eb.png`.
- Additional pre-release capture: `browser-screenshot-smoking-fees-parker-findings-trycloudfla-muuyn8p7-518186e3.png`.
- Final CI-fix push gate: `browser-screenshot-smoking-fees-parker-findings-trycloudfla-muuyu9vm-2da51e7f.png`.
- Final manual-deploy gate: `browser-screenshot-smoking-fees-parker-findings-trycloudfla-muuyxhd9-f56b3114.png`.

After deployment, root navigated the actual public preview in T3. It loaded Native Site Editor, proceeded through `/auth/setup` for owner `techiesreviews`, and reached GitHub's Confirm access page requiring human passkey/authenticator/email confirmation. Root did not click sensitive confirmation or send a code. Live version and public assets are verified; authenticated editing on the public deployment remains unverified at this owner-confirmation boundary.

## Cleanup and remaining state

All Claude CLI workers/reviewers and the Luna planner have finished. Temporary candidate servers on 5356/5357 and the later secure-demo harness/proxy on 5361/5362 were stopped; the own quick tunnel was stopped. Their operational scripts, logs and reviewed results are retained as evidence, with a STOPPED marker. Temporary invocation briefs and the author's /tmp test logs were removed or moved into the evidence root. Root owns the T3 tabs and screenshot/recording cleanup. Existing T3-managed cloudflared PID 14403 was not touched.

Historical frozen PIDs 2331980/2332067 and ports 5345/5214 were already absent during the earlier final check; this continuation did not send them stop signals. Do not claim that old demo remains running. Preserve all old worktrees and configuration.

No coding or release action remains for this bounded task. Further authenticated public UI verification requires the existing owner's normal GitHub confirmation; do not alter security/trust/tool settings or bypass that boundary.
