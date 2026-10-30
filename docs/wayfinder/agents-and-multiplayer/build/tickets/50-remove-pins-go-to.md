---
title: "The MCP menu loses its \"Pins go to\" choice"
type: task (AFK)
status: closed
assignee: am-50
builder: claude
blocked_by: [16-helper-any-agent]
---

## Goal

Lex, 2026-10-30, a preview note on the MCP menu's "Pins go to" control (`span#agent-menu-pins-go-to`): "remove the 'Pins go to' control and the relevant code from Native Site Editor." Slice 12 added it (Claude Code by default, also Codex, Gemini CLI, OpenCode, remembered per site in this browser); slice 16 was going to read it to pick which agent the helper starts.

## Decided behaviour

- The menu has no "Pins go to" row; the per-site stored choice and its code go (`src/pins-go-to.ts`, its use in `src/components/agent-menu.ts` and CSS, the `shared/agent.ts` parts only it uses), with their tests; any stored value is simply ignored and cleared.
- Pins go to whichever connected agent takes them first, as before slice 12.
- The helper (slice 16) picks its agent from its own start command (Claude Code unless the command names another), not from the menu (lead, 2026-10-30; easy to undo).
- `docs/agents/features.md` and the build README lines that mention the choice say what holds now.

## Files

- `src/pins-go-to.ts` (removed), `src/components/agent-menu.ts`, `src/components/agent-menu.css`, `shared/agent.ts`
- `tests/pins-go-to.test.ts` (removed), `tests/native-save/native-mcp-menu.spec.ts`, `tests/native-save/native-mcp.spec.ts`, `tests/native-save/native-agent-quiet.spec.ts`
- `docs/agents/features.md`, `docs/wayfinder/agents-and-multiplayer/build/README.md`, `docs/agents/code-map.md`

## Done when

- No "Pins go to" in the menu at 390 and 1280, light and dark (shots); no code or test left that reads the choice (`git grep -i "pins go to\|pinsGoTo\|pins-go-to"` finds only history docs).
- The MCP menu specs pass; `kit unit --affected`, `kit specs --affected`, `kit size` pass.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit unit --affected`, `kit specs --affected`, `kit review`, `kit pr`; report the RESULT lines and shots.

## Done (2026-10-30)

- The MCP menu has no "Pins go to" row: `src/pins-go-to.ts` and its test are gone, with the picker's code in `src/components/agent-menu.ts`, its CSS in `agent-menu.css` and `PIN_AGENTS`/`PinAgent` in `shared/agent.ts` (the helper keeps its own list in `helper/src/agents.ts`). Pins go to whichever connected agent takes them first.
- A stored choice (`native-site-editor:pins-go-to:…`) is cleared when the menu opens, in the same one-off clean-up as the old Watch records (`forgetRetired`, to remove after 2027-02-28).
- After Stop, the focus goes to the agents' list ("Agents working now"), or to the menu once none is left (a group named "MCP connection"; each takes the focus only then, so a click in the Requests flyout never closes it): never another Stop or Disconnect MCP (it used to go to "Pins go to"). Both show the editor's focus ring.
- Specs: `native-mcp-menu.spec.ts` checks the menu has no picker, the new focus after Stop and its name (a second Enter ends no one), and that old Pins go to records are removed; `native-mcp.spec.ts` and `native-agent-quiet.spec.ts` no longer allow for the row.
- `docs/agents/features.md` F-agent-11 and the build README's helper decision say what holds now; `docs/agents/code-map.md` no longer lists `src/pins-go-to.ts`.
- Checks: `kit unit --affected` 3863/3863, `kit specs --affected` 6/6 (79 tests), `kit size` ok (boot 345 KB, ±0), `npm run check` and `npm run lint` clean. Shots at 390 and 1280, light and dark, before and after (`kit shots --compare dev`): the row is gone.
- `git grep -i "pins go to\|pinsGoTo\|pins-go-to"` also finds the clean-up's key and its spec, and one history comment in `tests/agent-watch.test.ts` (outside this ticket's files); no code reads the choice.

### Follow-ups

- Spec (P3): d244b04b8:docs/wayfinder/agents-and-multiplayer/build/README.md:130 — P3 ticket: the new line says the helper starts "the one its own start command names, Claude Code by default (Lex, 2026-10-25)". That credits Lex with the start-command rule. The ticket's Decided behaviour section credits that rule to the lead ("lead, 2026-10-30; easy to undo"). Lex's 2026-10-25 decision was only that Claude Code is the default. A reader of the README would take a lead default for a Lex decision, and that weakens the Tuesday-pack question about it (`docs/work/tuesday/2026-11-03.md:43`). Fix: "Which agent it starts: Claude Code by default (Lex, 2026-10-25); another one if its start command names it (lead, 2026-10-30, ticket 50)."
- Standards (P2): d244b04b8:src/components/agent-menu.ts:589 — P2 fault (CODING_STANDARDS.md has no rule for focus handling, so this one is about behaviour): after a Stop, `holdFocus(working)` puts the focus on the `<ul>` itself. `focusedKey` only looks for the focus inside a row (`row.contains(document.activeElement)`). So if the list later goes hidden while it holds the focus, `drawAgents` returns at line 604 without moving the focus anywhere. That happens when the last agent's time on the list ends, or when another tab stops it (the `listen` path at line 619). The focus then falls to `<body>` and the keyboard user loses their place in the menu. Before this change the focus sat on "Pins go to", which stayed visible. It can also leave `tabindex="-1"` on the hidden list if the browser's focus fix-up fires no `blur`. Fix: also treat `document.activeElement === working` as "focus in the list". For example, before `replaceChildren`, read `const listFocused = working.contains(document.activeElement)`, then `if (listFocused && !stop) holdFocus(working.hidden ? root : working)`.
- Validation gaps (gap): No spec covers the list losing its last agent while the list itself has the focus. Test to add in `tests/native-save/native-mcp-menu.spec.ts`: With two agents, stop one by keyboard and assert `.agent-menuagents` is focused. Stop the other from a second tab, as the existing "a Stop pressed in another tab" test does. Assert `.agent-menu` gets the focus (`toBeFocused()`), the list has no `tabindex` attribute, and a following Enter leaves `.agent-menuaction` reading "Disconnect MCP".

