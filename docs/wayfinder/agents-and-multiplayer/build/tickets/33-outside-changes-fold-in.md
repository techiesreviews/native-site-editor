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
  - It reads the new commit's snapshot and compares the two full trees. The commit's author (`/api/commit`) is read alongside but only names the chip. A failed read names it "Someone", and so does one still unanswered `AUTHOR_WAIT_MS` (1.5 s) after the fold began; it never holds the fold back past that (the settle matrix is written in `foldIn`).
  - It folds in place only when blobs changed and none were added, removed or changed mode; every changed file is `.html` or `.css`; there are at most 20 (one batch read); and no changed file's draft is a deletion, a move, a new file or bytes. Anything else, or a tree GitHub did not list whole, loads the branch again.
- For each changed file (`foldFile`):
  - With no draft and no open entry, only the base moves.
  - Otherwise the editor's draft store entry (opened from its record when only a record exists) is merged three ways (`mergeText`, Myers' diff): by line, then by word inside lines both sides changed against the text the draft started from. The non-clashing outside change goes in as someone else's change (origin `shared`, through `rebaseHistory`), so Lex's Undo still takes back only his own words. Then the base becomes GitHub's text and blob (`acceptBase`), and an open code pane compares against the new text from then on (`sourceMoved` in `src/components/source-editor.ts`), so no "GitHub changed since this draft started" bar shows.
  - On a true clash (the same words changed on both sides; different words of one line both stay), GitHub's words then replace Lex's as one Undo step of their own, labelled "<author>'s change", in the page's history. One Undo brings Lex's words back and leaves the rest of the commit.
