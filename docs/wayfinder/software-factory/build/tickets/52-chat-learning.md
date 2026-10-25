---
title: Chat learning every other Monday, from the central corrections list
type: task (AFK)
status: open
assignee: sf-52 (this session)
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
