---
title: "kit follow-ups: test-server changes pick MCP specs; compare prints before and after findings apart"
type: task (AFK)
status: closed
assignee: td-kit
blocked_by: []
builder: sol
---

## What

Two kit gaps found on 2026-10-17.

1. **Test-server changes pick no specs.** `kit specs --affected` selects nothing when
   `tests/native-save/server.ts` (the fake GitHub and agent hub test server) or
   `tests/native-save/fake-hub.ts` changes (ticket 41's Done notes: "`kit specs --affected` selects
   none"). The server is Playwright's web server for every native-save spec, so the import graph
   never reaches it. Selecting all ~180 native-save specs is too wide: server.ts changed in 59
   commits in the last month, usually alongside `src/` changes that select their own specs.
   Decision (runner td-kit): add a `server` reason kind.
   - **Agent paths.** A change to either file selects the agent specs: every native-save spec that
     reaches `tests/native-save/mcp-prompt.ts` (`copyConnectionPrompt`) through the import graph or
     quotes `/mcp`. Reason: `server: agent paths (<changed file>)`.
   - **Changed routes.** For `server.ts`, a route-like string (a quoted path starting with `/`, such as
     `"/__demo/onboarding"`) on an added or removed diff line selects the specs whose quoted text
     contains it. Reason: `server: route "/__demo/onboarding" (tests/native-save/server.ts)`. Very
     common prefixes (`/`, `/api`, `/user` alone) do not count; reuse the 15-spec cap idea.
   - `kit.d/specs` passes the diff of `tests/native-save/server.ts` along with `src/` (the current
     diff covers `src/` only). `--list` counts the new kind (`[server 2]`).
2. **Compare prints fixed findings as if they were current.** `kit shots --compare` prints the layout
   findings of the before and after shots in one list, so findings already fixed still show (ticket
   40's Done notes). `index.json` keeps them apart: each `screens[]` entry has its `name` and `layout`.
   When the output has before shots, print two short lists, merged the same way as ticket 30's
   `findingsList` (screen, kind, selector, detail; widths and themes joined):
   - `layout findings (after):` every after finding (cap 20).
   - `fixed since before:` findings of a before shot that its matching after shot (same screen, width
     and theme, `ok`) no longer has, compared by kind and selector, since details carry measurements
     (cap 10). An empty list reads `none`. A before shot whose after shot is missing or failed adds
     nothing, so a multi-screen compare does not report later screens as fixed while they are still
     being shot.
   - A run with only before shots (compare's base capture) prints `layout findings (before):`.
   - Without before shots the output stays as it is (`layout findings:`). The RESULT line keeps its
     current format.

## Files

- `scripts/agents/specs-affected.mjs`
- `scripts/agents/kit.d/specs`
- `tests/kit-specs.test.ts`
- `scripts/agents/shots/findings-list.ts`
- `scripts/agents/shots/cli.ts`
- `tests/kit-shots-findings.test.ts`
- this ticket

## Done when

- Unit tests: a server.ts change selects the agent specs and a spec using a changed route, but not an
  unrelated spec; a fake-hub.ts change selects the agent specs only; a common prefix route selects
  nothing; `selectionLine` counts `server`. Split findings: after-only, fixed, both, unpaired before
  shot, failed after shot, no before shots (unchanged output).
- `kit specs --affected --list` on a branch touching `tests/native-save/server.ts` lists the agent
  specs with `server` reasons.
- `kit shots files --width 390 --compare <a commit before ticket 40>` prints the two lists, with the
  Files row tap-target finding under "fixed since before".
- `npm run check`, `npm run lint`, `scripts/agents/unit.sh`.
- Sol review on the PR; merged into `dev` through `kit pr`.

## Done (2026-10-17)

- **Spec selection.** `selectAffected` has a `server` reason kind. A change to `tests/native-save/server.ts`
  or `tests/native-save/fake-hub.ts` selects the agent specs (native-save specs reaching
  `tests/native-save/mcp-prompt.ts` or quoting `/mcp`): `server: agent paths (<file>)`. For `server.ts`, a
  quoted route (`/…`, not `/`, `/api`, `/user`) on an added or removed diff line selects the specs quoting
  it, at most 15 per route: `server: route "/__demo/onboarding" (tests/native-save/server.ts)`.
  `kit.d/specs` now passes `server.ts`'s diff with `src/`; `removedStrings` still reads `src/` only.
  Not all ~180 native-save specs: server.ts changed in 59 commits in a month.
- **Demo 1.** A one-line edit on server.ts's `/__demo/onboarding` route: `kit specs --affected --list` →
  17 specs in 0.8 s (8 agent paths, 11 route; onboarding and component-loader have both). A comment
  added to fake-hub.ts → the 8 agent specs. Both edits reverted.
- **Compare findings.** `findingsSections(index.screens)` in `findings-list.ts`: with before and after
  shots, `layout findings (after):` (cap 20) then `fixed since before:` (cap 10), both merged by
  `findingsList`, empty lists read `none`. A before finding counts as fixed only when the ok after shot
  of the same screen, width and theme has no finding of the same kind and selector (details carry
  measurements). Unpaired or failed after shots add nothing. Only before shots (compare's base run):
  `layout findings (before):`. No before shots: unchanged `layout findings:`. RESULT line unchanged.
- **Demo 2.** `kit shots files --width 390 --compare 7c6bc892` (the commit before ticket 40): after
  `none`; fixed since before: the Publish menu arrow (29x32 px) and the Files rows (350x32 px x16), light
  and dark. Out: `/home/ubulex/Projects/native-site-editor/.scratch/shots/td-kit/20261017-054309`. That
  run showed the base capture printing empty after/fixed lists, hence the before-only label.
- **Commits.** 9a0a2a4a ticket; 3839c507 build (Sol); c213fc30 kind+selector pairing, `none`; 97cd9612
  before-only label (Claude); close.
- **Tests.** `tests/kit-specs.test.ts` +3 (agent paths and routes from server/hub diffs, common prefixes,
  context lines and the 15-spec cap, real CLI `--list` with `[server 1]`); `tests/kit-shots-findings.test.ts`
  +8 (after-only, fixed, kind+selector pairing, unpaired, failed after, before-only, unchanged without
  before, separate caps). 37/37 focused; `npm run check`, `npm run lint`, `scripts/agents/unit.sh` 3961/0.
- **Review.** Sol, `/home/ubulex/Projects/native-site-editor/.scratch/reviews/td-kit/20261017T054648Z`:
  no defects, no validation gaps, no nits.
