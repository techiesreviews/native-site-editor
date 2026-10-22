---
title: "Agents know where Lex is working and wait for that part"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [51-one-agent-command-path, 32-one-overlay-for-agents-and-media]
---

## Goal

Rides with candidates #2 and #4. An agent reading the site learns where Lex is working; an agent change to that exact part waits until he clicks away, instead of landing under his cursor.

## Decided behaviour

[Ticket 05, item 3](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22) and its round 3 comment: agents see exactly the preview, unsaved typing included (slice 32), **are told where Lex is working, and a change to that exact part waits until he clicks away.** Real multiplayer (both typing in one part at once) is its own feature after the clean-up.

Lead decisions:

- "Where Lex is working" is the element he is typing in on the page or in a Page Structure field, or the file he is typing in in the code pane (with its range). It is cleared when he clicks elsewhere, leaves the field, or stops typing for a while (builder proposes the pause, about 5 s, in `decide`).
- `get_site`, `get_page` and `get_selection` carry it as one plain field (page, element path, or file), with a note that a change there will wait.
- An edit whose target overlaps that part answers at once with a waiting state ("Lex is editing this part; the change lands when he clicks away") and a request id; `get_command_status` then reports it applied (or refused, if the part changed under it). There is no time limit. If Lex switches site meanwhile, the change lands there as an unsaved change (ticket 05, item 2; slice 23).
- An edit to any other part lands at once, as today.

## Files

- `src/agent-tools-edit.ts`, `src/agent-site.ts`, `src/agent-records.ts` (a waiting receipt state), `shared/agent-read.ts`, `shared/agent.ts`, `shared/agent-tool-table.ts`, `worker/mcp.ts` (result text only)
- Where typing is known: `src/components/source-editor.ts`, `src/components/structure-editing.ts`, the preview selection controller (`src/controllers/preview-selection-controller.ts`); `src/main.ts` wiring only
- `src/agent-prompts.ts` (one sentence telling agents to expect the waiting state)
- Tests: unit tests for the overlap rule and the waiting receipt; new `tests/native-save/native-agent-waits.spec.ts` (Lex types in a heading, an agent edits that heading: waiting; Lex clicks away: applied; an agent edit elsewhere: applied at once)
- `tests/main-ts-ceiling.test.ts` if `main.ts` changes

## Acceptance checks

- The spec above, plus a switch-site case: the waiting change lands on its own site as an unsaved change.
- Receipts: a duplicate of a waiting command joins it, never applies twice.
- `kit size` at or under 355 KB; `npm run check`, `npm test`, `kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Last slice of the #4 gate.

- `kit doctor`; `kit bg slice-52 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/52-agents-wait-for-lex.md --builder claude-opus-5-5`; `kit wait job slice-52 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected` plus `kit specs native-agent-waits.spec.ts native-agent-edits.spec.ts`, `kit size`.
- `kit shots` only if a visible cue is added (none is planned).
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only); an Opus 5.5 UX review of the agent wording on request. Land: `kit pr --ticket <this ticket>`.
- Report: the field and waiting wording as landed, unit and specs `RESULT:` lines, `kit size` KB, review folder and decisions, PR and merge SHA, `main.ts` lines and ceiling.
