# Local testing and timing

The scripts and kit commands are listed in [agent-scripts.md](agent-scripts.md);
the automated checks in [guardrails.md](guardrails.md). Review, landing (`kit pr`)
and waiting: commands in [agent-scripts.md](agent-scripts.md#kit), order of steps
in [runner.md](runner.md).

## Setup

- Node 24: [Hooks](guardrails.md#hooks) set PATH in Claude; other agent CLIs receive
  a SessionStart instruction to prefix shell commands with the discovered Node PATH.
  In a plain terminal, put your installed Node >=24 on PATH.
- One branch, one worktree: `scripts/agents/worktree.sh <branch>` (shared
  `node_modules` and the native-static fixture are linked in).
- Leave a worktree untouched while a suite runs from it.

## Ports

Pool, resource gates, lock ownership and orphan cleanup: see
[agent-scripts.md](agent-scripts.md#ports). Run browser tests through `port.sh`;
run timing through `timing.sh`. Stop only processes you started.

## Which tests

- Nightly (`browser-tests.yml`): default fixture in 4 shards plus the `@actual`
  and `@native-static` groups. Pull requests (`ci.yml`, **CI / checks**) and
  pushes to `dev` (`deploy-preview.yml`): only `@smoke`.
- Specs a change reaches: `scripts/agents/kit specs --affected` picks them and
  their fixture groups; the commands below run groups by hand.
- Default group: `port.sh npx playwright test --project=native-save --workers=1 <files>`.
- Tagged groups need their own fixture and command:
  `port.sh bash -c 'npm run test:browser:native-static -- --port $ASE_TEST_PORT --workers=1'`,
  and the same with `test:browser:actual`. A tagged spec run in the default
  group shows as skipped, not as passed.
- Smoke: `port.sh npm run test:browser:smoke -- --workers=1`.
- CI fonts (DejaVu Sans, wider than the local Noto Sans): put
  `FONTCONFIG_FILE=$PWD/scripts/agents/ci-fonts.conf` (run from the worktree root) in front of the
  `port.sh` command; specs must pass with both fonts.
- Full suite before merging shared plumbing: `scripts/agents/full-suite.sh 3`;
  duration and shard limits: [agent-scripts.md](agent-scripts.md).
- Known failures: [tests/known-failures.json](../../tests/known-failures.json)
  records flaky and failing-on-dev tests (`ASE_KNOWN_FAILURES` points
  `suite-summary.mjs` and `kit specs` at another registry). Rerun once before
  calling a new failure flaky; known failures still fail the suite summary.

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
For boot bytes against dev (the 355 KB budget), `scripts/agents/kit size` is
enough; it caches results per commit.

## Preview and CI deploys

The lead deploys the preview with `kit preview`, which also checks the live
bundle. CI deploys `dev` by itself only once Lex adds the Cloudflare secret:
[github-settings.md](github-settings.md).
