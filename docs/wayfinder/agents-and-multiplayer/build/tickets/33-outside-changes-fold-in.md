---
title: "Outside changes fold in"
type: task (AFK)
status: closed
assignee: fleet-lead
builder: claude
blocked_by: [32-github-push-to-tabs]
---

## Goal

What Lex sees when a page changes outside the editor.

## Decided behaviour

[Ticket 09, items 1 and 2](../../tickets/09-grill-outside-changes-live.md#resolution-2026-10-24):

- With no unsaved changes, the page updates in place with a brief outline and an author chip that fades, and no message.
- With unsaved changes, a three-way merge against each draft's starting text; different lines merge by themselves.
- On a true clash the latest version shows, and Lex's clashing words stay one Undo away.
- In a live room, the outside change enters as one more participant.
- Mock-up approved by Lex (2026-10-27): [15-outside-changes-and-preview-link.html](../../prototypes/15-outside-changes-and-preview-link.html)

## Files

Expected (confirm while designing): a new `src/outside-merge.ts`, `src/draft-store.ts`, `src/live-text.ts`, `src/agent-presence.ts` (the author chip), `src/guarded-edit/commit.ts`; unit tests for the merge and a spec.

## Done when

- Specs: a push to an open page with no drafts updates it with the chip; a push touching other lines merges into drafts; a clash shows the latest and one Undo brings back Lex's words.

## Lead notes (2026-11-09)

- **Boot budget:** the editor's boot is at 362 of its 355 KiB budget's 363,520 bytes (about 1.1 KiB left after slice 32). Keep the merge (`src/outside-merge.ts`) and the author chip's code out of the boot: load them when an outside change first arrives (a dynamic import, as Share to edit and Share preview do, `src/shares-later.ts`). `kit size` must pass.
- Outside changes come from slice 32's push notice (the tab checks the branch head and reloads) and from the focus check; both end in the same snapshot reload.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-33 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-33 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).

## Done (2026-11-09)

**Behaviour.**

- When the branch head check finds a new commit (the push notice of am-32, the focus check, a refused save), `src/controllers/save-publish-controller.ts` `checkHead` first asks its new `foldIn` port to fold the commit in place. Only when the fold says it cannot, or fails, does the branch load again as before.
- `src/outside-merge.ts` (loaded on first use from `src/pages-and-files-host.ts`, never at boot) does the fold:
  - It reads the new commit's snapshot and the commit's author (`/api/commit`, in parallel) and compares the two full trees.
  - It folds in place only when blobs changed and none were added, removed or changed mode; every changed file is `.html` or `.css`; there are at most 20 (one batch read); and no changed file's draft is a deletion, a move, a new file or bytes. Anything else, or a tree GitHub did not list whole, loads the branch again.
- For each changed file (`foldFile`):
  - With no draft and no open entry, only the base moves.
  - Otherwise the editor's draft store entry (opened from its record when only a record exists) is merged three ways by line (`mergeText`, Myers' diff) against the text the draft started from. The non-clashing outside change goes in as someone else's change (origin `shared`, through `rebaseHistory`), so Lex's Undo still takes back only his own words. Then the base becomes GitHub's text and blob (`acceptBase`), and an open code pane compares against the new text from then on (`sourceMoved` in `src/components/source-editor.ts`), so no "GitHub changed since this draft started" bar shows.
  - On a true clash (the same lines changed on both sides), GitHub's words then replace Lex's as one Undo step of their own, labelled "<author>'s change", in the page's history. One Undo brings Lex's words back and leaves the rest of the commit.
- After the files: GitHub's texts become the runtime's base (`adoptSaved`), so the preview updates in place. The snapshot is adopted with its head, and the revision, tree and text index follow (the save's `adopt` and `showSaved`, now named functions in the host). No message, no reload.
- The author's chip: each changed page gets `agentPresence.visit` (`src/agent-presence.ts`) for 2.6 seconds. The changed element (`changedNode`, the deepest element holding the change) gets an outline and a chip "<author> · GitHub" on the page shown, and a dot on its row elsewhere. It is not an agent: it is never listed, never stopped, and offers no Undo. The frame holds the mark, then fades it out (`fade`, through `src/components/native-preview.ts` and `src/components/preview-protocol.ts` to `src/components/native-preview-runtime.js`). With reduced motion it stays still, then goes.
- `/api/commit` (`worker/history.ts` `commitFiles`) now also returns `author`: the GitHub login, else the commit's author name, at most 60 characters. Without it the chip says "Someone · GitHub".
- Live room: when the shared file's base moves to another blob (a `base` event), `src/live-text.ts` ends the share and starts it again from the new text. Every tab of the room folds the same commit into the same draft, so their changes meet again in the new copy (same draft, same client id).
- Boot: `kit size` stays at 354 KB of 355 KB (±0 KB against dev).

**Tests.**

- `tests/outside-merge.test.ts` (new):
  - `mergeText`: different lines merge from either side, including adjacent lines; additions and removals on both sides; the same change on both sides taken once; a clash keeps GitHub's words in `text` and Lex's in `mine` while the rest merges; the trivial cases; a last line with no newline.
  - `changedNode`.
  - `foldFile`: a draft merges and Lex's Undo takes back only his heading; a clash shows the latest and one Undo brings back his words; a clean open file takes GitHub's text as base with no change; a record-only draft opens and merges; an untouched file stays out of the store.
  - `foldIn`: a changed page folds with the chip; added files, an image change and a draft that is a deletion load the branch again; a workspace that moved on does nothing.
- `tests/save-publish-controller.test.ts`: the head check folds and does not reload; it reloads when the fold cannot or fails; the fold's `live` holds only while the load does.
- `tests/native-save/native-outside-fold.spec.ts` (new; the fake GitHub's `external-edit` takes an `author`, and its single-commit answer names it):
  - a push to the open page with no drafts updates it in place (the workspace content is never replaced) with the "Sam · GitHub" chip, which then goes;
  - a push touching another line merges into the draft, Lex's heading kept and no conflict bar;
  - a clash shows Sam's heading, and one Undo brings back Lex's while Sam's other line stays.
- `tests/native-save/native-save.spec.ts`: "a conflicting save" now expects the decided behaviour. After the refusal, GitHub's commit folds in, the latest heading shows, one Undo brings back the draft's words, and saving again goes through.

**Checks.**

- `RESULT: ok unit 4082/4082 (270 files)` (`scripts/agents/kit unit --affected`).
- `RESULT: ok specs 16/16 passed; 187 more run in kit pr` (`scripts/agents/kit specs --affected`).
- Also run: `native-push-notice`, `native-agent-presence`, `native-agent-chip-undo`, `native-several-agents` and `native-deleted-upstream` specs, all passed.
- `RESULT: ok size boot 354 KB (±0 KB) vs dev@998387d, budget 355 KB`.
- `npm run check` and `npm run lint` pass.
- `kit shots` not taken: no scripted try can make a GitHub commit part way through (F-repo-13 Steps); the spec covers the screens.

Feature list: new entry F-repo-13 "Outside changes fold in"; F-repo-12's Good line now names the fold.
