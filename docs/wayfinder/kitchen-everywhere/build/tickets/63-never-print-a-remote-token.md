---
title: "The kit never prints a token from a remote's URL (follow-up on 62)"
type: task (AFK)
status: open
assignee: ke-63
builder: claude
blocked_by: [62-kit-pr-picks-the-origin-repo]
---

## Goal

Ticket 62's waived review left one finding to fix first ([ticket 62 Follow-ups](62-kit-pr-picks-the-origin-repo.md#follow-ups)): when `origin` is not on GitHub and its URL carries a username, password or token (`https://user:token@host/…`), `kit pr` and `kit doctor` print that URL in full, token included, in their messages and logs (and logs sit in `.scratch`, which reviews and reports read).

## Decided behaviour

- Every kit message, log line and report that shows a remote URL shows it without the user-info part (`https://host/…`), everywhere in the kit, not only in `kit pr` and `doctor`.
- A test with a token-bearing remote proves no command's output or log contains the token.

## Files

- In the kit repo (`~/Projects/agent-kit`): the shared remote/`gh` helper from ticket 62, `kit.d/pr`, `kit.d/doctor`, and any other command that prints a remote; their tests.

## Done when

- The token test fails before the fix and passes after; `kit doctor` and `kit pr --dry-run` on such a repo show the host only.
- Lands through the kit repo's own `kit pr`; the update timer brings it to the editor.

## Kit commands and evidence

In `~/Projects/agent-kit`: `kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines.
