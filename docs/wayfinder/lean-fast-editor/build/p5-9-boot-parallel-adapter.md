# Phase 5.9: concurrent boot read adapter

Base: `d0983ba2aa3ed5371b8be4014cb16a544a883b7f`. The guarded helper and worker-header preparation was cherry-picked from `aa0cca2f8898af31380445c863240be11a29893e` as `4cd6951` before this adapter. See `boot-parallel-reads.md` for the server correlation contract and earlier measured serial request intervals.

Startup now starts GET session and GET repositories together through `startBootReads`. It awaits `reads.session` and passes that exact response envelope to `takeRepositories`. Session parsing and error handling retain the existing retry, same-origin credentials, no-store, JSON error/status and in-flight accounting behavior. The shared receipt reader keeps `X-Editor-Session` and validated onboarding metadata alongside the body. The speculative repository reader wraps onboarding inside its value and never writes globals.

Adoption requires a matching nonempty server session tag and the helper's still-current source/epoch checks before and after waiting. The host also checks these guards before applying onboarding and supplying the prefetched list to `loadRepositories`. Source is the editor endpoint's origin plus pathname, allowing the existing workspace-fragment restoration and installation-query cleanup. A hash change after session adoption can start its own repository load and advance generation; the late boot then returns rather than initiating another fallback load or applying stale onboarding. A late boot error similarly cannot replace a newer workspace with the login screen.

Missing/mismatched tags or speculative read errors use the existing normal listing fallback. Signed-out speculative 401s settle privately through the helper, while session errors keep their original handling. Installation/setup return always ignores speculation and uses its required fresh listing. Draft loading still starts immediately after session adoption, and snapshots still wait for drafts; owner/private/account guards, hash restoration and `loadRepositories` generation handling remain intact. No speculative response becomes another repository truth.

This removes the explicit session-to-repository request dependency. It does not claim a measured latency improvement or fulfillment of the warm/cold paint budget before browser measurements.

## Verification

Node `24.21.0`:

- `npm run check`: passed.
- `npm test`: 1,018 passed, zero failures/skips.
- Focused receipt/helper/worker tests passed. New receipt tests cover retained onboarding with same-tag adoption, missing/different tags and invalid onboarding, original API errors and speculative signed-out failure.
- Strict test TypeScript checks passed: receipt/helper/worker tests with `--lib ES2022 --types node,@cloudflare/workers-types`; the browser spec separately with `--lib ES2022,DOM --types node,vite/client`. Both use `--ignoreConfig --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --skipLibCheck`. The initial combined worker-lib invocation omitted browser DOM globals; splitting the environments resolved that tooling error.
- `npm run build:ui`: passed; existing large-chunk advisory remains.
- `git diff --check`: passed.

Logs: `.scratch/p5-review/boot-adapter-*.log`. `tests/native-save/native-boot-parallel.spec.ts` is prepared for the lead's serial browser run: hold session delivery and prove repositories already started; hold the first repository receipt while hash navigation opens another workspace and verify releasing it cannot replace that workspace. It has only been type-checked here. Browser, smoke and budget measurements remain pending; no browser was started by this worker. No Claude review, push, merge, or deployment was performed.
