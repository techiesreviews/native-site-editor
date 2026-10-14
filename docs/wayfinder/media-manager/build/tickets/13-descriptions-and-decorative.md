---
title: Descriptions and Decorative
type: task (AFK)
status: closed
assignee: claude (mm-13 runner)
blocked_by: [05-media-records]
builder: sol
phase: 1
---

## What

Ticket [13](../../tickets/13-what-agents-may-do.md#resolution-2026-10-13) "Descriptions (alt text)".

- A file's **Description** is written once and used by every new place; a place can have its own words.
- Changing a file's description updates every place that uses it, except places with their own words (one Undo step).
- **Decorative** per file or per place writes `alt=""` and is remembered in `.editor/media.json`, since `alt=""` alone cannot tell the two apart.
- Old empty descriptions count as **not described yet** until marked Decorative; the gap shows on the file and the place. Today's alt warning fires only when `alt` is absent; extend it to empty, unmarked alt (`native-image-alt-refusal.spec.ts`).
- Text an agent writes carries the **by-agent** mark; it clears when Lex presses OK or edits it, and survives saving.

## Done when

- `tests/media-descriptions.test.ts`: description flows to places; own words kept; Decorative per file and per place; old `alt=""` reads as not described; the by-agent mark set, kept on save, cleared on OK or edit.
- `tests/media-markup-alt.test.ts` and `native-image-alt-refusal.spec.ts` updated and passing.

## Done (2026-10-14)

- **Behaviour.** A file's Description (`files[path].description`) seeds the picker's insertion alt for new places (a Decorative file gives `alt=""`; an undescribed file keeps the file-name fallback; replacing an image keeps the page's alt). Saving a changed description or file Decorative in the library sheet rewrites, in the same media batch (one Undo step), the `alt` of every `.html` place that uses it: places whose alt equals the old description, places with no alt, and empty places that are not Decorative. Places with their own words (non-empty alt different from the file's description) and Decorative places are kept; an emptied description never adds `alt=""` where none was written; un-marking Decorative leaves pages as they are. Decorative per place is remembered as `files[file].places[page].decorative` in `.editor/media.json`; the Edit bar gains a **Decorative** toggle that writes `alt=""` and the mark atomically (one Undo). An empty, unmarked alt now warns **Not described yet** (an absent alt still says **Alt text missing**); the library sheet shows "Not described yet" and a Decorative checkbox. By-agent: the file mark is `description.byAgent` (cleared by Lex's save or `confirmMediaDescription`); a place's mark is the agent's own words, `places[page].agentText`, shown only while the alt still equals them, so Lex's edit clears it in the same Undo step and Undo brings it back. Both survive saving.
- **Assumptions (★).** A place is "this file on this page": two uses of one file on one page share the Decorative mark (it matters only where an alt is empty). Plain HTML has no stable per-element identity, and position-based keys would move marks onto the wrong picture when images are added or moved. Own words are detected by text, so a place whose words equal the file description counts as using it.
- **Code.** New `src/page-builder/media-descriptions.ts` (pure rules: `fileDescriptionState`, `placeDescriptionState`, `newPlaceAlt`, `descriptionPlaceEdits`, `setMediaFileDecorative`, `setMediaPlaceDecorative`, `setMediaPlaceAgentText`, `confirmMediaDescription`); `shared/media-records.ts` validates and serializes `places`; `media-workspace.ts` metadata saves rewrite places; `media-controller.ts` `placeState`/`changePlace` (lazy, records never overwritten when unreadable); Edit bar in `page-structure-controller.ts`; `applyMediaBatch` refuses when the open page changed while loading.
- **Commits.** 39a651e1 claim; 6537d7cc build (Sol; runner moved the rules out of `shared/` because shared must not import `src/`, and fixed describing a Decorative file so its empty places are filled); 4acbd4b3 and a751b91c review fixes.
- **Tests.** New `tests/media-descriptions.test.ts`; updated `media-records`, `media-metadata`, `media-workspace`, `media-controller`, `media-markup-alt`; `native-image-alt-refusal.spec.ts` adds missing/empty-alt warnings, Decorative marking stored in the draft records, and one Undo. `npm run check`, `npm run lint`, unit suite green; browser `native-image-alt-refusal`, `native-images-tab`, `native-media-pane`, `native-media-library`, `native-media-transaction`, `native-upload`, `native-asset-references` green.
- **Review (GPT-6.1 Sol, two rounds).** Fixed 3: editing agent text took two Undo steps (now the mark is the text itself); a Decorative press could land in another page's history (page proof rechecked, also inside `applyMediaBatch`); history view entered during the records read. Rejected 3: per-occurrence marks, inheritance by text equality, and agent provenance by text equality (all need per-element identity that plain HTML lacks; see Assumptions).
- **Bytes.** First-paint budget 342 KB vs 344 KB measured on `origin/dev` at the same time (within noise; the HTML entities table is now its own chunk); rules and record parsing load lazily.
- **Follow-ups.** Renaming a page does not move `places[page]` keys (slice 52 or a page-rename slice). Agent tools that set `agentText`/`byAgent` are slice 21; the To check list (OK button) is slice 19; slice 14's details replace the interim sheet controls.
