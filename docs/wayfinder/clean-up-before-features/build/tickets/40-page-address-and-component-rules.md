---
title: "Strict new page addresses and one make_component refusal list"
type: task (AFK)
status: open
assignee:
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

## Acceptance checks

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
