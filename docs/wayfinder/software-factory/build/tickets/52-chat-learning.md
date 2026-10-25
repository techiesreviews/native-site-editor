---
title: Chat learning every other Monday, from the central corrections list
type: task (AFK)
status: closed
assignee: sf-52
builder: claude
blocked_by: [51-weekly-sweep, 40-ux-rulebook]
---

## Goal

Every two weeks, corrections Lex gave more than once become an automatic check (hook, lint rule, kit check) or a UX rulebook line; Lex sees the list before anything is added ([sweeps resolution](../../tickets/06-grill-sweeps-and-learning.md#resolution-2026-10-22) item 2). The chat project's sync is the only reader of chats and records every correction, tagged by project, in `~/Projects/chat/memory/corrections/<slug>.md`; the factory reads that list instead of rereading chats ([central memory resolution](../../tickets/10-grill-central-memory.md#resolution-2026-10-22) item 1). That sync is built in the chat project; this slice only reads its output.

## Decided behaviour

- **Scripted half, `kit learn [--since 14d] [--project <slug>]`:** reads `~/Projects/chat/memory/corrections/<slug>.md` (read-only; slug from `~/Projects/chat/memory/project-notes/README.md`'s project map by this repo's workspace, default `native-site-editor`) using the format in `~/Projects/chat/memory/corrections/README.md` (`date · kind · text · repeats: … · [thread](…)`), plus this repo's build feedback logs (slice 22). It groups lines that repeat (a `repeats:` date, or the same kind and close wording), and prints each group with its count, kind, dates, sources, and whether a rulebook rule or guardrail already covers it (search `docs/agents/ux-rulebook.md` and `docs/agents/guardrails.md` by key words; marked `covered?` for the model to confirm). Bundle `.scratch/learn/<date>/bundle.md`. A missing or empty file is not an error: `RESULT: ok learn nothing recorded yet`.
- **Judgment half, `docs/agents/routines/learning.md`:** the scheduled session (the sweep's schedule, even ISO weeks) runs `kit learn`, uses the `retro` skill on the bundle, and for each correction given more than once proposes one action: a hook, a lint rule, a kit check, or a rulebook line (wording given), with where it would go. It writes `docs/work/learning/YYYY-MM-DD.md`, lands it through `kit pr` (docs tier), and adds it to the sweep's single Monday message to Lex. **Nothing is added until Lex picks**; his picks become tickets (checks) or rulebook lines (after his yes).
- The chat-project files are never written from here.
- Kitchen "Weekly routines" loses its planned mark for chat learning.

## Files

- `scripts/agents/kit.d/learn` (new), `tests/kit-learn.test.ts` (new, with fixture corrections files)
- `docs/agents/routines/learning.md` (new), `docs/work/learning/README.md` (new)
- `docs/agents/kitchen.md` (Weekly routines), `docs/agents/agent-scripts.md` (new line)

## Done when

- Tests prove: the line format parses (and a malformed line is reported, not fatal); repeats group by `repeats:` and by kind plus wording; `covered?` marks a correction whose key words appear in a fixture rulebook; a missing file gives `nothing recorded yet`; the path override for tests (`KIT_CHAT_MEMORY`) is honoured and the real folder is never written.
- One real run: `scripts/agents/kit learn` on this machine; paste the RESULT line (it may be `nothing recorded yet` if the chat sync has not written this project's file).
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only; reads `~/Projects/chat/memory/` and writes nothing there.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-sf52 -- scripts/agents/kit slice --ticket docs/wayfinder/software-factory/build/tickets/52-chat-learning.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-sf52 --timeout 2h`.
- Report: unit `RESULT:` lines, the real `kit learn` RESULT, review decisions, PR and merge SHA.

## Done (2026-10-25)

- `scripts/agents/kit learn [--since 14d] [--project <slug>]` reads `corrections/<slug>.md` from the chat memory (`KIT_CHAT_MEMORY` or `CHAT_MEMORY_DIR`, else `~/Projects/chat/memory`; slug from the project map by this checkout's workspace or a `<workspace>-*` sibling, default `native-site-editor`) and `docs/wayfinder/*/build/feedback.md`, and writes nothing outside the main root `.scratch/learn/<date>/bundle.md`. It groups repeats by a `repeats:` date (a line of that day in either list that shares wording: one key word of the same kind, two of another; so a day recorded in both counts once; same kind first; another kind needs two shared key words; a date followed by another project's slug on its own, or not in the list, counts as one earlier time) and by same kind with at least half of the combined stemmed key words shared. The window is inclusive: `--since` a date, or N days before today, so runs 14 days apart share their boundary day. Each group shows count, kinds, dates, sources and `covered?` (the ux-rulebook or guardrails block sharing the most key words, at least 3). Malformed lines and unknown kinds or dates in either list are printed, listed and left out of the groups, not fatal (a bad `after release:` or fix link does not stop a feedback line from grouping); a chat and a feedback line of one kind within a day are flagged as maybe recorded twice; nothing in the window gives `RESULT: ok learn nothing recorded yet`.
- `docs/agents/routines/learning.md` (Mondays 11:00 in even ISO weeks: waits until 13:00 for the sweep's file merged on `origin/dev` through `kit bg` and `kit wait job`, falling back to the sweep's branch marked not yet reviewed, reads its held top 3 and always sends the one Monday message, also on any early stop; `kit learn --since <newest learning file date>`, looked up on `origin/dev` and open learning branches, `retro`, one proposal per repeated correction, `docs/work/learning/YYYY-MM-DD.md` through `kit pr`, added to the sweep's single message, nothing added before Lex picks) and `docs/work/learning/README.md`; kitchen Weekly routines drops the planned mark; agent-scripts lists `kit learn`.
- Tests: `tests/kit-learn.test.ts` with fixtures in `tests/fixtures/kit-learn/` covers parsing and malformed lines (chat and feedback; a bad `after release:` still groups), stemming, both grouping rules, a `repeats:` date found in the feedback log counted once, a cross-kind link, a same-kind date with no shared wording kept outside, bare-slug and `|` forms, `nothing recorded yet (1 malformed)`, the longest workspace winning, an invalid date, the recorded-twice note and its negatives, a slug inside `repeats:` prose, `covered?` against a fixture rulebook and guardrails file, slug lookup, arguments and the inclusive `--since Nd` start, the default `~/Projects/chat/memory` path with a 14-day-old line kept and a 15-day-old one left out, a bundle over 40 KB trimming lines given once first, missing and empty files, and that `KIT_CHAT_MEMORY` is read but never written (and `HOME` stays empty). `RESULT: ok unit 15/15 (1 files)` from `kit unit --affected`; `npm run lint` and `tsc --noEmit` clean.
- Real run: `RESULT: ok learn 2 repeated of 9 groups, bundle /home/ubulex/Projects/native-site-editor/.scratch/learn/2026-10-25/bundle.md` (the MCP-menu explainers, with its earlier time outside the list, and instant saving in the image edit bar).
- Commits: af056a58f (build), 7cabdd47d, 00bc2922c and 8405a3b21 (review fixes rounds 1–3), then the round 4 fixes.
- Review decisions:
  - Round 1 accepted: the routine always sends the one Monday message with the sweep's held top 3, also on early stops; the inclusive `--since` window; the stemming capture-group bug; another project's slug matched only right after a date; feedback lines with a bad kind or date left out of groups; only parse failures counted as malformed; all seven test gaps and the optional nits. Rejected: none.
  - Round 2 accepted: a fixed 11:00 start with a bounded wait for the sweep; the newest learning file also looked up on open learning branches; a day recorded in both lists counted once; feedback logs parsed here instead of matching `tickets.mjs` message text; the three test gaps. Rejected: exporting `realDate` from `tickets.mjs`, because that file is outside this ticket's Files and `kit sweep` keeps the same local copy.
  - Round 3 accepted: wait for the sweep's file merged on `origin/dev`, falling back to its branch marked not yet reviewed; keep a group with a line on or after the last learning file's date that the file does not list; the four test gaps. Rejected: none.
  - Round 4 (lead note) accepted: a same-kind `repeats:` link needs one shared key word; this Commits line and these decisions; the `nothing recorded yet (k malformed)` test. Also fixed from the review: the `ss` stemming check on the partly stemmed word and the visible `\uFEFF` escape. Not taken this round, at the lead's call: exporting `realDate`, reporting a feedback log without its heading, and the other test gaps.
- Feature list: no change (agent tooling and docs only).

### Follow-ups

- Spec (P2): a97e43164:docs/agents/routines/learning.md:39 — P2 ticket: Step 3 only stops the learning part on `RESULT: ok learn nothing recorded yet`. `kit learn` also succ
- Standards (P3): a97e43164:docs/agents/routines/learning.md:31 — P3 race: the sweep-wait loop's last `git fetch` can come just before 13:00, and the sweep's PR can merge after t
- Standards (P3): a97e43164:tests/kit-learn.test.ts:262 — P3 race: the test works out `daysAgo(14)` and `daysAgo(15)` in the test process, while the spawned `kit learn` reads its
- Validation gaps (gap): When several lines share the `repeats:` date, which one gets linked is never tested. The real corrections file has this shape: three `felt-wrong` lines on 2026-
- Validation gaps (gap): The zero-repeated result has no test. Add a CLI test with two unrelated in-window lines given once. Assert `RESULT: ok learn 0 repeated of 2 groups, bundle …` a
- Validation gaps (gap): The `CHAT_MEMORY_DIR` fallback and its precedence are untested. Add a run with only `CHAT_MEMORY_DIR` set to a fixture copy, and assert the bundle names that fi
- Validation gaps (gap): `~/` expansion in the project map's Workspace cell is untested. Add a `projectMap` case with `` `~/w/site` `` and assert `workspace === join(homedir(), "w/site"

