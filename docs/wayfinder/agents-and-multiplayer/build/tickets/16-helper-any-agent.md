---
title: "The helper: any agent picks up pins"
type: task (AFK)
status: open
assignee: am-16
builder: claude
blocked_by: [12-mcp-menu-agents, 13-pin-conversation]
---

## Goal

A pin never waits for nobody: a small helper on Lex's computer listens all the time and starts the chosen coding agent for each pin ([research 01](../../tickets/01-research-agents-on-own-subscriptions.md#resolution-2026-10-24)).

## Decided behaviour

[Ticket 06, item 4](../../tickets/06-grill-asking-with-a-pin.md#resolution-2026-10-24):

- The helper is an MCP client of the editor's `/mcp`, connecting through the same connection and OAuth. Connect to MCP stays the only button; its copied prompt gives the helper's start command.
- It waits for pins and starts the agent chosen in "Pins go to" through ACP (Claude Code, Codex, Gemini CLI, OpenCode), on Lex's own plans.
- Agents run with limited permissions (a short allowed-tools list) and work through the MCP tools.
- Questions and approvals come back to the pin.
- It reports the agent's program, so carets and chips can show its icon (stage 2).
- **Installation (Lex, 2026-10-25):** an `npx` package, `@techiesreviews/editor-helper`. Lex approves the first publish. Claude Code is the default for "Pins go to".

## Files

Expected (confirm while designing): a new `helper/` package (its own `package.json`, outside the editor bundle), `src/agent-prompts.ts` (the start command), `worker/mcp.ts` and `worker/oauth.ts` only if the helper needs a client type; tests for the helper's pin loop with a fake ACP agent; `docs/mcp.md` and a short `helper/README.md`.

## Done when

- A test runs the helper against the local Worker and a fake ACP agent: a pin starts one agent, its question returns to the pin, and its change lands.
- With the real Claude Code on the lead's machine, one manual run is recorded in Done (command and result).
- Permissions are limited (test of the allowed-tools list).

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-16 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-16 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- Big, delicate slice: one second-opinion review of the final version (`ASE_REVIEW_MODEL=grok-4.7` or `gpt-6.1-sol` `kit review --ticket <this ticket>`), within the weekly budget.

## Done (2026-10-30)

- New `helper/` package, `@techiesreviews/editor-helper` 0.1.0 (its own `package.json`, outside the editor bundle; `npm run build` makes one file, `dist/cli.js`; not published: Lex approves the first publish). `EDITOR_HELPER_TOKEN=<token> npx -y @techiesreviews/editor-helper@0.1.0 <editor>/mcp` runs it.
- The pin loop (`helper/src/helper.ts`, `runHelper`): an MCP client of `/mcp` on the Connect to MCP connection (token from the copied prompt; no new client type, `worker/oauth.ts` unchanged). It keeps calling `wait_for_requests` as "Pin helper" (`HELPER_AGENT`). For each pin it starts the agent chosen in "Pins go to" through ACP (`helper/src/acp.ts`, protocol 1 over the agent's stdio), in an empty temporary folder, with the editor's MCP server (same URL and token) in its session. Pinned adapters (`AGENT_COMMANDS`): `@agentclientprotocol/claude-agent-acp@0.99.1`, `@agentclientprotocol/codex-acp@2.5.0`, `@google/gemini-cli@0.66.0 --acp`, `opencode-ai@1.19.5 acp`; `--agent-command` starts any other ACP agent. The agent works under its program's name ("Claude Code", "Claude Code 2" beside it), which the pin and chips show (icons are stage 2). The user's answer or follow-up goes back to the same session while the agent runs; an idle agent is stopped after 15 minutes. At most three agents run at once; more pins wait their turn. An agent that cannot start, or stops mid-turn, answers its pin in a short sentence. A 401 (Disconnect MCP, sign-out) ends the helper and its agents; Ctrl+C ends it at once, even during a wait.
- "Pins go to" reaches the helper: the receiving tab tells it in the answer to the helper's own waits with requests (`pinsGoTo`, `createRequestTools`' new `pinsGoTo` port fed by `pinAgent` in `src/components/agent-menu.ts`). `worker/mcp.ts` passes it on only when it names one of `PIN_AGENTS`. Other agents' waits are unchanged.
- Permissions: the helper offers agents no files or terminal. Only the editor's MCP tools run unasked (`ALLOWED_TOOLS = ["mcp__native-site-editor"]`, `toolAllowed`), `wait_for_requests` excepted; a whole-name match, so a shell command that names a tool is still a shell command. Claude Code gets `tools: []` (no built-in tools), that allowed list, and `settingSources: []` (none of the user's settings, hooks, plugins or MCP servers) through `_meta.claudeCode.options`. Agents that offer a "default" or "read-only" mode get it. Anything else an agent asks to run is asked on the pin ("Allow npm install?", at most 60 characters) as the agent, and runs once only on a plain yes; no answer in ten minutes refuses.
- Start command: `helperCommand` and `HELPER_PACKAGE` in `src/agent-prompts.ts`. The prompt Connect to MCP copies ends with it: when the user asks for pins to be picked up after the conversation, the agent runs it in the background in place of the watchdog.
- Tests:
  - `tests/editor-helper.test.ts`, against the real Worker in Miniflare and a receiving tab, with a fake ACP agent in place of Claude Code. A pin starts one agent, in one session given the editor's MCP server, an empty folder, the Claude options and the default mode. Its question "Which word?" comes back to the pin under its name. The answer goes back to the same agent, which asks before `npm install` ("Allow npm install?" on the pin, answered no, refused) while its `edit_file` runs unasked. Its change lands in the tab as the page's draft write, and the pin is done. A probe on another connection shows only the helper's waits are told "Pins go to". Ctrl+C ends a helper in its wait at once, and Disconnect MCP ends the first, which stops its agent.
  - Same file: the allowed-tools list (editor tools in each naming form allowed; Bash, Read, Edit, WebFetch, other servers, `wait_for_requests`, a shell command naming an editor tool, and an execute kind refused), the Claude session options, allow-once and refusal choices, the pin's approval question and what counts as yes. A real child process (`launchAgent`) answers over its stdio without the helper's token in its environment. The helper's names, agents and version match the editor's.
  - `tests/agent-watch.test.ts`: only the helper's waits with requests are told the choice; the copied prompt carries the helper's command.
  - `receivingTab` moved from `tests/mcp-runtime.test.ts` to `tests/support/receiving-tab.ts` (with a `pinsGoTo` option) for both files.
