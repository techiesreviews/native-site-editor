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

- Who changed each file is kept in the browser (`src/save-authors.ts` `saveAuthors`): by draft key, in IndexedDB, so a reload or a new sign-in still names them. Every change reads the file's names again before writing, so this browser's tabs, which share the drafts, share the names too. Each name is kept with the blob the draft began from; names noted over another version (someone saved the file, in this tab or another) are not the draft's.
- Others' text in the shared copy (`src/live-text.ts`) is matched by Yjs client id to the names presence gives: a tab's own id, the id its draft's changes first entered under (now told in presence as `start`), and the agents a tab wrote for. Only clients whose clock an update moves on are noted, so a catch-up repeating text the copy holds (a join, a reconnect, a new room key) names no one again; and the sender of another tab's own change that changed the text, so someone whose only change is a deletion (which adds no text of its own) is named. An agent writing into this tab's drafts (`writeAs`), a deletion too, is noted whether live sharing is on or off. A file whose draft goes, or is back to its saved text, has no names.
- Save to GitHub (`src/components/publish-menu.ts`) sends `authors`: everyone noted for the saved files over the versions they began from, except the account saving, who is the commit's author. After the save, only the names it sent and not noted again since go; names noted while it was on its way count over the saved blob, for the next commit. `worker/publish.ts` validates them (at most 50; one line, at most 80 characters; an optional plain address) and `commitMessage` adds "Changes by anna and Claude Code (agent)." for authors without an address and `Co-authored-by: Name <address>` lines for those with one. Presence names are what each participant says of itself, so the editor sends no address: everyone is named in the message. The first save to an empty repository names in each of its two commits only the authors of the files that commit holds.
- The save controller forgets the names of drafts it drops outside the editor's store (Discard, Discard draft of a file GitHub deleted, drafts found to be GitHub's version) through its `forgetAuthors` port.
- Tests: `tests/publish.test.ts` "two authors' changes saved by one person become one commit naming both", the empty-repository message, and the validation rules; `tests/live-text.test.ts` a person and an agent named by the other tab, a joiner's catch-up after a save naming no one again, a person whose only change is a deletion, and an agent's edit and deletion named with live sharing off; `tests/save-authors.test.ts` names kept across a reload, a save settling only what it sent, names over another version left out, two tabs of one browser not undoing each other's notes or settles; `tests/save-publish-controller.test.ts` the forget port; `tests/native-save/native-save-authors.spec.ts` the Publish menu sending an agent and another person but not the one saving, no `authors` on the next save, and an empty repository's two first commits each naming only their own files' authors.
- Feature list: F-publish-07. Code map: Save to GitHub rows name `src/save-authors.ts` and `commitMessage`.

### UX follow-ups

- UX (looks off): F-publish-02 Publish works, and "Publishing…" changes to "Saved" on the button with a "View commit" link inside the menu; but while it publishes, a dark "Paragraph added… Undo" strip sits at the bottom of the screen and covers the format bar at 390 px (S4, HS1, U5) (.scratch/ux/fleet-lead/20261108-175114-y3QVsU/editor-F-publish-02-390-light-saved-strip.webp)
- UX (looks off): F-publish-05 every change is discarded and the button goes back to Publish, but a "Discarded 1 unsaved change." strip then shows across the bottom of the page, in light and dark (S4, HS1) (.scratch/ux/fleet-lead/20261108-175114-y3QVsU/editor-F-publish-05-390-dark-discarded-strip.webp)
- UX (looks off): F-publish-06 the one file goes back to its saved version, but a dark strip saying the file's changes were discarded then sits over the code pane at 1280 px (S4, HS1, U5) (.scratch/ux/fleet-lead/20261108-175114-y3QVsU/editor-F-publish-06-1280-light-discarded-strip.webp)
