---
title: "Saving with several editors"
type: task (AFK)
status: closed
assignee: fleet-lead
builder: claude
blocked_by: [21-shared-copy-per-file]
---

## Goal

Save to GitHub with shared changes.

## Decided behaviour

[ADR 0003](../../../../adr/0003-shared-editing-over-a-store-nothing-relay.md) decision 6 and [ticket 08](../../tickets/08-grill-shared-editing-mechanism.md#resolution-2026-10-24):

- Whoever presses Save to GitHub saves everyone's changes in those files.
- The commit names every author (people and agents), as `Co-authored-by` lines where an address is known, otherwise by name in the message.

## Files

Expected (confirm while designing): `src/controllers/save-publish-controller.ts`, `worker/publish.ts`, `src/live-text.ts` (authors per file); tests.

## Done when

- A test: two authors' changes saved by one person become one commit naming both.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-26 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-26 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.

## Done (2026-11-08)

- Who changed each file is noted in the saving tab (`src/save-authors.ts`, by draft key, this tab's memory only). Others' text reaching the shared copy (`src/live-text.ts`) is matched by the Yjs client ids it carries to the names the room's presence gives: a tab's own id, the id its draft's changes first entered under (now told in presence as `start`), and the agents a tab wrote for. An agent writing into this tab's drafts (`writeAs`) is noted whether live sharing is on or off.
- Save to GitHub (`src/components/publish-menu.ts`) sends `authors` with the files: everyone noted for them except the account saving, who is the commit's author. `worker/publish.ts` validates them (at most 50; a name on one line, at most 80 characters; an optional plain address) and `commitMessage` adds, after what the commit does, "Changes by anna and Claude Code (agent)." for authors without an address and `Co-authored-by: Name <address>` lines for those with one. Presence names are what each participant says of itself, so the editor sends no address yet: everyone is named in the message. The first save to an empty repository names them too.
- A save forgets the authors of the files it saved, and a discard those of the files it discarded (`src/controllers/save-publish-controller.ts`), so the next commit names only later authors.
- Tests: `tests/publish.test.ts` "two authors' changes saved by one person become one commit naming both" (one commit, message naming a person and an agent) and the message and validation rules; `tests/live-text.test.ts` two tabs and an agent written by one of them, the other tab naming both and the message built from them, and an agent named with live sharing off; `tests/save-publish-controller.test.ts` a save or discard forgets the names.
- Feature list: F-publish-07 added. Code map: Save to GitHub rows name `src/save-authors.ts` and `commitMessage`.
- Validation: `RESULT: ok unit 4012/4012 (260 files)` (kit unit --affected), `RESULT: ok specs none affected` (kit specs --affected), `npm run check` and `npm run lint` passed.

