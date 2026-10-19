---
title: "Prepare release and rollback evidence"
type: task (AFK)
status: closed
assignee: dor-30
blocked_by: [29-rollout-controls]
builder: claude
phase: 6
---

## What

Produce executable release checklist and sanitized metric comparison workflow. Separate steady state, Watch, migration and stale-client requests; compare completed comparable windows. Record actual quota errors when available.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md) (rollback), [handoff](../../handoff.md) release evidence.

## Files

- `scripts/agents/durable-report.mjs`
- `tests/durable-report.test.ts`
- `docs/wayfinder/durable-object-reduction/build/rollout.md`
- `docs/wayfinder/durable-object-reduction/build/validation.md`

## Done when

- U validates attribution/window handling; checklist requires successful local/preview evidence and explicit production authorization. Rollback pauses features without restoring legacy behavior.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Historical quota dimension, plan and aggregate stored bytes remain unverified; no percentage-saving or incident-resolution claim without evidence.

## Done (2026-10-19)

**Behaviour.** Script and docs only; no product code changed; nothing deployed or run against Cloudflare.
- `scripts/agents/durable-report.mjs` (read only, token from `CLOUDFLARE_API_TOKEN` only): for one DO namespace and two
  windows (`START/END` UTC, end exclusive) it queries the baseline's datasets (`durableObjectsInvocationsAdaptiveGroups`
  requests/errors by status, `durableObjectsPeriodicGroups` duration/rowsRead/rowsWritten, `durableObjectsSqlStorageGroups`
  max storedBytes, filtered by `namespaceId`) and prints a table with before, after and change. **Not comparable** (with
  the reason, no change printed) when a window has not ended or ended under `--settle-hours` (default 3) ago, the windows
  differ in length or UTC weekday/time, overlap or are reversed, or a query is refused, empty-handed, malformed or cut off
  at the 1,000-group limit. An empty dataset is **no data**, never zero. With `--zone --host` it also reads the zone's
  `httpRequestsAdaptiveGroups` and attributes: migration (2xx `/__maintenance/*`, at least one DO call each), stale tabs
  (410 on the obsolete routes, Worker requests with no DO work), steady (DO requests minus migration, "at most"). Watch is
  reported as not separable (it shares `/mcp`). DO errors are listed by status, never labelled quota. Ids print as short
  hashes; GraphQL error text is redacted (token, ids, 32+ hex runs, control characters) and capped; raw paths never print.
- `build/rollout.md`: gate 1 local evidence (links validation.md), gate 2 preview rows P1–P8 (signed-in steps, hibernation,
  deployment restart, detection vs deletion times, Watch, each switch off and back on including Retry, canary cleanup with
  per-canary row bounds, rollback rehearsal), gate 3 Lex's written production authorization, switch defaults for all three
  wrangler files, release steps, rollback by switch (never an older polling/mirror/replay release), window comparison
  with the report, and the unverified historical quota dimension in plain words.
- `build/validation.md`: the legacy inventory, migration limits and controls/rollback rows now point at tickets 27–29 tests
  and rollout.md; the PREVIEW section links rollout.md.

**Commits.** 8c2ecda7 (report + tests), 3ef631f7 (rollout.md, validation links), 79b58a32 (review 1); Claude; hashes before
`kit pr`'s rebase.

**Tests.** New tests/durable-report.test.ts (11) on recorded-shape GraphQL answers: completeness (open, settling, settled,
bad windows), shape reasons, a comparable run (queries, table, changes, attribution, statuses, hashed ids), incomplete
windows, different weekday and refused/502/empty/malformed/truncated answers, empty datasets as no data, redaction of
echoed secrets, attribution without zone data, the obsolete route list against the real Worker (410 editor-updated), args
and the documented `node … --help` command. Focused `scripts/agents/unit.sh tests/durable-report.test.ts` pass 11 fail 0;
eslint on both files ok (by hand).

**Review** (gpt-6.1-sol, medium, read-only; run.log verified). `RESULT: ok review git diff
f26279d3df10e16b21771a9c709fa075ecaea704...HEAD evidence
/home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-30/20261019T023932Z`: fixed 3. P1 canary accounting averaged
an hour, which does not bound the next deletion: now one canary per quiet hour, method/keys/wake from the checkpoint, the
canaries must cover deleteAll, per-key and a wake, and both reserved formulas must hold for every canary, else no batches.
P2 empty datasets became zeros and -100%: now no data. P2 scripts are not executable: commands use `node`; added a
`--help` smoke test. Rejected 1 nit: rollout.md's `../tickets`, `../research`, `../handoff.md` links are correct from
`build/` (the suggested `../../` would leave the wayfinder folder).

**Kit.**
- RESULT: ok doctor 7/7 checks passed
- RESULT: ok review git diff f26279d3df10e16b21771a9c709fa075ecaea704...HEAD evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-30/20261019T023932Z
- Boot size not run: scripts and docs only.

**Limits.** The GraphQL field and filter names follow the baseline research; `namespaceId` filters on the periodic and
storage datasets and the zone path filters are unverified until the lead's first real run (a refusal prints not comparable
with the redacted reason). Watch cannot be separated in these datasets. The historical exhausted dimension stays unverified.

Landed: PR #83, merged as 8c6e9f8 (`RESULT: ok merged #83 8c6e9f8`; kit pr: tier full, check, unit, lint, specs, review, CI ok).

Follow-up (landing review round 2, gpt-6.1-sol, medium, read-only; evidence
/home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-30/20261019T024532Z; read after the merge): fixed 2 in a
follow-up PR. P2: a failed, malformed or truncated zone answer still allowed `comparable` and percentages; asked-for
attribution that cannot be read now makes the pair not comparable (new test: three failures in either window, 12 tests).
P2: rollout P6 asked every switch for a paused message and Retry; each switch now has its own check (relay: message and
Retry; Watch: immediate wait, then a new activation holds; lifecycle cleanup: record kept past its deadline, deleted at the
next wake once on). Claude; focused unit.sh pass 12 fail 0, eslint ok.
