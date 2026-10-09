# Local testing, timing and preview deploys

The scripts themselves are listed in [agent-scripts.md](agent-scripts.md);
the automated checks in [guardrails.md](guardrails.md).

## Setup

- Node 24 is not on the default PATH:
  `export PATH=/home/ubulex/.npm/_npx/387698761821791d/node_modules/node/bin:$PATH`.
- One branch, one worktree: `scripts/agents/worktree.sh <branch>` (shared
  `node_modules` and the native-static fixture are linked in).
- Leave a worktree untouched while a suite runs from it.

## Ports

| Port | Use |
| --- | --- |
| 5216 | Timing (`scripts/agents/timing.sh`, all locks) and single-port full suites |
| 5226, 5236, 5246, 5256 | Focused specs, smoke, full-suite shards (`scripts/agents/port.sh`) |

Each run also takes port + 1 (the native-preview project). Every browser run
holds its port's lock: through `port.sh`, or
`flock /tmp/ase-5216.lock env ASE_TEST_PORT=5216 <cmd>` for 5216.

Stop only processes you started, by PID or process group: other agents'
servers share these ports, and a pattern kill takes theirs down too.

## Which tests

- Nightly (`browser-tests.yml`): default fixture in 4 shards plus the `@actual`
  and `@native-static` groups. Per-push (`deploy-preview.yml`): only `@smoke`.
- Default group: `port.sh npx playwright test --project=native-save --workers=1 <files>`.
- Tagged groups need their own fixture and command:
  `port.sh bash -c 'npm run test:browser:native-static -- --port $ASE_TEST_PORT --workers=1'`,
  and the same with `test:browser:actual`. A tagged spec run in the default
  group shows as skipped, not as passed.
- Smoke: `port.sh npm run test:browser:smoke -- --workers=1`.
- CI fonts (DejaVu Sans, wider than the local Noto Sans): put
  `FONTCONFIG_FILE=$PWD/scripts/agents/ci-fonts.conf` (run from the worktree root) in front of the
  `port.sh` command; specs must pass with both fonts.
- Full suite before merging shared plumbing: `scripts/agents/full-suite.sh 3`
  (about 15 minutes).
- Known flaky specs: `native-shared-link-host.spec.ts:82`,
  `native-canvas.spec.ts:195`, `native-shared-authoring-host.spec.ts:282`;
  rerun once before calling a failure flaky
  ([tech debt 09](../work/tech-debt/issues/09-flaky-specs.md)).

## Reading results

`scripts/agents/suite-summary.mjs <results.json>...` gives counts and each
failure's first error line. A server that died mid-run leaves its reason in
`.scratch/<project>/server-<port>.log`. The shell's `grep` treats long
Playwright logs as binary; use `grep -a` or the JSON results.

## Timing

`scripts/agents/timing.sh scripts/agents/cold.sh <worktree> <outprefix>` on a
fresh `npm run build:ui`; check that `<outprefix>.served` names the built
`dist/assets/index-*.js`. Compare before and after in one sitting, alternating
builds: runs from different sittings differ by about 30 ms.

## Code review

`scripts/agents/review.sh <worktree> <brief> <out-dir>` (GPT-6.1 Sol,
read-only). The reviewer applies `CODING_STANDARDS.md`. Sol builders run with
`codex exec -s workspace-write` and cannot commit: the lead commits their work.

## After pushing to dev

1. Watch the CI run: `gh run watch $(gh run list --workflow deploy-preview.yml -L 1 --json databaseId -q '.[0].databaseId') --exit-status`.
   It tests but does not deploy (no Cloudflare token yet,
   [tech debt 05](../work/tech-debt/issues/05-ci-preview-deploy-token.md)).
2. Deploy the preview: `npm run deploy:preview` from the dev worktree.
3. Confirm the live build: `curl -s "https://preview-editor.techies.tools/?v=$(date +%s)"`
   names the same `index-*.js` as `dist/assets` (the cache buster skips an
   edge copy that has not revalidated yet).