- After the files: GitHub's texts become the runtime's base (`adoptSaved`), so the preview updates in place. The snapshot is adopted with its head, and the revision, tree and text index follow (the save's `adopt` and `showSaved`, now named functions in the host). No message, no reload.
- The author's chip: each changed page gets `agentPresence.visit` (`src/agent-presence.ts`) for 2.6 seconds. The changed element (`changedNode`, the deepest element holding the change) gets an outline and a chip "<author> · GitHub" on the page shown, and a dot on its row elsewhere. It is not an agent: it is never listed, never stopped, and offers no Undo. The frame holds the mark, then fades it out (`fade`, through `src/components/native-preview.ts` and `src/components/preview-protocol.ts` to `src/components/native-preview-runtime.js`). With reduced motion it stays still, then goes.
  - `fade` carries each visit's own number, so a second push to the same page within 2.6 seconds fades in again from the start, rather than staying at the first fade's end.
  - The fade's 2600 ms and `OUTSIDE_MARK_MS` name each other in comments.
  - Each page's text after the fold is read once every layer took the change (after `adoptSaved`). So a page with no open pane and no draft (a stylesheet open beside the page, say) still gets its outline and chip.
- The drafts are read again after the files' read. A page deleted or moved meanwhile loads the branch again rather than merging into a deletion.
- A draft that exists only on record is opened in the editor's store to merge, and stays open there on purpose: its Undo step needs it.
- `/api/commit` (`worker/history.ts` `commitFiles`) now also returns `author`: the GitHub login, else the commit's author name, at most 60 characters. Without it the chip says "Someone · GitHub".
- Live room: the change enters the open shared copy as one more participant (`takeOutside`, `src/live-text.ts`). GitHub's word changes from the copy's starting text go in as one Yjs update, under a client id fixed by the file, the copy's starting version and the new blob. So every tab, and every commit that makes the same move, writes the very same items, and the room keeps them once, whichever tab folds first. A tab that has not folded yet receives the change through the room. The room and its copy go on and the drafts follow the copy.
  - On a clash the folding tab takes Lex's words back in its draft only, then records "<author>'s change", which moves the copy from what it holds straight to the latest. One Undo on that tab brings Lex's words back on every tab.
  - Only when no copy is caught up, or the copy began from older text (a save during the share), does the fold merge into the draft itself and the share start again from the new text (a `base` event to another blob).
- `src/controllers/save-publish-controller.ts`: a fold that fails loads the branch again only while the head check's load still holds.
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
- `kit shots --spec` (a raw scenario on the real starter, `.scratch/outside-fold-shots.spec.ts`): 12 shots, all passed, out `.scratch/shots/fleet-lead/20261109-135659/` in the main checkout, contact sheet `contact.webp` there. The three states are:
  - the chip after a push with no drafts;
  - Lex's unsaved heading merged with Sam's paragraph;
  - a clash showing Sam's heading.

  Each state was shot at 390 and 1280, light and dark.

**Fix round (review findings).**

- `tests/outside-merge.test.ts`:
  - the chip's node on a page with no draft and no open pane;
  - a `forEachAwait` test: the workspace moving on at each of foldIn's 3 awaits adopts, visits and writes nothing, and a page deleted during the read loads the branch again.
- `tests/history.test.ts`: `commitFiles`'s author: login first, else the commit's name; blank names dropped; cut to 60 characters.
- `tests/live-text.test.ts`:
  - an `acceptBase` with the same blob does not restart the share;
  - (rewritten in round 2) an outside change folded on two tabs enters the copy once, in the same room;
  - a tab that types before folding, after the other tab folded, keeps one heading and the same text;
  - a clash on both tabs shows Sam's words, and one Undo on one tab brings Lex's back on both, once.
- `tests/agent-presence.test.ts`: a visit shows its author for its hold, is never listed as an agent, a second visit to the page carries a new `fade` number, and a new load drops it.
- `tests/native-save/native-outside-fold-live.spec.ts` (new): two browsers share the page with the same unsaved heading. Sam's commit to another line folds in on both, both end with the same merged text, and a change after the fold reaches the other tab, nothing doubled.
- Checks after the fixes:
  - `RESULT: ok doctor 11/11 checks passed; warning: 5 setup pieces missing (run scripts/agents/kit init)`;
  - `RESULT: ok specs 2/2 passed` (`native-outside-fold.spec.ts`, `native-outside-fold-live.spec.ts`);
  - `RESULT: ok shots raw spec`.

**Fix round 2 (review findings).**

- Clashes are by word: `mergeText` merges lines both sides changed again by word (`splitWords`, the same Myers diff), so only the same words changed on both sides clash, and `mine` keeps Sam's changes to the other words of the line.
- Live room: the outside change enters the existing copy as a participant instead of restarting it (above).
- The author read no longer holds the fold back (above). A failed fold reloads only while its load holds (above). `OUTSIDE_COLOUR` names the chip's teal.
- Tests:
  - `tests/outside-merge.test.ts`: different words of one line both stay, including a page on one long line; in a clash, `mine` keeps Sam's other words; `wordChanges`; a changed mode and more than one batch of files load the branch again; the chip says "Someone" when the commit read fails or never answers, the fold not waiting past `AUTHOR_WAIT_MS`.
  - `tests/live-text.test.ts`: the three live-room cases above.
  - `tests/native-save/native-outside-fold.spec.ts`: with reduced motion the chip stays at full opacity through its hold, then goes; the author read failing or never answering still folds in, the chip naming "Someone".
  - `tests/native-save/native-outside-fold-live.spec.ts`: two browsers whose fake repositories make two commits with the same move take it once.

**UX review (Opus, contact sheet against the UX rulebook and mock-up 15).**

- F-repo-13 chip, no drafts: fine. A teal outline on the changed paragraph with "Sam · GitHub" on its corner, readable in light and dark at 390 and 1280 (L12). No toast, strip or message (S4); the page is not reloaded.
- F-repo-13 merged draft: fine. Lex's heading and Sam's paragraph both show, the Page structure row follows the new heading, Publish keeps its own state, and no conflict bar shows.
- F-repo-13 clash: fine. Sam's heading shows with the chip and Undo is enabled in the top bar. Publish shows no change, as the draft now equals GitHub's text until Undo (B10: one Undo brings Lex's words back, proven by the spec).
- Looks off (minor): the chip sits on the outline's top-left corner, flush against the line above. Mock-up 15 had it on the top-right with a 4 px outline gap. This is the shared agent-presence drawing that agents' chips already use (L11, an approved look), so it is left as it is and recorded as a follow-up.

Feature list: new entry F-repo-13 "Outside changes fold in"; F-repo-12's Good line now names the fold.

### UX follow-ups

- UX (looks off): F-repo-13 the outside author's chip uses the agents' chip placement: top-left corner, flush against the line above, no outline gap. Mock-up 15 showed it top-right with a 4 px gap. Changing it means changing the agents' approved look too, so it needs Lex's call (main checkout `.scratch/shots/fleet-lead/20261109-135659/contact.webp`).
- UX (looks off, older than this slice): F-canvas-14 a dark "Text changed" pop-up stays at the bottom after each edit and covers the code pane's lowest lines (HS1, S4, U5) (main checkout `.scratch/ux/fleet-lead/20261109-140456-vL7uFW/add-panel-F-canvas-14-390-light-live-strip.webp`). The toast is `src/announce.ts`, which this slice did not change.
- UX (looks off, older than this slice): F-publish-02 after a save, "Discard changes" is still shown (disabled) with nothing left to discard (B5), and an earlier "Paragraph added … Undo" toast sits over the format bar while publishing runs (HS1, S4, U5) (main checkout `.scratch/ux/fleet-lead/20261109-140456-vL7uFW/editor-F-publish-02-390-light-saved-strip.webp`). This is `src/components/publish-menu.ts` and `src/announce.ts`, which this slice did not change.
- F-repo-13 is shown "not shown" by `kit ux`: it has no Steps, as no scripted try can make a GitHub commit part way through. Its screens were shot with `kit shots --spec` and reviewed in Done.
