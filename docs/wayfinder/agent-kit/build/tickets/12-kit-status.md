---
title: "kit status: one table of tickets, builders, PRs, CI and preview"
type: task (AFK)
status: open
assignee:
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
