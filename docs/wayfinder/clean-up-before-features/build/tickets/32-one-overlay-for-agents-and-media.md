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

- One function answers "text of this path now": `textNow` in `src/native-site-runtime.ts`. The preview's `source` is it; `textSource` (media text, guarded edits, agent reads) is it with the usage texts (an opaque draft's text read for usage, the wider text index). `mediaTextSource` and the `nativeEffectiveSource` name are gone. The text index answers only under a key (repository, branch, commit and load): without a site there is none, and Media remembers no texts, so a plain repository's agent reads are GitHub's. The agent edit's text check (`agentSiteActions.text` in `src/main.ts`) is the runtime's `source`, falling back to the branch for a file the runtime holds no text for.
- Agent reads in the tab take a file's text from the runtime alone: `SiteFiles` (`shared/site-files.ts`) takes the tab's text now as a port; given, it answers every draft's text (a draft it gives none for is refused, never answered from the texts shared earlier) and a saved file's whenever the tab holds one, without asking GitHub. `source` follows the drafts alone, as `list_files` and `export_site` mark them. A deleted or binary draft stays what the drafts say; text past the agents' 1 MB limit is refused (413; only a draft's refusal asks the user to save). `export` asks GitHub for no saved file the tab holds. `src/agent-tools-read.ts` passes the runtime's `textSource`; `src/main.ts` hands the agent context the runtime's `source` for draft texts, so the shared hashes come from the same rule.
- Without the port (an agent edit, which may be held away from its workspace), `SiteFiles` reads the texts the tab shared, as before.
- Tests: `tests/native-site-runtime.test.ts` (the media text equals the preview's text wherever the preview has one), `tests/agent-tools-read.test.ts` (read_file, get_page and export give the tab's text now; deletions, binaries, over-limit text and an unshared draft; `texts` takes a held saved file from the tab and prefetches only the rest; typing since the context was shared reads the newer text and hash; a held text past the limit is left out of `texts` and not asked of GitHub; export asks GitHub for no held file; without a site a stale text under the empty key never answers) and `native-agent-reads.spec.ts` (an `edit_file` with the hash read from the typed text applies), `tests/native-save/native-agent-reads.spec.ts` (typing on while an agent is connected: `read_file` and `get_page` return the typed text the preview shows). `tests/main-ts-ceiling.test.ts` ceiling lowered to 3880.
- Evidence: `src/main.ts` 3870 lines (ceiling 3880, was 3890). `kit size`: boot 349 KB before and after (±0 KB), budget 355 KB. Build: `RESULT: ok unit 2948/2948 (186 files)`; `RESULT: ok specs 2/2 passed` (native-agent-reads, native-mcp); `kit specs --affected` 49 of 50, the one failure (native-agent-live) passed alone (`RESULT: ok specs 1/1 passed`). Review fixes: `RESULT: ok unit 2956/2956 (187 files)`, `RESULT: ok specs 4/4 passed` (native-agent-reads, native-mcp, native-agent-live, native-agent-edits), size ±0 KB.
- Left for a follow-up ticket: `src/agent-site.ts` still calls the port `mountedSource` (its doc says "a mounted editor's text") and keeps `?? draft.content` for an edit held away from its workspace; `src/agent-tools-edit.ts` builds `SiteFiles` without the tab's text, so while typing on a saved file has not been drafted (the draft store could not write it) a read's hash and an edit's disagree and the edit is refused. Both files are outside this slice.
