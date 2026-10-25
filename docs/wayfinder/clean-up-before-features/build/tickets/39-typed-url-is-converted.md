---
title: "A typed page URL is turned into a valid one, not refused"
type: task (AFK)
status: closed
assignee: lead-39
builder: claude
blocked_by: []
---

## Goal

Lex (2026-10-25): "When a person types in a new url, change it to use the right rules." Slice 40 made new page addresses strict (lowercase letters, digits and dashes, at most 80 characters, starting with a letter or digit) and refuses anything else. Instead, the field converts what is typed.

## Decided behaviour

- Wherever a new page address is typed (New page, New subpage, Change URL, and the name that becomes the address), the input is converted to the rules: lowercase; spaces, underscores and other separators become one dash; accents are dropped (é → e); anything else is removed; no dash at the start or end; at most 80 characters.
- The field shows the converted address as Lex types, so what he sees is what is saved; no refusal message, no toast. Converting runs as he types without moving the caret unexpectedly.
- An address that converts to nothing (only symbols) keeps the Create button disabled, as an empty field does today.
- Agents' `make_page` and other tools keep refusing invalid addresses (agents get a clear error); only the typed field converts.

## Files

The page-address rule from slice 40 (one function that converts, beside the one that checks), the New page / Change URL fields, their unit tests and the Pages specs.

## Done when

- Unit tests: "About Us!" → `about-us`, "Café Menü" → `cafe-menu`, "  --Hello__World--  " → `hello-world`, 100 letters → 80, "!!!" → empty.
- A Pages spec types "About Us" into New page and gets the page at `/about-us`.
- `npm run check`, `kit unit --affected`, `kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)).

- `kit doctor`; `kit bg slice-39 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/39-typed-url-is-converted.md --builder claude-opus-5-5`; `kit wait job slice-39 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`, `kit size` (at or under 362 KB), `kit ux --ticket <this ticket>` for the visible change.
- Review: `ASE_REVIEW_MODEL=claude-opus-5-5`. Land: `kit pr --ticket <this ticket>`.

## Done (2026-10-25)

- One converter beside the check in `shared/site-rules.ts`: `toPageAddress` (lowercase, accents dropped, every run of separators (spaces, dashes, dots, underscores, `, : ; / \ | + &`) one dash, other marks dropped so "Don't Stop" is `dont-stop`, no dash at either end, at most 80) and `toPageRoute` for a whole URL, part by part where the move planner checks the rule: a folder the site already has at the converted path so far stays as it is (`/Old_Folder/x/` moves the page into `Old_Folder/`; pasted `/Notes/Old_Sub/x/` finds `notes/Old_Sub/`), as do the page's own last part and a final `.html`. While typing, a last part that begins a folder's name there stays as typed too, so `Old_Folder` can be typed out; this is the one place the field can briefly differ from what Enter saves (`/Old` is saved as `/old` unless typed out to the folder). The Pages tab and Page settings get this from the pages controller as `typedUrl`, one name through every port, beside `urlPlan`. `slugify` in `src/native-pages.ts` is gone; its callers (title → address in the Pages tab, cards, page choices, the agent's default slug from a title) use `toPageAddress`.
- The New page / New subpage URL field and every Change URL field (Pages tab, Page settings) show the converted address as typed (a full 80-character address waits no dash), the caret kept after what the text before it became; during composition (a dead-key accent) it waits, and converts when the composition ends. A separator typed at the end waits as one dash for the next word; it is never saved, and the field drops it on Enter (the New page field also on leaving it). Change URL also keeps a half-typed `.html`. Whatever converts to nothing leaves the field empty and Create refused as before. Agent tools still refuse invalid addresses with the rule's words. Marks inside words are now dropped where `slugify` made a dash ("Don't" was `don-t`, now `dont`), so a page made earlier under the old form is not seen as the same title's page by the card page offer.
- Unit: `tests/site-rules.test.ts` covers the ticket's cases ("About Us!", "Café Menü", "  --Hello__World--  ", 100 letters, "!!!"), inner marks dropped, the typing mode, the caret's text-before staying a start of the whole, and `toPageRoute` keeping folders the site has; `tests/pages-controller.test.ts` types `/Old_Folder/Moved Page/` and letter by letter `/Old_Folder/moved`, keeps `Old_Folder`, and plans the move into it, and a pasted `/Notes/Old_Sub/x/` plans the move into `notes/Old_Sub/`; the old `slugify` cases moved there from `tests/native-pages.test.ts`.
- Specs: `native-create.spec.ts` types "About Us" as a new page's title and gets `/about-us/` (`about-us/index.html`), and types "About_Us.v2" / "Second Take!" into the URL field and sees `about-us-v2` / `second-take`, types " !x" between "ab" and "cd" and gets `ab-xcd`, sees "About " become `about` on leaving the field, and a composed "Cafe\u0301" wait until the composition ends and become `cafe`, the URL checked again then; `native-page-urls.spec.ts` sees `/notes/Bad URL/` become `/notes/bad-url/` with its move plan instead of a refusal, and `/!!!/` and `/./x/` become `//` and `//x/`, refused as the home page's URL and an empty part; `A b` typed after `/notes/` in `/notes/x/` gives `/notes/a-bx/` with the caret at 10.
- The Change URL field shows no "Enter to change, Esc to cancel" tip any more (UX rule S1); Page settings and the Pages tab keep their Cancel and Change URL buttons, which now have the row to themselves.
- Size: `kit size` boot 358 KB (±0 KB vs dev), budget 362 KB.
- Feature list: F-pages-03 and F-pages-05 updated.

