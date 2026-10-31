---
title: "Exact-part edits: second-look fixes (follow-up on 10)"
type: task (AFK)
status: closed
assignee: am-40
builder: claude
blocked_by: [10-exact-part-edits]
---

## Goal

Slice 10's catch-up second look (OpenCode `deepseek-v4.1-flash-free`, 2026-10-29, evidence `.scratch/reviews/unknown/20261029T033943Z` in the main checkout; see [ticket 10 Done](10-exact-part-edits.md#done-2026-10-28)) found five P2 faults that are not in ticket 10's Follow-ups. The reviewer checked each line against the code at `fab35e042`; each one holds.

## Decided behaviour

1. **A stale page command keeps its read when the text cache is full** (`src/agent-tools-edit.ts` about line 189, `prepareNow`). `rememberText(file.hash, file.content)` runs before `readText(expected)`. When the cache is at its cap (200 texts / 16 MB), today's text is not cached yet (a cached text only moves to the front, `src/agent-part.ts` `rememberText`) and the agent's read is the oldest entry, storing today's text evicts it. Then the command is refused for its old hash instead of having its element ids mapped. Look up `expected` first, or pin it for the lookup.
2. **A count mismatch is not offered as a safe retry** (`shared/agent-edit.ts` about line 164, `wordsMoved`). When the words occur a different number of times now than in the read, `{ index, at: was[0] }` points at the first copy as read. That is usually the unchanged original. `editClash` then offers it "as it is now" and invites a retry. A unique edit retried from it is still not unique, and an `all` retry can replace a copy another agent added since. Refuse with "read again" and no part, or find the copy that actually changed. The retry wording must be safe for `all`.
3. **A cut part does not invite a retry from its text** (`shared/agent-edit.ts` about line 196, `editClash`). `partOf` cuts a part over `PART_LIMIT` (4,000 characters) and marks it `truncated`, but the message always says "send the edit again with oldText from part.text". When `part.truncated`, say to read the file again instead.
4. **The catch-up works out sections only for the files it shows** (`shared/agent-read.ts` about line 59, `catchUpOf`). `sections` (parse and compare) runs for every changed file before the list is cut to `CATCH_UP_FILES` (20). With many changed pages, every read stalls the tab. Work out sections only for files that can be shown: at most `CATCH_UP_FILES`, and ideally only those left after the 2 KB cut.
5. **A draft named `__proto__` is listed in the catch-up like any other file** (`src/agent-part.ts` about line 126, `markOf`). `files[draft.path] = …` on a plain object sets the prototype for that path, so the file never shows in the catch-up. Use `Object.create(null)` or a `Map`, or refuse `__proto__` as a path. (Unlikely in practice; fix it with the rest.)

## Files

- `src/agent-tools-edit.ts`, `shared/agent-edit.ts`, `shared/agent-read.ts`, `src/agent-part.ts` and their unit tests (`tests/agent-tools-edit.test.ts`, `tests/agent-part.test.ts`)

## Done when

- One unit test per item, each failing before its fix:
  - Cache full with the agent's read oldest: a stale page command has its element ids mapped, or is clearly told to read again, never refused for a stale hash.
  - One copy read, another agent adds a copy elsewhere: the conflict's part is not the unchanged original, and an `all` retry does not touch the added copy.
  - Changed `oldText` longer than `PART_LIMIT`: the refusal says to read again.
  - 60 changed pages with a spy on `sections`: it runs for at most `CATCH_UP_FILES` files.
  - Draft path `__proto__`: the catch-up lists it, or the write is refused.
