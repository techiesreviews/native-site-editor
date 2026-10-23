---
title: "Agent reads and media text use the runtime's overlay"
type: task (AFK)
status: closed
assignee: lead-32
builder: claude
blocked_by: [31-native-site-runtime]
---

## Goal

Candidate #2, slice c (research 01 §2). The effective source is read three ways today: `nativeEffectiveSource`, `mediaTextSource` (what the guarded edit reads) and `SiteFiles` (`shared/site-files.ts`, agent reads in the tab). After this slice the runtime answers all three; `SiteFiles` becomes an adapter over the same overlay, not a copy.

## Decided behaviour

[Ticket 05, item 3](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22): **agents see exactly what the preview shows, unsaved typing included.** Today the preview and an agent read through different code and can differ for a moment; after this they cannot.

## Files

- `shared/site-files.ts`, `src/agent-tools-read.ts`, `src/native-site-runtime.ts`
- `src/main.ts` (`mediaTextSource` and the guarded edit's `source:` port), `src/editor-workspace.ts`
- Tests: `tests/native-site-runtime.test.ts`, the agent read unit tests, `tests/native-save/native-agent-reads.spec.ts` (an agent `read_file` and `get_page` while typing is unsaved returns the typed text, the same the preview shows)
- `tests/main-ts-ceiling.test.ts`, `docs/agents/code-map.md`

## Done when

- One function answers "text of this path now" for the preview, media text and agent reads (grep shows no second layering).
- The spec above passes; `kit specs --affected` (agent and MCP specs) green.
- `kit size` at or under 355 KB; `npm run check`, `npm test` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Last slice of #2: the lead checks #2 on preview before 40 starts.

- `kit doctor`; `kit bg slice-32 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/32-one-overlay-for-agents-and-media.md --builder claude-opus-5-5`; `kit wait job slice-32 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected` plus `kit specs native-agent-reads.spec.ts native-mcp.spec.ts`, `kit size`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket>`.
- Report: unit and specs `RESULT:` lines, `kit size` KB, review folder and decisions, PR and merge SHA, `main.ts` lines and ceiling.

## Done (2026-10-23)

- One function answers "text of this path now": `textNow` in `src/native-site-runtime.ts`. The preview's `source` is it; `textSource` (media text, guarded edits, agent reads) is it with the usage texts (an opaque draft's text read for usage, the wider text index). `mediaTextSource`'s own layering is gone.
- Agent reads in the tab answer with the runtime's text first: `SiteFiles` (`shared/site-files.ts`) takes the tab's text now as a port and uses it in `read`, `export` and `texts`, before the shared drafts and GitHub; a deleted or binary draft stays what the drafts say, and text past the agents' 1 MB limit is not taken. `src/agent-tools-read.ts` passes the runtime's `textSource`; `src/main.ts` hands the agent context the runtime's `source` for draft texts. A saved file the tab holds is read without asking GitHub.
- Tests: `tests/native-site-runtime.test.ts` (the media text equals the preview's text wherever the preview has one), `tests/agent-tools-read.test.ts` (reads, get_page and export give the tab's text now; deletions, binaries and over-limit text fall back), `tests/native-save/native-agent-reads.spec.ts` (typing on while an agent is connected: `read_file` and `get_page` return the typed text the preview shows).
- Left: `src/agent-site.ts` still names its port `mountedSource` and keeps a `?? draft.content` fallback for a held edit away from its workspace; `src/agent-tools-edit.ts` reads the pinned context's drafts (needed while away). Both are outside this slice's files.
