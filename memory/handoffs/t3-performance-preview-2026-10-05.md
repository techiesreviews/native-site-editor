# Performance and test cleanup: preview release checkpoint

Updated 2026-10-05. Read this when resuming the reviewed performance/reuse release. Verify Git and processes before acting. The earlier transfer file retains frozen-demo history; do not load the large 3 October handoff wholesale.

## Current result

Final candidate `dev` at `5541457` is locally integrated and clean before this documentation commit. No push or deployment has occurred in this continuation. Production/main, starter/main, older worktrees and the frozen demo remain untouched. The requested preview release is unfinished: a fresh actual T3 screenshot of the final real-starter candidate must be displayed in the active chat before each release action. That gate has not passed. Existing authorization covers release after that gate; no additional permission ritual is needed.

Approved app commits (original -> integrated): `c281819` -> `0b488e7` (Style variables indexed per snapshot); `2b275fa` -> `7525af1` (bounded canvas source index); `d3e6ab9` -> `9ef04a2` (lazy section-link parsing once per operation). Approved tests: `143ecab` -> `d377cdc` (literal expected resolver outcomes), `29d4b54` -> `344ffd1` (durable malformed/implied HTML mapping and cache regression), `4da4df8` -> `5541457` (effectiveSource shared across ten native specs; deleted draft and missing file mean undefined).

Both independent reviews used Claude Opus 5.5 MEDIUM and approved all scoped commits. Each result reports `is_error: false`, `permission_denials: []`, and actual Opus model usage. Authors used Claude Opus 5.5 LOW. No real quota was reached. The bounded work is complete; do not describe this as quota exhaustion or expand scope just to consume quota. No broad CSS/cache changes were made.

## Validation and evidence

Evidence root: `.scratch/t3-continuation/background-lead/`. `review.jsonl` and `review-tests.jsonl` contain final independent results; extract only result records. `helper.jsonl`, `proof.jsonl`, `relay.jsonl` contain author results. Avoid printing thinking blocks or whole streams.

- Combined app units: 88/88 (`combined-units.log`); final explicit Style unit tests: 41/41 (`final-css.log`).
- App and worker types pass (`combined-check.log`); UI build passes (`combined-build.log`), existing chunk-size warning only.
- Combined default canvas/Style browser tests: 23/23; Code folding/visible tests: 9/9 (`combined-browser.log`, `combined-code.log`).
- Final combined native authoring/link/lifecycle and new canvas regression browser tests: 21/21 (`final-native.log`).
- Helper worker separately ran all ten changed native specs: 40/40, evidence `.scratch/effsrc-evidence/run.log`; worktree `.scratch/wt-effsrc` is clean.
- Proof author checked mutation failures for tie-breaking and source invalidation, restored app source, and committed only tests. Reviewer independently compared all six recorded mapping cases against old and new browser implementations. Scratch review copies were removed.

Measurements remain narrow: Style synthetic Node classification ~75.4 to 1.879 ms at 501 variables; shared resolver pure function 96.4 to 14.6 ms at 120 pages; canvas repeated lookup ~3.3 to 0.5 ms at 10k tags with coarse headless timing. These do not establish whole-editor latency improvements.

## Screenshot gate and processes

T3 public example.com navigation worked. Localhost/127 and LAN 192.168.1.7 attempts failed from the collaborative browser; 192.168.1.125:5356 eventually returned editor title/demo banner and Vite connected, then T3 automation timed out while loading. The cause remains unresolved; an Electron preload error also appears on the successful public page, so it does not establish the cause. LAN HTTP is not a secure context; inspect actual console evidence before blaming the app. No browser trust/configuration or authentication settings were changed. A bounded Claude LOW static diagnosis found that signed-in startup immediately calls `createAgentMenu` (`src/main.ts:9064-9067`), whose `src/components/agent-menu.ts:78` calls `crypto.randomUUID()` without a fallback. That API is unavailable on insecure LAN HTTP; file changes and uploads also require `crypto.subtle`. This strongly explains the partial LAN startup, but no browser console confirmed the exception. Evidence: `startup.jsonl`, successful actual Opus result with no permission denials. No app fix or unsafe browser flag was applied.

Temporary candidate backend: PID `2368039`, exec session `60429`, loopback port `5357`, root checkout real native fixture `.scratch/native-static-preview`, demo mode. Temporary LAN proxy: PID/process group `2369069`, port `5356`, forwards HTTP and WebSocket to 5357. URL: `http://192.168.1.125:5356/#repo=501&branch=main&file=index.html`. Logs and proxy script are in the evidence root. Both temporary processes were stopped after the final T3 attempt failed. Root owns T3 tabs q/r and their cleanup. Recreate only a browser-reachable secure candidate origin when resuming; plain HTTP LAN is unsuitable for this app.

Frozen demo PID `2331980`, port `5345`, and existing TLS relay PID `2332067`, port `5214`, must remain running. Do not alter earlier servers or old WIP. All Claude CLI workers/reviewers from this continuation have finished; test servers on 5352/5354/5358 stopped normally.

## Resume release

1. Verify `git status`, candidate HEAD, and available T3 preview state. Display a fresh real-starter final-candidate screenshot in the active chat; old screenshots and automated browser assertions do not satisfy the current T3 gate.
2. Immediately before push, fetch origin/dev again. Last fetch: `origin/dev=f08701f2483c305dc2eb17dd1e99636ac7a6a76f`, zero remote-only commits, local ahead 504 before checkpoint docs. Preserve unexpected changes.
3. Push dev only after the gate. Preview CI may need the already-authorized manual `npm run deploy:preview`; inspect actual outcome. Config `wrangler.preview.jsonc` targets `native-site-editor-preview`, `preview-editor.techies.tools`, `STARTER_SOURCE=native-static` only. Obtain a fresh displayed screenshot again before a separate deploy action if needed.
4. Verify account against earlier `preview-whoami-20261005.log` and current `wrangler-whoami.log`; do not print credentials or change authentication. Latest whoami succeeded with existing OAuth and a missing-scope warning; no login flow was started.
5. Confirm deployed version and public static assets/native starter. Current recorded preview version remains `103fded7-50e0-41e5-b8b6-0d4ee71ea7c9` from f08701f. Authenticated live preview can redirect to GitHub owner confirmation; do not click sensitive authorization. Record this verification limit honestly.