- A test (gap, no fix expected): a read reply just under the relay's 8 MB limit (`worker/agent-relay.ts` `maxBytes`) plus a full catch-up (20 files, 2 KB) still fits, or the size check counts the catch-up.
- `kit unit --affected`, `kit specs --affected` (the exact-part spec) and `kit doctor` pass.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit unit --affected`, `kit specs --affected`, `kit review`, `kit pr`. Quote the RESULT lines in Done.

## Done (2026-10-29)

1. A stale page command looks up the agent's read before the tab keeps the page's text now (`src/agent-tools-edit.ts` `prepareNow`): with the text cache full and that read oldest, its element ids are still mapped to the page now. The agent's reads are looked up once per edit and reused on every attempt, so a retry after a race (whose first attempt kept the page's text and let the read go) maps them too, for `edit_file` as for page commands.
2. Words found a different number of times now than in the read (`shared/agent-edit.ts` `wordsMoved`, marked `recounted`) are refused with no part and "Read the file again.", so neither a unique nor an `all` retry starts from the unchanged original or takes a copy added since. Words gone altogether still get their part as before.
3. A clash whose part is cut at `PART_LIMIT` says to read the file again instead of retrying with `oldText` from `part.text`.
4. `catchUpOf` (`shared/agent-read.ts`) cuts the list to `CATCH_UP_FILES` and 2 KB first, works out sections only for the files left, then cuts again with them.
5. A mark keeps its files in an object with no prototype (`src/agent-part.ts` `markOf`): a draft named `__proto__` is told in the catch-up.

Commits: "Exact-part edits: second-look fixes (follow-up on 10)", "Review fixes round 1", "Review fixes round 2", "Review fixes round 3", "docs: 40-exact-part-edits-second-look-fixes commits by subject", "docs: 40-exact-part-edits-second-look-fixes follow-ups from review" and this commit.

Tests: one per item in `tests/agent-part.test.ts` (items 2 to 5) and `tests/agent-tools-edit.test.ts` (item 1); each failed on the code before its fix (54/59 with the four source files at the claim commit). Gap test, no fix needed: a read reply exactly at the read tool's limit (relay `maxBytes` less 4096) plus a full catch-up and the transport's largest envelope stays within `maxBytes`. Also covered: a copy removed since the read is refused with no part like one added, and a catch-up cut to its files without sections is cut again once their sections are added. Words gone altogether keep their part (ticket 10's test "the same words changed meanwhile are refused with the part as it is now").

- `RESULT: ok unit 3891/3891 (252 files)` (`kit unit --affected`)
- `RESULT: ok specs 1/1 passed` (`kit specs tests/native-save/native-agent-exact-part.spec.ts`; `--affected` selects 152 specs through the shared imports, left to `kit pr`)
- `RESULT: ok doctor 11/11 checks passed`; `npm run check` and `npm run lint` pass.

Feature list: no change (only what agents are told in refusals and catch-ups changes; nothing the user sees).

Review decisions:
- Round 1: added the `Commits:` line and tests for a copy removed since the read and for the catch-up's second cut. Declined a new test for words gone altogether, since ticket 10's "the same words changed meanwhile are refused with the part as it is now" covers it.
- Round 2: fixed the retry after a race losing the agent's read (reads looked up once per edit), with a test that fails without it (40/41); `READ_TEXTS` is exported so the cache tests follow its cap.
- Round 3: added an `edit_file` retry-after-race test (with `all`; fails without the once-per-edit lookup, 41/42) and a test that a recount in a later replacement names it ("The words replacement 2 changes …") with no part.

### Follow-ups

- Spec (P2): 63be9428f:shared/agent-edit.ts:166 — P2 ticket: ticket 40, item 2 says "The retry wording must be safe for `all`". This change only takes the part away when some copies are still there (`is.length > 0`). When an `all` edit's read had several copies and all of them have since changed (`was.length > 1`, `is.length === 0`), `wordsMoved` still returns `{ index, at: was[0] }` with no `recounted`. `editClash` (line 188–204) then builds the part around the first copy only, and the message says "part has them as they are now: send the edit again with oldText from part.text". If the agent follows that, its `all` retry carries the first copy's lines, so the other copies it meant to change are left unchanged or are changed by a different rule, with no warning. Fix: keep the part only when the read had exactly one copy. For example, set `recounted` when `was.length !== is.length && (is.length || was.length > 1)`, or give the multi-copy "gone" case its own "Read the file again." refusal. Ticket 10's "the same words changed meanwhile are refused with the part as it is now" covers only a single copy. Add the test listed under Validation gaps.
- Validation gaps (gap): `tests/agent-part.test.ts`: a read that has "Welcome" twice, a text now where both copies are changed (for example to "Hello"), and an edit `{ oldText: "Welcome", newText: "Hi", all: true }`. Assert a `PartClash` with `part === undefined` and a message ending in "Read the file again." (or, if the part stays, a message that does not invite an `all` retry from `part.text`). The current code fails this test.
- Validation gaps (gap): `tests/agent-part.test.ts:307`: the gap test hard-codes the read tool's limit as `AgentRelay.maxBytes - 4096`. `src/agent-tools-read.ts:98` has its own literal `8 * 1024 * 1024 - 4096`. If either value changes, the test still passes while the real margin no longer holds. Export the read tool's limit (or have it derive from `AgentRelay.maxBytes`) and import that value in the test, so the test checks the number the tool actually uses.
- Validation gaps (gap, second look): tests/agent-part.test.ts:350 — missing coverage: neither item-4 test forces the first 2 KB fit to drop files. The 60-file case uses short paths (all 20 fit), and the long-path case asserts `bare.files.length === CATCH_UP_FILES`, so nothing checks that `sections` is computed only for files left after a byte-reducing first cut (or that `changes[index]` still lines up when `shown` was shortened). Add a case with 60 changed files whose paths are ~150 characters so `catchUpOf(before, now)` alone returns fewer than `CATCH_UP_FILES`, pass a counting `sections`, and assert `calls === bare.files.length`, `bare.files.length < CATCH_UP_FILES`, `told.files.length <= bare.files.length`, and every told file carries `sections`.

