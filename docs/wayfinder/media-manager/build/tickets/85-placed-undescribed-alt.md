---
title: Placing an undescribed file leaves it not described yet
type: task (AFK)
status: closed
assignee: claude (mm-85 runner)
blocked_by: [21-agents-place-describe-collect]
builder: sol
phase: 1
---

## What

Follow-up found by slice [21](21-agents-place-describe-collect.md) (6c7fca63). Placing a media file that has no description, through the shared placing code of slice [18](18-media-picker.md) (`placeMediaImage` / `swapPlaceImage`, used by the picker's Use and by the agent tool `place_media`), writes the file **name** as the image's alt text. That contradicts map ticket [13's resolution](../../tickets/13-what-agents-may-do.md#resolution-2026-10-13) and CONTEXT.md **Description**: a file's description is written once and used by every place; a place has its own words only when someone gives it words; an empty description counts as not described yet unless Decorative. Today the file name counts as own words, so a description added to the file later never reaches that place.

- Placing (or swapping in) an undescribed, non-Decorative file writes `alt=""` with no Decorative mark, so the place shows **Not described yet** (slice [13](13-descriptions-and-decorative.md)'s Edit bar warning). Described files still give their description, Decorative files `alt=""` as Decorative; own words and Decorative places are kept as slice 18 decided.
- A description saved on the file later (Media details, To check, or the agent's `describe_media`) reaches every place of that file that has no own words, including these.
- Places already placed with the name fallback before this fix (★): a place whose alt equals its file's name fallback (`mediaNameAlt`, for example "hero image" for `hero-image.jpg`), its base name (`hero-image`) or its file name (`hero-image.jpg`), and that has no recorded own words (`places[page].agentText` is not that text), counts as not described: it follows the file's description and Decorative mark, and the Edit bar warns **Not described yet**.

## Done when

- `tests/media-descriptions.test.ts`: swapping in an undescribed file gives `alt=""` (not the name); a later file description reaches those places; name-fallback, base-name and file-name alts follow the file and read as not described; agent words equal to the name stay own words; own words and Decorative places unchanged.
- `tests/native-save/native-media-picker.spec.ts`: Use on an undescribed file writes an empty alt and the Edit bar shows Not described yet; describing the file in File details then reaches the place.
- `tests/native-save/native-mcp-media.spec.ts`: an agent places an undescribed file (empty alt, Not described yet), then `describe_media` on the file reaches the place.
- `npm run check`, the unit suite and `npm run lint` are green; touched browser specs pass.

## Done (2026-10-14)

- **Behaviour.** Placing or swapping in an undescribed, non-Decorative file (the picker's Use and the agent's `place_media`, both through `placeMediaImage` → `swapPlaceImage`) now writes `alt=""` with no Decorative mark, so the Edit bar warns **Not described yet**; words that were the old file's description also go to `""` when the new file is undescribed. A described file still gives its description, a Decorative file `alt=""`; own words and place Decorative marks behave as slice 18 decided. A later file description (File details, To check, `describe_media`) reaches these empty places through slice 13's existing rule; file Decorative empties them.
- **Legacy name alts (★).** New `followsFileName(file, alt)` in `media-descriptions.ts`: an alt equal to the file's name fallback (`mediaNameAlt`), base name or file name counts as not described: `placeDescriptionState` reads it as missing (Edit bar warns Not described yet even though the alt is not empty), `descriptionPlaceEdits` lets it follow a new description or file Decorative (an emptied description leaves it as written), and `swapPlaceImage` treats it like the old file's description. Two exceptions: name words an agent recorded (`places[page].agentText`) stay its own words; a name alt that is also the file's description simply follows that description (slice 13).
- **Scope.** Component slot images and Site settings keep their own Alt fields and name defaults (slice 18 kept place rules to page images).
- **Commits.** 6c7939df claim; 9080786a build (Sol; runner fixed a description-equals-name case that read as missing); bc2120a2 review fixes.
- **Tests.** `tests/media-descriptions.test.ts`: undescribed swap gives `""` and reads missing; a later description and file Decorative reach it; per name form (name fallback, base name, file name): reads missing, follows descriptions, Decorative and swaps, an emptied description leaves it, a description equal to the name follows; agent name words stay own words (also when the description is that name), stay in To check and move on swap. `tests/media-controller.test.ts` (Edit bar state), `tests/media-workspace.test.ts` (metadata, To check edits and agent descriptions reach empty and name-alt places). Browser: `native-media-picker.spec.ts` (Use on an undescribed file → `alt=""`, Not described yet, unpressed Decorative; File details description reaches the place), `native-mcp-media.spec.ts` (agent places an undescribed file, then `describe_media` fills it), `native-upload.spec.ts` (Add new file then Use expects `alt=""`). `npm run check`, `npm run lint`, unit 2529/2529; picker, MCP media, upload, alt refusal, structure and block-bars specs 24/25, the one failure a connection timeout in the new MCP case before any media step; rerun 4/4 (`--repeat-each=2`).
- **Review (GPT-6.1 Sol).** Fixed 2: agent name words equal to the file description lost their own-words protection (P2; the runner's edge fix had made description equality win; agent words now come first, with coverage including To check); the new MCP case was a second `@smoke` test (P3; tag removed). Rejected 0. Not re-reviewed: small fixes, unit-covered.
- **Bytes.** First paint 342 KB gzip of 355 KB, unchanged from slice 21's measurement; the only boot change is one condition in the Edit bar warning; rules stay in the lazy chunk.
- **Rebase.** Landed after slices 22 and 23. Slice 23's held adding in the picker (`held.save` in `media-place.ts`) also decides the alt through `swapPlaceImage`, so a file added in the picker and then used gets the same rule; its `mediaNameAlt` default only feeds component and Site settings fields. After the rebase: check, lint, unit 2539/2539, the same six specs 25/25, first paint 342 KB.
- **Follow-ups.** None. Slice 22's Media chapter (`worker/site-conventions.ts`) already states that an empty alt not marked Decorative counts as not described yet and gives no "describe first, then place" advice, so it needs no change.
