---
label: wayfinder:map
title: The kitchen in every project
charted: 2026-10-25
tracker: local markdown (tickets live in tickets/ with a blocked_by line in each)
---

## Destination

A decided and ticketed plan for running every one of Lex's code projects the way this editor runs: the same Agent Kit commands, hooks, rulebook and ticket maps, with only each project's own checks written per project, and a fix to the kit reaching every project without hand copying. Destination of the software-factory map ("proven here first, then copied as the template for Lex's other projects", Lex, 2026-10-22, F1).

## Notes

- **Source:** [Copying the kitchen to Lex's other projects](../software-factory/research/70-copy-the-kitchen.md) (2026-10-25): which kit commands are neutral and which are the editor's own, what each assumes, Lex's projects today, and three ways compared.
- **Recommended way:** one shared kit that every project pulls, with a small `kit init` to set a project up; a version pinned per project and updated on purpose. Ticket 01 asks Lex.
- **Why now:** `chat`, `techies-playground` and `techies-reviews` already run hand copies from about 2026-10-17 that missed 127 kit commits; none has the hooks, `slice`, `pr`, `next` or the rulebook.
- **Planning only.** No build tickets until Lex has answered the grilling tickets; the build plan is handed off at the end, like [the factory's](../software-factory/tickets/08-handoff-plan.md).
- **Lex is the head chef:** ask in plain words with file pointers and a recommended answer. `lex-coding` and Agent Kit (`scripts/agents/kit`) apply to every coding step; this repo stays the kit's first user, so the editor's own commands (`shots`, `specs`, `size`, `preview`, `ux` tries) keep working the same.
- **To find takeable tickets:** `node scripts/agents/tickets.mjs frontier kitchen-everywhere`. Claim by filling in `assignee:` and pushing before work.

## Decisions so far

<!-- one line per closed ticket: [title](tickets/file.md): gist -->

## Not yet specified

- Whether the scoreboard and feedback logs stay per project or also roll up into one view across projects (asked in [ticket 05](tickets/05-grill-rollout.md)).
- Whether Lex's static sites (`native-site-editor-starter`, `lexvd-site`, `dogsfitandfun`, `techies-reviews`) want the full kitchen or only `review`, `pr` and the hooks (asked in [ticket 05](tickets/05-grill-rollout.md)).
- How the `lex-coding` skill's kit section changes once the shared kit exists (today it points agents at this repo's `origin/dev`; asked in [ticket 05](tickets/05-grill-rollout.md)).

## Out of scope

- Copying anything before Lex's answers; this map plans only.
- Changing the editor's own commands beyond reading their values from the project settings file.
- Projects that are not code (the chat memory itself is only read by `card` and `learn`).
