---
title: "kit status: one table of tickets, builders, PRs, CI and preview"
type: task (AFK)
status: closed
assignee: ak-12
blocked_by: [01-kit-front-door]
builder: sol
---

## What

- Follow the kit layout in [the map](../../map.md#notes): one executable in `scripts/agents/kit.d/`, a `# kit: <summary>` line, `--help`, Node 24 and owner from `kit-lib`, one final `RESULT:` line, own test file.
- `tickets.mjs` gains `--ref <ref>`: reads maps with `git ls-tree`/`git show <ref>:path` instead of the working tree (default stays the working tree).
- `kit status [map] [--ref origin/dev]` (default ref `origin/dev` after a fetch): one table — ticket, status, assignee/builder, landed commit (`git log --grep` of the ticket slug on the ref) or open PR (`gh pr list --search`), CI state of that commit, and a header line with the live preview version (`index-*.js` from preview-editor.techies.tools with a cache buster) and dev's CI.
- Works offline with a note when `gh` or the network fails.

## Files

- `scripts/agents/kit.d/status`
- `scripts/agents/tickets.mjs`
- `tests/agent-tickets.test.ts`
- `tests/kit-status.test.ts`

## Done when

- Unit tests: `--ref` reading from a temp repo commit, table rendering, offline fallback.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.

## Done (2026-10-16)

- **Behavior.** `kit status [map] [--ref <ref>] [--no-fetch]` fetches, then prints a
  header (ref, short SHA, the branch's CI, live preview bundle `index-*.js` fetched
  with a cache buster) and one row per ticket: ticket, status, owner (assignee, else
  builder), LANDED and CI. LANDED is the commit that set `status: closed` on the
  ref (runners close the ticket in the landing), plus `#N` when a merged PR matches
  the slug; an open PR shows `#N open`; an open ticket with a merged PR shows its
  merge commit when it is on the ref, else `#N merged`. CI always describes the
  LANDED cell (open PR checks, or the landed commit's runs, newest run per workflow
  as in `ci-summary.mjs`), else `-`. `gh` or network failures become notes and the
  git table still prints (`, offline` in RESULT). `tickets.mjs --ref` reads maps
  through `git ls-tree`/`git show` and parses `assignee`.
- **Demo.** `kit status agent-kit` on origin/dev 488ccdf: 31 tickets, 21 closed,
  max line width 90. Ticket 28 shows `488ccdf9 #2` (PR, rebase-merged); land.sh
  tickets show their closing commits. PR #1 was the lead's branch and closes no ticket.
  `fail` marks match GitHub (failed or cancelled "Deploy the dev preview" runs).
- **Commits.** 22e55caa (Sol build), 9e4828a6 (review fixes, Claude).
- **Tests.** `tests/kit-status.test.ts` and `tests/agent-tickets.test.ts`: 19 pass
  (temp-repo `--ref`, table rendering, offline fallback, CI follows LANDED, latest run
  per workflow). `npm run check`, `npm run lint` clean.
- **Review.** Evidence: main root `.scratch/reviews/ak-12/20261016T142423Z` and
  `20261016T142922Z`. Fixed 3: CI could describe a different commit than LANDED;
  older failed runs outweighed a newer green rerun; open tickets ignored merged PRs.
  Rejected 3: landed lookup by `git log --grep <slug>` (0 matches on dev for any
  ticket, since commits carry owner tags such as `(ak-28)`, not slugs; the closing
  commit is the landing by runner rule); 200-PR window (the repo has 3 PRs); 100-run
  window (older commits show `-` meaning unknown, never a wrong mark; per-SHA queries
  would add about 20 `gh` calls per run).
