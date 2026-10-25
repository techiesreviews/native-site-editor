---
label: wayfinder:map
title: Detail pass
charted: 2026-10-25
tracker: local markdown (tickets live in tickets/ with a blocked_by line in each)
---

## Destination

A build plan of fix groups, each with a builder and its evidence, plus new UX rulebook lines so the details stay right. It sweeps three areas, each released as its own phase:

1. **The editor for Lex:** every screen and interaction, wording, motion, phone and laptop.
2. **The agents' experience:** what an agent sees and can do through the MCP, its instructions and errors, and how fast it gets things right.
3. **Building it (DX):** how easy the code, the kit and the docs make it for Lex editing by hand and for the agents that build the editor.

## Notes

- **Planning only.** Third in Lex's order of 2026-10-23, after [agents and multiplayer](../agents-and-multiplayer/map.md) and the [atomic catalogue](../atomic-catalogue/map.md).
- **Gate:** the sweeps run after the catalogue build is released, because that build rebuilds most screens ([Wait for the catalogue build release](tickets/01-task-catalogue-released.md)).
- **Charting answers (Lex, 2026-10-25):**
  - all three areas, "we can release for each phase";
  - three sweeps: the acts-like-a-user checking tool across the feature list ([factory ticket 03](../software-factory/tickets/03-grill-checking-skill.md#resolution-2026-10-22); `kit ux`, factory build slice 42); agents doing real tasks through the MCP; Lex's own walk-through on laptop and iPhone;
  - findings grouped by shared cause so one builder takes a group (factory ticket 06, `triage`);
  - the destination above.
- **Lex as a hand editor (2026-10-25):** "I have front end knowledge, HTML, CSS and JS, my TS and react is rusty". The editor has no React. Catalogue parts are small TypeScript functions with one plain CSS file per part (atomic catalogue ticket 11), so most look changes are plain CSS. DX is judged partly by whether Lex can change a part's look by hand.
- **DX friction seen so far** (input for the DX sweep):
  - `kit deps add` writes the root `package.json` even for a self-contained prototype folder;
  - the guard hook blocks wrapping `scripts/agents/port.sh` in `timeout` or a pipe;
  - `kit shots` only knows the editor's named screens;
  - `tickets.mjs check` output changed without a note.

  All from the agents-map proof of concept, ticket 12.
- **UX rules:** [UX rulebook](../../agents/ux-rulebook.md); no toasts, feedback in place.
- **Skills:** `grilling` with `domain-modeling`; `research` for the agent and DX sweeps; `triage` for grouping.
- **To find takeable tickets:** `node scripts/agents/tickets.mjs frontier detail-pass`.

## Decisions so far

<!-- one line per closed ticket: [title](tickets/file.md): gist -->

## Not yet specified

- **The quality bar per phase:** what "done" means for each release, and how it moves Lex up the UX confidence ladder (kitchen.md).
- **Phone-first details:** which screens Lex uses on the iPhone most, so the sweep weighs them.
- **Agent sweep tasks:** which real tasks agents try (a new page, a Media batch, a component change, a multi-agent job); sharpens once stage 1 of the agents build ships.

## Out of scope

- **New features:** site quality (map 4), site structure (map 5) and styling (map 6). The detail pass fixes what exists.
