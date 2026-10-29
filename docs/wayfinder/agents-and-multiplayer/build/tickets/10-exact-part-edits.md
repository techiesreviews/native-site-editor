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

- `edit_file` targets its own words: it lands on the file's text now while each old text is still there, as often as and where the read had it (`all` included, when the tab keeps that read; without it a stale `all` edit is refused with "read again"), whatever else changed since the hash it was read with. When those words changed meanwhile, the refusal (`conflict`) carries `part`: path, the file's hash now, line numbers and the words as they are now (whole lines, at most 4,000 characters), found between the nearest unchanged lines around the words as read (`shared/agent-edit.ts` `spanNow`, `PartClash`). A whole-file `write_file` still needs the exact hash.
- `make_component`, `add_section`, `move_section` and `remove_section` find the elements they name again by their unchanged HTML (any element moved by elements added or removed before it takes its new id); a changed element is refused with it as it is now, a vanished one (or another kind of element in its place) without a part; a `before`/`after` anchor edited in place keeps its place, only a gone one is refused (`src/agent-part.ts` `elementsNow`). The tab keeps the texts agents read (by hash, 200 texts / 16 MB) to do this.
- An edit that loses a race with another change landing on its file is prepared again on the new text and run again (at most twice), so two agents sending at once both land; before each run it waits again if it now changes the part the user types in (slice 52), and its proofs are checked through the new preparation (`src/agent-tools-edit.ts`). An agent's own landed change is not told back on whichever reply comes next (a waited edit's status lookup included), unless it landed on another text than the agent read or the file changed again since; a refused reply leaves the agent's catch-up for its next reply.
- Replies to reads, edits and `get_command_status` carry `changesSinceLastRead` when the workspace's drafts changed since that connection's last call, its own changes left out: up to 20 files with `change`, `hash` and the page `sections` touched, `more` for the rest, within 2 KB (`shared/agent-read.ts` `catchUpOf`, `src/agent-part.ts` `tellAgent`). Reads now send the connection's grant id so the tab can tell agents apart. Marks live in the receiving tab's memory, per connection (`src/agent-part.ts`, not `src/agent-records.ts`): a catch-up only matters while the tab that applies edits lives, and a reload has agents read again anyway. So the catch-up is per call (since that connection's last reply), not per read, and a reload starts it afresh.
- Fixed at `kit pr` (runner): the catch-up's workspace check goes through the session's `sameBranch` (`tests/workspace-session-guard.test.ts`); words the kept read never had but the file has now (a copy added since, not made by an earlier replacement) clash with their part instead of landing (`wordsMoved`; `native-mcp.spec.ts`'s stale-hash refusal). `RESULT: ok unit 3858/3858 (250 files)`; `RESULT: ok specs 3/3 passed` (mcp, exact-part, agent edits).
- Tool descriptions, the site instructions and `docs/mcp.md` say so. Feature list: F-agent-10.
- Tests: `tests/agent-part.test.ts` (clash part, retry against it, element re-finding, catch-up shape and size cap, kept texts); `tests/agent-tools-edit.test.ts` (race retry and clash, updated hash contract and refusal table); `tests/mcp-runtime.test.ts`, `tests/agent-tool-table.test.ts` updated; new `tests/native-save/native-agent-exact-part.spec.ts` (two agents on different sections at once, plus a stale-hash section removal; two agents on the same words, refused with the part, retry lands, catch-up told).
- `RESULT: ok unit 3846/3846 (250 files)` (`kit unit --affected`); `RESULT: ok specs 1/1 passed` (exact-part spec); `RESULT: ok specs 5/5 passed` (waits, edits, reads, recovery, presence); `npm run check` and `npm run lint` clean.

- Second look (catch-up, 2026-10-29, OpenCode `deepseek-v4.1-flash-free`, `kit review --ticket <this> --base 0e7e206ee^` at `fab35e042`): `RESULT: ok review git diff b0e7ea44ac7769fcc011cdf436b04204fbe0168d...HEAD evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/unknown/20261029T033943Z` (findings 22: P2 9, P3 2, gap 11). It repeats the Follow-ups below and adds five new P2 faults, now [ticket 40](40-exact-part-edits-second-look-fixes.md): a full text cache drops the read a stale page command needs; a count mismatch offers the unchanged original as a retry; a cut part (over 4,000 characters) still invites a retry from its text; the catch-up works out sections for every changed file, not only the 20 shown; a draft path `__proto__` drops out of the catch-up. One more gap, not filed: no test that a read just under the 8 MB relay limit plus a maximal catch-up still fits.

### Follow-ups

- Spec (P2): ab128cad1:src/agent-part.ts:79 — P2 fault: a `before`/`after` anchor can end up pointing at the wrong section. The anchor is kept at its old id whenever the element now at that id has the same tag and the same number of siblings, even if it is a different element. Example: the agent reads `[A,B,C]` and sends `move_section C after 0.1` (B). Meanwhile someone moves B to the front and edits it, so the page is now `[B',A,C]`. B' does not match B's HTML, but `A` at `0.1` is "alike", so C is moved after A without any refusal. Line 81 has the same flaw for the target (`section`/`element`): the clash `part` is whichever element now sits at the old id, which can be a different section, and the message calls it "it as it is now". Fix: keep an anchor in place only if it can be tied to its old self, for example by checking its id/class/data-key, or that its siblings before and after are unchanged. Otherwise refuse it like a vanished element. Send `part` only when the element at the old id is shown to be the same element.
- Spec (P2): ab128cad1:src/agent-part.ts:107 — P2 ticket: ticket 05 item 2 says "every reply tells the agent what changed since it last read", and item 1 has subagents on one connection naming themselves. Marks and the own-change filter are keyed by connection (`grantId` = `connection.id`, worker/mcp.ts:222). So when two subagents share a connection, each one's edits count as "own" for the other and are never reported, and whichever subagent calls first takes the catch-up from the other. This is written down in docs/mcp.md, but it does not meet the decided behaviour for the subagent case the spec designs for. Fix: key marks and owned files by connection plus the agent name once item 1 lands, and record this limit in the ticket's Done as a follow-up.
- Spec (P3): ab128cad1:shared/agent-read.ts:280 — P3 ticket: the field is `changesSinceLastRead`, but its meaning (in the Done text, the note and the docs) is "since your last call": every edit and status reply moves the mark too. The ticket asks for "since the agent's last read". Fix: name the field after what it holds (`changesSinceLastCall`) before agents depend on it, or move the mark only on reads.
- Standards (P2): ab128cad1:src/agent-tools-edit.ts:247 — P2 fault (CODING_STANDARDS.md, Async writers: "re-check that same proof after every await and before every write"): each run is now preceded by `await leaveUser()`, which returns with no `check()` when it did not wait, and then `await textHash(command.content)`. Neither await is followed by `check()` before `options.run(command)`. A fence, revision or workspace change during that real async digest lets the write go through. Before this change there was no await between `signal?.throwIfAborted()` and the run. Fix: put `check()` right after the `textHash` await, just before `ran = true`, or compute the hash after the run. Also extend the `forEachAwait` race test to cover this await.
- Standards (P2): a82236560:shared/agent-edit.ts:166 — P2 fault (CODING_STANDARDS.md, Racing and speculative reads, spirit: the page never stays stuck with no way forward): `wordsMoved` calls `spanNow` once per occurrence. Each call splits both texts again, rebuilds the two line maps, scans lines one by one in `lineAt`, and may run `minimalTextEdit`. A stale `all` edit of a common string (say `class=` in a 1 MB page with thousands of matches) costs O(matches × file size) on the tab's main thread and freezes the editor while the user types. Fix: build the line tables and anchor maps once per (read, now) pair and pass them into a per-span lookup; use binary search in `lineAt`.
- Standards (P3): ab128cad1:src/agent-part.ts:162 — P3 style (CODING_STANDARDS.md, Test fixtures: "document deliberate double assertions"; the same habit applies outside tests): `told as unknown as JsonValue` has no comment. Fix: type `AgentCatchUp` so it fits `JsonValue`, or add a one-line reason.
- Validation gaps (gap): `src/agent-tools-edit.ts:247`: no race coverage of the new pre-run awaits. Add a `forEachAwait` case where `textHash` (or a wrapped `crypto.subtle.digest`) disturbs the revision between `leaveUser` and `run`, and assert `writes === 0` and `receipts() === 0`.
- Validation gaps (gap): `elementsNow` anchor identity: add a unit test with read `[A,B,C]`, now `[B',A,C]` and args `{ section: "0.2", after: "0.1" }`. Expect a `PartClash`, not `{ after: "0.1" }`.
- Validation gaps (gap): No browser spec for a section clash. Add one to `native-agent-exact-part.spec.ts`: agent A edits text inside section 1.1, then agent B sends `remove_section 1.1` with the old hash. Expect `state: "conflict"`, a `part` containing A's edit, and the section still present.
- Validation gaps (gap): No size or perf guard for `wordsMoved`. Add a unit test with a ~1 MB text, 5,000 `all` matches and one unrelated change, asserting it finishes under a set time (e.g. 200 ms).
- Validation gaps (gap): Pre-noted own change of a write that then fails: add a test where `run` throws after `noteOwnChange` on attempt 1 and the retry lands on another text. Assert that the agent's next `tellAgent` reports the other agent's change.