### UX follow-ups

- UX (looks off): F-pages-01 the 390 px tree reads well as one list, but each row shows a + and a ⋯ at 24 px instead of one 44 px ⋯ on touch (U6), and the Publish button carries a count (S2) (.scratch/ux/lead-39/20261025-230057-WNkeQU/pages-F-pages-05-390-light-moved-strip.webp)
- UX (looks off): F-pages-03 the scripted check says the empty-page picks are cut off by the bottom sheet at 390 px (L5), and the toast after making a page reads at 1.6–1.9:1 in light (S4, L12) (.scratch/ux/lead-39/20261025-230057-WNkeQU/F-pages-03-contact.webp)
- UX (looks off): F-pages-04 after the rename or duplicate a toast pops up, and it reads at 1.9–2.0:1 in dark at 390 px (S4, L12) (.scratch/ux/lead-39/20261025-230057-WNkeQU/F-pages-04-contact.webp)
- UX (looks off): F-pages-05 the Change URL form names the new URL and offers the redirect, but its line under the field shows file paths like "about/index.html" (S7); after the move a toast with link and file counts appears, low-contrast while it fades in (S4, L12); Publish carries a count (S2) (.scratch/ux/lead-39/20261025-230057-WNkeQU/pages-F-pages-05-390-light-moved-strip.webp)
- UX (looks off): F-pages-06 the dropped page lands under Work as a subpage, then a "URL changed…" toast with counts appears (S4) (.scratch/ux/lead-39/20261025-230057-WNkeQU/pages-F-pages-06-1280-light-drop-strip.webp)
- UX (looks off): F-pages-12 the head follows, but a "Page settings applied as a draft. Publish to keep them." toast appears (S4, B6) and at 390 px it sits over the canvas's "First item" card (U5) (.scratch/ux/lead-39/20261025-230057-WNkeQU/pages-F-pages-12-390-light-apply-strip.webp)
- UX (looks off): F-pages-15 the shared header updates to About / Our work, but a "Navigation applied as a draft. Publish to keep it." toast appears (S4, B6) and at 390 px it covers the "First item" card (U5) (.scratch/ux/lead-39/20261025-230057-WNkeQU/pages-F-pages-15-390-light-apply-strip.webp)
