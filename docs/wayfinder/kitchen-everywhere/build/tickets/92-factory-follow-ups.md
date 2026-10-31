---
title: "Factory follow-ups from ticket 84's reviews and rollout: stop-guard's count, pins in one place, model families, the talk-style lock, task slugs, the launcher's warnings"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [84-factory-brief-and-go]
---

## Goal

Ticket 84 (agent-kit #14 and #16) landed with the lead's waiver for P2/P3 review notes after nine and four Claude review rounds. These are those notes, plus what the `kit init --all` rollout showed.

## Decided behaviour

- **stop-guard's count:** the refusal count is kept per set of running jobs, so "six refusals in a row" really means "since the set of jobs last changed". Either reset it when the session does other work between two stop attempts (a refusal more than a few minutes old starts again at one), or say exactly that in the hook's header, the README and the rulebook.
- **Pins in one place:** `brief-lib.mjs` repeats the second-look models that `second-look.json` holds; `reviewBrief` defaults to the fixed name `claude-opus-5-5` instead of the rulebook's review pin (`kitRulebookPins`). Both read the one source.
- **Model families:** `modelFamily` treats any name containing "claude" as Claude, so an `opencode/claude-…` model would be told to run `/skill` commands it cannot load: `opencode/…` and `grok…` are always "none".
- **The talk-style lock:** two starts can both take over the same stale lock (stat, then remove). Take it over by renaming to a unique name and checking the renamed file is still old.
- **Task slugs:** two `kit brief --task` titles that share their first 60 characters get one slug, so one branch and job; add a short hash of the whole title.
- **agent-cap's matcher check** reads a hook matcher as a jq regex; a matcher that is not a valid regex fails the check quietly (it then counts the launch, the safe side). Match the way Claude Code matches tool names.
- **The ui set's words** (buttons, forms, dialogs, menus, popovers, added for `--task`) also change the picks for ticket briefs; pin that with tests, or use them only for a task's note.
- **The hook launcher without a kit** (`launcher/hooks-run.sh`): its warning now shows at the end of every turn (stop-guard) and twice on an Agent call (agent-cap and brief-guard), and its usage comment lists four hooks. Keep "never quiet", but say it once per session for Stop and PreToolUse, and list every hook name.
- **The editor's hook entries:** `kit init --all` again, so the Native Site Editor gets brief-guard and stop-guard (its full suite's `tests/agent-port.test.ts` hung twice under `kit go` on 2026-10-31: "port skips a listener on slot port + 1"; find why first).
- **Planned in the rulebook, not built:** `kit ux` and a release brief do not use the skills map yet.
- **Tests the reviews asked for:** `kit next --start`'s kit go mark with a real job folder; `kit review` without a ticket picking skills from the diff, run end to end; the build contract's plain fallback when the counter cannot be moved; the doctor line for a `skills.remove` that removes every name; a time-limit case whose job ignores SIGTERM.

## Files

In the kit repo (`~/Projects/agent-kit`, through its own `kit pr`): `hooks/stop-guard.mjs`, `hooks/agent-cap.sh`, `brief-lib.mjs`, `review-brief.mjs`, `skills.mjs`, `skills.json`, `kit.d/brief`, `launcher/hooks-run.sh`, `README.md`, `docs/kitchen.md`, `tests/`.

## Done when

- Tests, failing first, for each behaviour above.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA.
