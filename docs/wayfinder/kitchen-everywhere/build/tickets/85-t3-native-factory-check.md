---
title: "Check which factory parts run natively in T3 Code (agents as T3 threads, wake-ups, PR watch, schedules) before ticket 84 is built"
type: research (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

Lex (2026-10-31): "I would like to utilize t3 code native way for subagents etc, so check what part of the factory could be run with that tool." This is checked before 84 (the factory) is built, so 84 builds only what T3 doesn't already do.

## What the lead already found (2026-10-31, `orchestrator_capabilities` and the T3 tool list)

- **T3 starts agents itself:** `delegate_task` makes a child thread, in its own worktree if asked. It can use Claude (Opus, Sonnet, Haiku, Fable), Codex, Grok (4.5 to 4.7) and OpenCode's free DeepSeek. Each child is visible in T3, survives an app restart, and settles when its work is merged.
- **T3 wakes the parent when a child finishes** ("Completion wakes this thread"). So for agent work, nobody has to wait in a loop: the problem behind ticket 79 does not exist there.
- **Other native pieces:**
  - `watch_pull_request` wakes a thread on failed or passed checks, comments or conflicts;
  - `schedule_task` runs a prompt at a set time or interval, or from a webhook;
  - `request_secret` handles secrets;
  - pin, settle and snooze make a board;
  - `html_render` and the preview tools show things to Lex.
- **Not native:** a long shell job such as a test suite. T3 has `t3_background_wait` (keeps a Claude thread "working") but no tracked shell-job runner that wakes a thread after its turn ended. Today's slices run their build, review and fix agents as headless `claude -p` processes inside `kit slice` (`agent-run.mjs`), which T3 can't see.
- **The kit must keep working outside T3** (GitHub CI, Codex CLI, another computer). So rules, briefs, checks, guards, `kit pr`'s merge gate, `release-check` and Playwright checks stay in the kit.

## Questions to answer by trying, not guessing

1. **Grandchildren:** can a slice runner child (told to in its brief) start its build, review and fix steps as T3 child threads, be woken when each finishes, and keep within the ~3-slices budget? Compare cost, time and reliability with `kit slice`'s headless runs on one real small ticket.
2. **Shell jobs:** does a Claude child's `run_in_background` Bash command survive its turn end inside T3 (T3 turns run in their own systemd scope) and wake the child when it exits? If yes, `kit go` can lean on it; if no, `kit go`'s 9-minute loop stays.
3. **Second look as a T3 thread:** does a Grok or OpenCode child started by `delegate_task` start and finish more reliably than the kit's CLI wrappers (OpenCode "didn't start within 300 s" several times on 2026-10-30/31)? Grok's weekly count still applies.
4. **Triggering T3 from the kit:** can `kit` (a script) start a T3 run through a `schedule_task` webhook, so `kit slice --runner t3` could hand stages to T3 when it is present and fall back to headless runs when it isn't? Is that safe (the webhook URL is a secret)?
5. **Cost visibility:** can T3 report a child's token use and cost per thread, for ticket 83's talk-style trial?

## Decided behaviour

- Each question gets a small real trial with its evidence (thread links, timings, logs) and a verdict: use T3, keep the kit, or both with a fallback.
- The result is one table in this ticket, "factory part → runs in T3 / stays in the kit / both", plus the changes it makes to ticket 84's plan, written into 84 before 84 is claimed.
- Nothing in the kit or any project changes in this ticket. Trials use throwaway worktrees and branches, which are deleted afterwards.

## Done when

- Five questions answered with evidence; the table is written; ticket 84's Decided behaviour is updated (lead approves the change, since 84 was asked for by Lex).
- A two-line plain summary for Lex.

## Kit commands and evidence

Agent Kit is required for any commit: `scripts/agents/kit doctor`; the ticket's Done lands on `dev` with `scripts/agents/kit pr` (docs tier).
