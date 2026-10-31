---
title: "Kit commits never borrow another person's name; a repo without a git identity gets the machine's kit identity"
type: task (AFK)
status: open
assignee:
builder: opencode/deepseek-v4.1-flash-free
blocked_by: []
---

## Goal

Ticket 81 (agent-kit #12) made `kit init --all` borrow the git name and email of the last commit on a project's branch when the project has no git identity set (camframe, chat). This fails two ways:
- **It can put a commit under someone else's name.** A bot, or another person.
- **It can pick a bad address.** In `chat` it picked `lex@users.noreply.github.com`, the address GitHub credits to a stranger (github.com/lex), which Lex had fixed on 2026-10-29. Three chat commits (`2092d8d`, `5b5377e`, `7c3f5d0`) now carry it; chat is private.

The lead set `user.name Lex` / `user.email 260122098+techiesreviews@users.noreply.github.com` locally in camframe, chat and TechiesTools on 2026-10-31.

## Decided behaviour

- **No borrowing.** The kit never takes a name from an earlier commit.
- **Missing identity.** When a repo has no `user.name`/`user.email`, kit commands that commit use the machine's kit identity (`identity` in the kit's state folder settings, set once). If that isn't set either, they stop with a line naming the command to set it.
- **Bad address.** `kit doctor` warns, and kit commits refuse, when the identity's email is `lex@users.noreply.github.com` (a list in the kit: addresses that GitHub credits to someone else).
- **Rule line:** commits by agents use the project's or the machine's set identity, never a borrowed one.

## Files

In the kit repo: `kit.d/init` (drop the borrowing), `kit-lib.mjs` (identity helper), `kit.d/doctor`, tests.

## Done when

- Tests, failing first:
  - no repo identity plus a kit identity: the kit identity is used;
  - neither set: it stops with the line;
  - the bad address is refused;
  - nothing is borrowed from the last commit.
- agent-kit's `npm test` and `npm run lint` pass.

## Kit commands and evidence

`kit doctor`, `kit unit --affected`, `kit review`, `kit pr` in `~/Projects/agent-kit`; report the RESULT lines.

## Comments

- Lead, 2026-10-31: also here, same kind of small fix. ke-88 found that `kit pr --waive` let a ticket-level **P1** through on PR #289; the rule is that only P2/P3 may be waived after three rounds. `--waive` must refuse while any P0/P1 is open and name it on the RESULT line. Add a test.
