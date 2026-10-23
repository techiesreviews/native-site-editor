---
title: "Strict new page addresses and one make_component refusal list"
type: task (AFK)
status: closed
assignee: lead-40
builder: sol
blocked_by: [32-one-overlay-for-agents-and-media]
---

## Goal

Candidate #3, slice a (Strong; research 01 §3). Three page-address rules exist (agent `worker/mcp.ts:410` strict; Pages tab `src/native-pages.ts:190` allows capitals, dots and underscores while its own message says "letters, digits and -"; Change URL `src/native-page-moves.ts` has none), and make_component's refusals live twice (`shared/agent-edit.ts:189–201`, `src/page-builder/component-model.ts:1099, 1462–1463`). One module in `shared/` answers both.

## Decided behaviour

[Ticket 05, item 4](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22): **strict new page addresses**: lowercase letters, digits and dashes, at most 80 characters, starting with a letter or digit, for every new address, whether made in the Pages tab, by Change URL or by an agent. **Existing addresses stay** until someone changes them (opening, editing and saving a page with an old address is never refused). Titles already turn into strict addresses through `slugify`. One wording per refusal, for example "Use lowercase letters, digits and dashes (at most 80)."

## Files

- New `shared/site-rules.ts` (or a widened `shared/native-routes.ts`; builder's choice, one entry in `docs/agents/code-map.md`): `pageAddressProblem(slug)`, `makeComponentProblem(outline, tag, taken)`
- `worker/mcp.ts`, `shared/agent-edit.ts`, `src/native-pages.ts`, `src/native-page-moves.ts`, `src/page-builder/component-model.ts`
- `src/main.ts` only where Create calls the address rule (a few lines)
- Tests: new `tests/site-rules.test.ts`, `tests/native-pages.test.ts`, `tests/native-page-moves.test.ts`, `tests/mcp-runtime.test.ts`; the Pages tab and Change URL specs that type an address
- `tests/main-ts-ceiling.test.ts` if `main.ts` changes

## Done when

- Pages tab, Change URL and the agent refuse `About_Us.v2` with the same words; an existing page named that way still opens, saves and can be renamed to a strict address.
- make_component refuses the same cases with the same words from the agent and from the tab.
- `npm run check`, `npm test`, `kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). First slice of #3: starts when #2 is merged, on preview and checked.

- `kit doctor`; `kit bg slice-40 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/40-page-address-and-component-rules.md --builder sol`; `kit wait job slice-40 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected` (pages, Change URL, MCP specs), `kit size` if boot code changes.
- `kit shots pages` (the refusal wording in Create page).
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket>`.
- Report: shots contact sheet, unit and specs `RESULT:` lines, review folder and decisions, PR and merge SHA, `main.ts` lines and ceiling if changed.

## Done (2026-10-24)

- `shared/site-rules.ts`: `pageAddressProblem(slug)` (lowercase letters, digits and dashes, at most 80, starting with a letter or digit; one wording: "Use lowercase letters, digits and dashes in the URL, at most 80, starting with a letter or digit.") and `makeComponentProblem(source, tag, taken)` (the name first: `componentTagProblem`; then the element: `componentSourceProblem`). One row in `docs/agents/code-map.md`.
- Pages tab and card page offers (`nativeNewTarget`), Change URL (`planPageMove`) and the agent's `create_page` (`worker/mcp.ts`, `shared/agent-edit.ts`) refuse `About_Us.v2` with those words. Change URL checks only new parts: the page's own last part when it changes, and folders not yet in the site; a page at an old address still opens, saves, moves under another page with its name and can be renamed to a strict address. `main.ts` is unchanged.
- A typed URL part no page can have (a space, a leading `_` or `.`; `normalizeRoute` in `src/native-create.ts`) is refused with the same words (`PAGE_ADDRESS_RULE`), so Change URL shows one wording. Specs: a page at `About_Us.v2/index.html` opens, saves a new title and is offered `/about-us/`; units pin an old-named `.html` page moving under a folder, its folder URL refused, and the card new-folder wording.
- make_component: the agent's checks (`worker/mcp.ts`, `shared/agent-edit.ts`) and the tab's (`tagNameProblem`, `makeComponentPlan`) use the same rule, so a bad name, a taken name, `<main>`/`<body>`, the site header or footer and other components get the same words everywhere ("<x> is a component already." replaces "This is a component already."; the agent's "not a valid custom-element name" becomes the tab's detailed name words).
- Tests: new `tests/site-rules.test.ts`; `native-pages`, `native-page-moves` (strict new parts, old address kept on move, rename to strict), `mcp-runtime` (create_page slug, make_component words), `component-model`, `card-page-offer`; specs `native-create` (New page URL field) and `native-page-urls` (Change URL field) type `About_Us.v2`.
