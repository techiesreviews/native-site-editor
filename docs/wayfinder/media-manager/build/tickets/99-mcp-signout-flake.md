---
title: Make the MCP sign-out smoke test reliable on CI
type: task (AFK)
status: closed
assignee: claude (mm-99 runner)
blocked_by: []
builder: claude
phase: 5
---

## What

The `@smoke` case `tests/native-save/native-mcp.spec.ts:307` ("Disconnect MCP revokes the agent's token, and Cancel drops a token no agent used") failed on dev CI twice (run 38666119384 on 5e4389e5, run 38673062230 on 18fcdc30): `connectAgent` waits 15 s for **Disconnect MCP** and the editor still shows **Waiting for connection…**. It passes locally.

- Find the real cause from the CI logs and traces (race, timeout, shared state, port…) and fix it where it lives: in the test if the test is wrong, in the product if the product has a race.
- No blind timeout raises, no skip, no `known-failures.json` entry unless it is proven to be the environment.

## Done when

- The spec passes many times in a row locally (`--repeat-each`), also under load beside another suite.
- Dev CI's smoke job passes on the landing.

## Done (2026-10-15)

- **Cause (test, not product).** The browser contexts of one Playwright worker share the clipboard (probe: a context reads what an earlier, closed context wrote). `connectAgent` polled for any prompt (`"Server: \``), and the line-150 case before it leaves its own prompt there. The tab copies its new prompt only after its first context share (`start()` → `poll(true)` → `sync` lazy-loads `agent-site.ts`), so on slower CI the test read the old prompt first: both failing traces show the clipboard read finishing before the tab's `/api/agent/context` answer. The agent then connected with the previous test's token, reaching that test's session, and this tab stayed on **Waiting for connection…**. The Cancel half had the same hole (any `Bearer ase_`, i.e. the revoked first token, would pass its 401 check). Local repro: holding `/api/agent/context` 1.5 s after the line-150 case failed exactly as CI (line 52); with the fix 3/3 passed.
- **Fix.** `tests/native-save/mcp-prompt.ts` `copyConnectionPrompt`: chooses Connect with MCP, takes the token from this click's `/api/agent/connect` answer, and polls the clipboard for that token. The six MCP connect helpers use it (`native-mcp`, `native-mcp-media`, `native-discard`, `native-component-loader`, `native-delete-card-race`, `native-components`); the Disconnect spec's Cancel half checks its new token. New case "an agent connects with this tab's prompt while an earlier prompt is still on the clipboard" seeds a stale prompt and holds the context share; it fails with the old poll (stale token refused). `CODING_STANDARDS.md` and `scripts/check-specs.mjs` say to poll for content only this copy has. No product change; nothing in `known-failures.json`.
- **Commits.** 16981182 claim; 466426ad ticket status; 46669e6d helper and specs; 7a0d20eb regression case; close.
- **Tests.** Line-147 + Disconnect cases `--repeat-each=10` interleaved, beside the five other touched specs in parallel: 20/20 and 44/44. New case 5/5 (and failing against the old poll). Whole `native-mcp.spec.ts` 14/14. `npm run check`, `npm run lint`, unit 3,252/3,252. (A first parallel attempt sharing one `--output` folder lost trace files to the other run's cleanup: ENOENT on `browserContext.close`, a runner artefact; the rerun used separate output folders.)
- **Review (GPT-6.1 Sol, read-only), 2 rounds.** Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-99/` (round1, round2; run.log model gpt-6.1-sol, sandbox read-only; result.md `REVIEW_STATUS: complete`). No defects. Round 1's validation gap (a committed regression, repeat runs under load) fixed in 7a0d20eb. Follow-ups Sol noted, not this slice's cause and not changed: `worker/app.ts` swallows a failed `markGrantUsed` (if the grant record saved `usedAt` but the hub's `use-grant` failed, later requests never repair it and the tab waits); the test server's fake Durable Object (`tests/native-save/server.ts`) runs hub operations without production's `blockConcurrencyWhile`, so concurrent operations could overwrite each other.
- **Bytes.** Specs only: boot unchanged; `test:budget` 351 KB gzip (budget 355 KB).
