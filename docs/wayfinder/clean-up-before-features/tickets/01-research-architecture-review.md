---
title: Re-check the architecture review on today's code
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

The 2026-10-12 deepening review read `dev @ edc0f76f`. Since then the sturdy-base, media-manager and Durable Object builds landed. For each candidate below, on today's `dev`: does the problem still exist, how big is it now (files, call sites, line counts), what has changed or already been fixed, and is it still Strong, Worth exploring or Speculative (`mattpocock-skills:codebase-design` vocabulary)? Name any new deepening candidate the recent builds created. For each surviving candidate give a rough size (S/M/L), the files it touches, which others it overlaps with (especially through `src/main.ts`), and the plain-language behaviour questions it raises for Lex (things a user could see change), each with a recommended answer.

Candidates from 2026-10-12:

1. **Workspace session:** one owner for generation, setupScope, draftScope, mediaIdentity and Stamp; about 30 `epoch !== generation` guards; three branch comparisons that differ. Strong, top pick.
2. **Native site runtime:** `main.ts` about lines 1716–3200, effective source, file graph, base/baseline; "new draft paths" written seven ways. Strong.
3. **Shared site-operation rules for MCP and the tab:** slug regex drift between `mcp.ts` and `native-pages.ts`, "parent is a file" four times, make_component refusals twice. Strong.
4. **Agent relay module:** protocol over `app.ts`, agent-context, agent-operations/requests typed `any`, `agent-menu.ts`, agent-controller. Worth exploring. (The Durable Object build rewrote this area; re-check from scratch.)
5. **One Page Structure model:** `row()` decides semantics while painting; three heading rules. Worth exploring.
6. **Optional-slot rule in `rules/` over RuleView:** three copies; the starter loader stays a copy per ADR 0001. Worth exploring.
7. **Strict outline as a SourceTree adapter:** Speculative; the review recommended parking it.
8. **Delete pass-throughs:** cards-controller and 24 forwarders in `main.ts`. Housekeeping.

Round 1 questions left unanswered on 2026-10-12, to re-check and carry into [Decide the architecture review's behaviour questions](05-grill-architecture-choices.md): should a page address be strict (lowercase letters, digits, dashes)? When the live site and the editor disagree, which wins? Should #7 be parked?

## Resolution (2026-10-22)

Re-measured at `dev @ 89ac5e0e` against `edc0f76f`.

- **Kept as Strong:**
  - #1 Workspace session (L). It grew: 66 generation guards, 58 hand-written "still current?" checks, six same-workspace comparisons that differ.
  - #2 Native site runtime (L). Still about 1,255 `main.ts` lines; the effective source is now read three ways and "new draft paths" nine.
  - #3 Shared site-operation rules (M). It grew: three page-address rules, eleven "is a file" sites.
- **Reshaped:** #4 Agent relay. The Durable Object build turned it into a missing operation table: one tool is spelled in 6–7 files (Worth exploring, M).
- **Unchanged, Worth exploring:** #5 Page Structure model and #6 optional-slot rule.
- **Parked:** #7 (Speculative).
- **Mostly fixed:** #8, by tech-debt 08. The cards-controller and four one-liners are left (S).
- **New:** N1, agent edits prepared twice in the same tab (Worth exploring, M–L).

Recommended order: #1, #2, #3, #4 + N1, #6, #5, #8; #7 parked. The behaviour questions, each with a recommended answer, are listed for [ticket 05](05-grill-architecture-choices.md).

Findings: `docs/wayfinder/clean-up-before-features/research/01-architecture-review.md` on branch `research/cbf-01-architecture-review`, commit `4fe31db3` (not merged).
