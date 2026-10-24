---
title: "Agents know where Lex is working and wait for that part"
type: task (AFK)
status: closed
assignee: lead-52
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

## Done when

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

## Comments

- 2026-10-22, Lex: yes to the immediate "waiting" answer without a time limit, **as the stand-in until multiplayer** (both editing at once, like Google Docs) is built as its own feature after the clean-up. Keep the waiting code easy to replace.

## Done (2026-10-24)

Agents are told where Lex is typing, and a change of theirs to that part waits until he leaves it; any other change lands at once, as before.

- **Where Lex works** is one small module, `src/working-part.ts` (`workingPart`): the element he types in on the page (the preview frame now says `typing`, at most once a second, and when it is left, after that element's text edit; `src/components/native-preview-runtime.js`, `preview-protocol.ts`, `native-preview.ts`, wired in `src/main.ts`), in a Page Structure row field (`src/components/structure-editing.ts`; `RowText` carries its element's `node`, set in `page-structure.ts`), or the lines he types in in the code pane (`src/components/source-editor.ts`, from the store's typing events; closing the pane leaves them). It is left when he leaves that part (clicks elsewhere on the page, leaves the field) or after a **5 s pause in typing** (decided: `WORK_PAUSE_MS`); on the page, once his typing there is written. The code pane has no blur signal here, so its lines are left by the pause or by closing the pane.
- **The field**: `get_site` (`editor.userEditing`), `get_page` (`userEditing`, for its own file) and `get_selection` (`userEditing`) carry `{ file, route?, element?, tag?, lines?, note }` or `null`; the note says "The user is typing here. A change to this part answers waiting and lands when they click away."
- **The overlap rule** (`src/agent-site.ts` `changesWork`): same file and stretches that meet. A text write's change (its minimal edit; an insertion read at its leftmost equal place), a section removed or moved and a component made (the named element), page details (the `<head>`), or a move or removal of the file or a folder above it. Creating files or pages, adding a section between sections and reads never wait. Elements are read with the string source tree, as agent presence reads them.
- **Waiting** (`src/agent-tools-edit.ts`): an edit that meets the part answers at once `{ requestId, state: "waiting", message: "The user is editing this part; the change lands when they click away. get_command_status says when it applied; do not send it again." }` and goes on without the call (no socket, signal or deadline; ownership and authorization are still proved at its commit). No time limit. A duplicate with the same id and work joins it (waiting, then its outcome); `get_command_status` says waiting, then applied. Once let go, an `edit_file` is made again on the text now (so it lands on what Lex typed meanwhile) and is refused (`conflict`, "The user changed … where this change goes while it waited") when its replaced text changed; a whole `write_file` is refused if the file changed; other commands keep their own proofs. A refusal after waiting is kept in this tab (the latest 100) for its status and duplicates. If Lex switches site meanwhile, the change lands on its own site as an unsaved change (ticket 23's path), not re-made on the site shown.
- Wording: `get_command_status`'s MCP description names waiting (`worker/mcp.ts`); the connection prompt has one sentence on it (`src/agent-prompts.ts`).
- Tests: `tests/agent-site.test.ts` (the overlap rule case by case, and the field), `tests/agent-tools-edit.test.ts` (waiting, a duplicate joining, status, an edit elsewhere at once, landing once on Lex's typing, refusal kept, a whole write refused, landing when the workspace is no longer shown, the pause and leaving rules), `tests/preview-protocol.test.ts` (the `typing` message), `tests/agent-tool-table.test.ts` (tools/list fingerprint updated for the new description), new `tests/native-save/native-agent-waits.spec.ts` (Lex types in the heading: told, waiting, duplicate joins, an edit elsewhere applied at once; he clicks away: applied once on his typing; switch-site case: lands on main as an unsaved change, applied on return), and `tests/native-save/native-agent-reads.spec.ts` (its edit of lines just typed in the code pane now waits for the pause, then applies).
- `src/main.ts` stays at 3109 lines (ceiling 3110): two wiring lines and an import, with three leftover blank lines removed. `kit size`: boot 352 KB (±0), budget 355 KB.
- Left for later: a waiting change lives in the receiving tab's memory, so a reload or closed tab drops it (status then says unknown); the code pane's lines wait out the pause even after Lex clicks elsewhere in the editor (no blur from Monaco here); Page Structure's page-details fields are not tracked; Media commands never wait.
