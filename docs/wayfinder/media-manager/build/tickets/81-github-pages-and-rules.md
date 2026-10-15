---
title: GitHub Pages project sites, ADR 0001 and the rules
type: task (AFK)
status: open
assignee: claude (mm-81 runner)
blocked_by: [80-change-site-address]
builder: sol
phase: 7
---

## What

- The Worker's project-site check (`worker/hosts.ts:119`, `shared/hosting.ts:233-250`) stops telling users to add a custom domain; it says the site works from its sub-folder once the address is set.
- When the address is a `github.io` project site, the editor writes `.nojekyll` at the root if missing ★; the starter ships one too ★.
- "Keep the old address working" says that GitHub Pages does not read `_redirects`, so the old address will not forward there.
- Amend [ADR 0001](../../../../adr/0001-the-repository-is-the-site.md)'s root-link rule (`:58`) for the prefix.
- Conventions: the root-link rule (`worker/site-conventions.ts:39`) and the Media chapter learn the prefix; starter `AGENTS.md`, `fixtures/actual-starter` and the vendored copy refreshed.

## Done when

- `tests/hosting.test.ts` (or its current name): the new message; `.nojekyll` written once.
- The drift test passes; `tests/mcp-runtime.test.ts` checks the conventions' root-link rule.
