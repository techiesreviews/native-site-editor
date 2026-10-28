---
title: "Agent changes target the exact part they change"
type: task (AFK)
status: closed
assignee: am-10
builder: claude
blocked_by: []
---

## Goal

Several agents on one page must not refuse each other. Today every edit carries the whole file's `expectedHash` (`shared/agent-edit.ts`), so any change elsewhere on the page refuses it.

## Decided behaviour

[Ticket 05, item 2](../../tickets/05-grill-several-agents-at-once.md#resolution-2026-10-24):

- An edit targets the exact words (`edit_file` old/new text) or section it changes and lands while that part is unchanged, whatever else changed.
- Every reply tells the agent what changed since its last read.
- Only a true clash (that same part changed meanwhile) is refused, and the refusal carries the part's new version so the agent retries at once.
- Clean-up slice 52's rule stays: an edit to the part Lex is typing in waits until he clicks away.

## Files

Expected (confirm while designing): `shared/agent-edit.ts`, `shared/agent-read.ts`, `shared/agent.ts`, `src/agent-tools-edit.ts`, `src/agent-records.ts` (a per-agent read mark for the catch-up), `worker/mcp.ts` (result text only), `docs/mcp.md`; tests `tests/agent-*.test.ts` and a new `tests/native-save/native-agent-exact-part.spec.ts`.

## Done when

- A spec runs two agents editing different sections of one page; both land with no refusal.
- Two agents change the same words: the second is refused with the fresh part, retries and lands.
- Replies carry a catch-up of changes since the agent's last read (unit test on its shape and size cap).
- Slice 52's waiting spec still passes.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-10 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-10 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- Big, delicate slice: one second-opinion review of the final version (`ASE_REVIEW_MODEL=grok-4.7` or `gpt-6.1-sol` `kit review --ticket <this ticket>`), within the weekly budget.

## Done (2026-10-28)

- `edit_file` targets its own words: it lands on the file's text now while each old text is still there, as often as and where the read had it (`all` included, when the tab keeps that read), whatever else changed since the hash it was read with. When those words changed meanwhile, the refusal (`conflict`) carries `part`: path, the file's hash now, line numbers and the words as they are now (whole lines, at most 4,000 characters), found between the nearest unchanged lines around the words as read (`shared/agent-edit.ts` `spanNow`, `PartClash`). A whole-file `write_file` still needs the exact hash.
- `make_component`, `add_section`, `move_section` and `remove_section` find the elements they name again by their unchanged HTML (any element moved by elements added or removed before it takes its new id); a changed element is refused with it as it is now, a vanished one (or another kind of element in its place) without a part (`src/agent-part.ts` `elementsNow`). The tab keeps the texts agents read (by hash, 200 texts / 16 MB) to do this.
- An edit that loses a race with another change landing on its file is prepared again on the new text and run again (at most twice), so two agents sending at once both land; before each run it waits again if it now changes the part the user types in (slice 52), and its proofs are checked through the new preparation (`src/agent-tools-edit.ts`). An agent's own landed change is not told back on whichever reply comes next (a waited edit's status lookup included), unless it landed on another text than the agent read or the file changed again since; a refused reply leaves the agent's catch-up for its next reply.
- Replies to reads, edits and `get_command_status` carry `changesSinceLastRead` when the workspace's drafts changed since that connection's last call, its own changes left out: up to 20 files with `change`, `hash` and the page `sections` touched, `more` for the rest, within 2 KB (`shared/agent-read.ts` `catchUpOf`, `src/agent-part.ts` `tellAgent`). Reads now send the connection's grant id so the tab can tell agents apart. Marks live in the receiving tab's memory, per connection.
- Tool descriptions, the site instructions and `docs/mcp.md` say so. Feature list: F-agent-10.
- Tests: `tests/agent-part.test.ts` (clash part, retry against it, element re-finding, catch-up shape and size cap, kept texts); `tests/agent-tools-edit.test.ts` (race retry and clash, updated hash contract and refusal table); `tests/mcp-runtime.test.ts`, `tests/agent-tool-table.test.ts` updated; new `tests/native-save/native-agent-exact-part.spec.ts` (two agents on different sections at once, plus a stale-hash section removal; two agents on the same words, refused with the part, retry lands, catch-up told).
- `RESULT: ok unit 3846/3846 (250 files)` (`kit unit --affected`); `RESULT: ok specs 1/1 passed` (exact-part spec); `RESULT: ok specs 5/5 passed` (waits, edits, reads, recovery, presence); `npm run check` and `npm run lint` clean.
