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

- One converter beside the check in `shared/site-rules.ts`: `toPageAddress` (lowercase, accents dropped, every run of separators (spaces, dashes, dots, underscores, `, : ; / \ | + &`) one dash, other marks dropped so "Don't Stop" is `dont-stop`, no dash at either end, at most 80) and `toPageRoute` for a whole URL, part by part where the move planner checks the rule: a folder the site already has stays as it is (`/Old_Folder/x/` moves the page into `Old_Folder/`), as do the page's own last part and a final `.html`; while typing, a last part that starts a name the site has stays too, so `Old_Folder` can be typed out. The Pages tab and Page settings get this from the pages controller (`urlTyped`, beside `urlPlan`), which knows the site's files. `slugify` in `src/native-pages.ts` is gone; its callers (title → address in the Pages tab, cards, page choices, the agent's default slug from a title) use `toPageAddress`.
- The New page / New subpage URL field and every Change URL field (Pages tab, Page settings) show the converted address as typed (a full 80-character address waits no dash), the caret kept after what the text before it became; during composition (a dead-key accent) it waits, and converts when the composition ends. A separator typed at the end waits as one dash for the next word; it is never saved, and the field drops it on Enter (the New page field also on leaving it). Change URL also keeps a half-typed `.html`. Whatever converts to nothing leaves the field empty and Create refused as before. Agent tools still refuse invalid addresses with the rule's words.
- Unit: `tests/site-rules.test.ts` covers the ticket's cases ("About Us!", "Café Menü", "  --Hello__World--  ", 100 letters, "!!!"), inner marks dropped, the typing mode, the caret's text-before staying a start of the whole, and `toPageRoute` keeping folders the site has; `tests/pages-controller.test.ts` types `/Old_Folder/Moved Page/` and letter by letter `/Old_Folder/moved`, keeps `Old_Folder`, and plans the move into it; the old `slugify` cases moved there from `tests/native-pages.test.ts`.
- Specs: `native-create.spec.ts` types "About Us" as a new page's title and gets `/about-us/` (`about-us/index.html`), and types "About_Us.v2" / "Second Take!" into the URL field and sees `about-us-v2` / `second-take`, types " !x" between "ab" and "cd" and gets `ab-xcd`, sees "About " become `about` on leaving the field, and a composed "Cafe\u0301" wait until the composition ends and become `cafe`; `native-page-urls.spec.ts` sees `/notes/Bad URL/` become `/notes/bad-url/` with its move plan instead of a refusal, and `/!!!/` and `/./x/` become `//` and `//x/`, refused as the home page's URL and an empty part.
- Feature list: F-pages-03 and F-pages-05 updated.