- Docs: `docs/mcp.md` "The helper: pins start your own agent"; `helper/README.md`; `docs/agents/code-map.md` names `helper/`. Feature list: new F-agent-14.
- Manual run with the real Claude Code: not done here. This builder may not start agents, and the package is not on npm yet. For the lead, after `npm run build` in `helper/`: `EDITOR_HELPER_TOKEN=<token from Connect to MCP> node helper/dist/cli.js https://preview-editor.techies.tools/mcp`, then pin a heading in the editor and record the result here.
- `RESULT: ok doctor 11/11 checks passed`. `RESULT: ok unit 3831/3831 (255 files)` (`kit unit --affected`, the new test included). `RESULT: ok specs 4/4 passed` (native-mcp-menu, native-mcp, native-agent-waits, native-agent-pins). `npm run check` and `npm run lint` are clean. `kit specs --affected` was not run here.

- Review round 1:
  - Status back to `open`: the manual run with the real Claude Code (Done when) is still to be recorded, by the lead, and the first publish waits for Lex's approval.
  - **For Lex (Tuesday review): how long the helper listens.** It runs on the Connect to MCP token, which ends with the editor sign-in (at most eight hours); then it stops and says so, and pins wait for nobody until Connect to MCP gives a new command. Recommended default, easy to change later: keep it so for now. The other choice is the helper signing in on its own (OAuth with a longer-lived sign-in), which keeps it listening across days but means a new kind of sign-in that outlives the editor's. Written in `helper/README.md` too.
  - Stopping no longer starts queued pins: once the helper ends (`stopping`), a closing agent starts nothing, and the queue is emptied first.
  - Ctrl+C (and the site owner's pause) first says on each pin the helper took and has not finished, an agent's at work or one waiting its turn: "<agent> stopped: the helper on this computer was closed. Send again to retry." Pins already answered keep their answer. A dead connection (401) says nothing, as it cannot.
  - An agent program that ends while the helper writes to it (EPIPE), or never starts, ends only its own connection (`child.stdin` error listener; `acpConnection` also closes on its output's close or error).
  - Approvals: the question's time runs from its post, and every settle clears its timer. Only a message the user wrote after the "Allow …?" question answers it (`answerTo`, by the thread), so a follow-up from before is a follow-up. Only a plain yes allows ("yes", "ok!"; not "ok, no" or "yes but don't"). A plain yes or no stays with the helper; anything more ("no, also make it blue") is refused and also goes to the agent as a follow-up turn.
  - `--agent-command` agents work under their program's name (`commandName`: "claude-agent-acp", "opencode"; "Custom agent" when none), not the "Pins go to" choice's.
  - Tests (`tests/editor-helper.test.ts`), each against the local Worker:
    - `maxAgents: 1` with two pins: the second agent starts only after the first closes. With one agent at work and a pin queued, Disconnect ends the helper, starts nothing more and stops every agent.
    - An agent whose program stops mid-turn: its pin says "Claude Code stopped before it finished. Send again to retry." and the job is gone.
    - `approvalMs: 50` with no answer refuses. "no, also make it blue" refuses and brings a second turn, the follow-up.
    - Ctrl+C with one pin done, one at work and one queued: the two unfinished say they stopped before `runHelper` ends; the done one keeps "Done.".
    - A program that exits at once, and one that does not exist: `initialize` (1 MB, to force a write on the closed pipe) is refused with "The agent stopped", with no uncaught EPIPE.
    - Plain yes and no, `answerTo` and `commandName` in the list test.
  - An agent that stops or cannot start is closed before its pin says so, so a message sent after reading it starts a new agent. The new tests end every helper they start, also when an assertion fails.
  - `RESULT: ok doctor 11/11 checks passed`. `RESULT: ok unit 3834/3834 (255 files)` (`kit unit --affected`). `kit specs --affected` (all 162, the builder limit lifted): `RESULT: fail specs 1 of 162 failed: native-boot-memory.spec.ts`, a warm-reload snapshot check this change does not touch; alone it passes (`RESULT: ok specs 1/1 passed`). `npm run check` and `npm run lint` are clean.
