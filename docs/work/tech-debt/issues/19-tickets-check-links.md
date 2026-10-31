---
title: tickets.mjs check fails on broken relative links
status: ready-for-agent
assignee:
blocked_by: []
---

# tickets.mjs check fails on broken relative links

## What

Retro 2026-10-26, item 1. A planning helper wrote `../../../tickets/…` in 18 site-structure build tickets, one folder too high. Nothing flagged it, and it was fixed by hand in `151f0d4c6`. `scripts/agents/tickets.mjs check` only checks the links in feedback "fix" lines (`tickets.mjs:240-246`).

## Done when

- `check` resolves every relative markdown link (`[…](path)` and `[…](path#anchor)`) in `docs/wayfinder/**/*.md` and `docs/work/**/*.md` against the linking file's folder. A missing target fails with `file:line` and the link.
- External links (`http…`, `t3-thread://`) and pure `#anchor` links are skipped. Anchors are not checked.
- The links on dev today pass, or are fixed in the same change.
- A test in `tests/` covers one good link, one broken link and one skipped external link.
- Kit: `scripts/agents/kit doctor`, `kit unit --affected`, `node scripts/agents/tickets.mjs check`, `kit review`, `kit pr` into dev.
