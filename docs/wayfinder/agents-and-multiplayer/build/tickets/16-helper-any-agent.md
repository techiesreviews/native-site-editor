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
- It waits for pins and starts its agent through ACP, on Lex's own plans: Claude Code, unless its own start command names another (`--agent codex|gemini|opencode`); the copied Connect to MCP prompt gives the default command. It never reads the MCP menu (Lex removed the menu choice, 2026-10-30; lead; ticket 50).
- Agents run with limited permissions (a short allowed-tools list) and work through the MCP tools.
- Questions and approvals come back to the pin.
- It reports the agent's program, so carets and chips can show its icon (stage 2).
- **Installation (Lex, 2026-10-25):** an `npx` package, `@techiesreviews/editor-helper`. Lex approves the first publish. Claude Code is the helper's default agent (Lex removed the menu choice, 2026-10-30; lead).

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
- The pin loop (`helper/src/helper.ts`, `runHelper`): an MCP client of `/mcp` on the Connect to MCP connection (token from the copied prompt; no new client type, `worker/oauth.ts` unchanged). It keeps calling `wait_for_requests` as "Pin helper" (`HELPER_AGENT`). For each pin it starts its agent (Claude Code, or the one `--agent` names) through ACP (`helper/src/acp.ts`, protocol 1 over the agent's stdio), in an empty temporary folder, with the editor's MCP server (same URL and token) in its session. Pinned adapters (`AGENT_COMMANDS`): `@agentclientprotocol/claude-agent-acp@0.99.1`, `@agentclientprotocol/codex-acp@2.5.0`, `@google/gemini-cli@0.66.0 --acp`, `opencode-ai@1.19.5 acp`; `--agent-command` starts any other ACP agent. The agent works under its program's name ("Claude Code", "Claude Code 2" beside it), which the pin and chips show (icons are stage 2). The user's answer or follow-up goes back to the same session while the agent runs; an idle agent is stopped after 15 minutes. At most three agents run at once; more pins wait their turn. An agent that cannot start, or stops mid-turn, answers its pin in a short sentence. A 401 (Disconnect MCP, sign-out) ends the helper and its agents; Ctrl+C ends it at once, even during a wait.
- The agent comes from the helper's own start command, not the MCP menu (Lex removed the menu choice, 2026-10-30; lead): Claude Code by default, `--agent codex|gemini|opencode` (`AGENT_FLAGS`) for another. A helper started for an agent it cannot limit says so and ends (`notLockedDown`), before reaching the editor. The editor's waits, `worker/mcp.ts` and `src/agent-watch.ts` are as on dev; this slice adds no use of `src/pins-go-to.ts`.
- Permissions: the helper offers agents no files or terminal. Only the editor's MCP tools run unasked (`ALLOWED_TOOLS = ["mcp__native-site-editor"]`, `toolAllowed`), `wait_for_requests` excepted; a whole-name match, so a shell command that names a tool is still a shell command. Claude Code gets `tools: []` (no built-in tools), that allowed list, and `settingSources: []` (none of the user's settings, hooks, plugins or MCP servers) through `_meta.claudeCode.options`. Agents that offer a "default" or "read-only" mode get it. Anything else an agent asks to run is asked on the pin ("Allow npm install?", at most 60 characters) as the agent, and runs once only on a plain yes; no answer in ten minutes refuses.
- Start command: `helperCommand` and `HELPER_PACKAGE` in `src/agent-prompts.ts`. The prompt Connect to MCP copies ends with it: when the user asks for pins to be picked up after the conversation, the agent starts it detached from the conversation in place of the watchdog, or has the user run it in a terminal they keep open (review round 2).
- Tests:
  - `tests/editor-helper.test.ts`, against the real Worker in Miniflare and a receiving tab, with a fake ACP agent in place of Claude Code. A pin starts one agent, in one session given the editor's MCP server, an empty folder, the Claude options and the default mode. Its question "Which word?" comes back to the pin under its name. The answer goes back to the same agent, which asks before `npm install` ("Allow npm install?" on the pin, answered no, refused) while its `edit_file` runs unasked. Its change lands in the tab as the page's draft write, and the pin is done. Ctrl+C ends a helper in its wait at once, and Disconnect MCP ends the first, which stops its agent.
  - Same file: the allowed-tools list (editor tools in each naming form allowed; Bash, Read, Edit, WebFetch, other servers, `wait_for_requests`, a shell command naming an editor tool, and an execute kind refused), the Claude session options, allow-once and refusal choices, the pin's approval question and what counts as yes. A real child process (`launchAgent`) answers over its stdio without the helper's token in its environment. The helper's names, agents and version match the editor's.
  - `tests/agent-watch.test.ts`: the copied prompt carries the helper's default command, which starts Claude Code.
  - `receivingTab` moved from `tests/mcp-runtime.test.ts` to `tests/support/receiving-tab.ts` for both files.
- Docs: `docs/mcp.md` "The helper: pins start your own agent"; `helper/README.md`; `docs/agents/code-map.md` names `helper/`. Feature list: new F-agent-14.
- Manual run with the real Claude Code: not done here. This builder may not start agents, and the package is not on npm yet. For the lead, after `npm run build` in `helper/`: `EDITOR_HELPER_TOKEN=<token from Connect to MCP> node helper/dist/cli.js https://preview-editor.techies.tools/mcp`, then pin a heading in the editor and record the result here. Also record the copied prompt's way: ask Claude Code to keep picking up pins, close its chat, and check that the helper still answers a new pin (it must have started it detached, or shown the command to run).
- `RESULT: ok doctor 11/11 checks passed`. `RESULT: ok unit 3831/3831 (255 files)` (`kit unit --affected`, the new test included). `RESULT: ok specs 4/4 passed` (native-mcp-menu, native-mcp, native-agent-waits, native-agent-pins). `npm run check` and `npm run lint` are clean. `kit specs --affected` was not run here.

- Review round 1:
  - Status back to `open`: the manual run with the real Claude Code (Done when) is still to be recorded, by the lead, and the first publish waits for Lex's approval.
  - **For Lex (Tuesday review): how long the helper listens.** It runs on the Connect to MCP token, which ends with the editor sign-in (at most eight hours); then it stops and says so, and pins wait for nobody until Connect to MCP gives a new command. Recommended default, easy to change later: keep it so for now. The other choice is the helper signing in on its own (OAuth with a longer-lived sign-in), which keeps it listening across days but means a new kind of sign-in that outlives the editor's. Written in `helper/README.md` too.
  - Stopping no longer starts queued pins: once the helper ends (`stopping`), a closing agent starts nothing, and the queue is emptied first.
  - Ctrl+C (and the site owner's pause) first says on each pin the helper took and has not finished, an agent's at work or one waiting its turn: "<agent> stopped: the helper on this computer was closed. Send again to retry." Pins already answered keep their answer. A dead connection (401) says nothing, as it cannot.
  - An agent program that ends while the helper writes to it (EPIPE), or never starts, ends only its own connection (`child.stdin` error listener; `acpConnection` also closes on its output's close or error).
  - Approvals: the question's time runs from its post, and every settle clears its timer. Only a message the user wrote after the "Allow …?" question answers it (`answerTo`, by the thread), so a follow-up from before is a follow-up. Only a plain yes allows ("yes", "ok!"; not "ok, no" or "yes but don't"). A plain yes or no stays with the helper; anything more ("no, also make it blue") is refused and also goes to the agent as a follow-up turn.
  - `--agent-command` agents work under their program's name (`commandName`: "claude-agent-acp", "opencode"; "Custom agent" when none).
  - Tests (`tests/editor-helper.test.ts`), each against the local Worker:
    - `maxAgents: 1` with two pins: the second agent starts only after the first closes. With one agent at work and a pin queued, Disconnect ends the helper, starts nothing more and stops every agent.
    - An agent whose program stops mid-turn: its pin says "Claude Code stopped before it finished. Send again to retry." and the job is gone.
    - `approvalMs: 50` with no answer refuses. "no, also make it blue" refuses and brings a second turn, the follow-up.
    - Ctrl+C with one pin done, one at work and one queued: the two unfinished say they stopped before `runHelper` ends; the done one keeps "Done.".
    - A program that exits at once, and one that does not exist: `initialize` (1 MB, to force a write on the closed pipe) is refused with "The agent stopped", with no uncaught EPIPE.
    - Plain yes and no, `answerTo` and `commandName` in the list test.
  - An agent that stops or cannot start is closed before its pin says so, so a message sent after reading it starts a new agent. The new tests end every helper they start, also when an assertion fails.
  - `RESULT: ok doctor 11/11 checks passed`. `RESULT: ok unit 3834/3834 (255 files)` (`kit unit --affected`). `kit specs --affected` (all 162, the builder limit lifted): `RESULT: fail specs 1 of 162 failed: native-boot-memory.spec.ts`, a warm-reload snapshot check this change does not touch; alone it passes (`RESULT: ok specs 1/1 passed`). `npm run check` and `npm run lint` are clean.

- Review round 2:
  - Agents the helper cannot limit do not run: only Claude Code is locked down (`LOCKED_DOWN`; no built-in tools, no user settings). Codex, Gemini CLI and OpenCode run their own shell, file and web tools inside their programs, which ACP does not let the helper turn off, and their lockdown settings are not confirmed. A helper started for one of them (`--agent`) says `notLockedDown` and ends before reaching the editor. `helper/README.md`, `docs/mcp.md` and F-agent-14 promise the lockdown for Claude Code only. A command the user gives (`--agent-command`) runs with that program's own permissions, as the README says.
  - The copied prompt no longer says "in the background": a background job of the conversation ends with it. The agent starts the helper detached (`systemd-run --user` on Linux, else `nohup … &` or `setsid`), checks a few seconds later that it still runs, and says how it started it and how to stop it. If it cannot detach it, it tells the user to run the command in a terminal they keep open, and shows it (the one time it repeats the token). The manual run above checks this.
  - The agent's program is told by its name: the contract for stage 2's icons is the name the helper gives, the program's label ("Claude Code", "Codex", "Gemini CLI", "OpenCode"), with " 2", " 3" … when several run, or a custom command's program name (`commandName`). No separate `program` field.
  - A finished agent no longer holds a place: when a pin waits for its turn, an agent with nothing to do closes at once (in `start`, and when its turn ends with a pin queued), not after its 15 idle minutes.
  - The site owner's pause answers the pins its last wait took too ("Claude Code stopped: waiting for pins is paused in the editor. Send again to retry."), with those at work and queued, each pin once.
  - Ctrl+C: `stopping` is set at once on the signal's abort, so an agent that ends meanwhile neither posts its own sentence nor lets a queued pin start; its pin gets "the helper on this computer was closed" with the rest. Agents run in their own process group (`detached`), so Ctrl+C in the helper's terminal reaches the helper alone, which then ends each group (an `npx` wrapper and its agent).
  - Only an HTTP 401 (the SDK error's status) ends the helper; a message that merely says 401 does not. Offline at the start, the helper tries to connect again every 10 seconds, as a failed wait does; `cli.ts` prints one line for anything unexpected. An empty `--agent-command` is refused.
  - Tests (`tests/editor-helper.test.ts`): with the default 15 idle minutes and `maxAgents: 1`, a second pin's agent starts as soon as the first pin is done; a helper started for Codex says it cannot and ends, launching nothing; the agent's program ending in the same tick as Ctrl+C, with a pin queued: no new agent, and both pins say the helper was closed; the site owner's pause (`AGENT_WATCH` off, a new `bindings` option of `startWorker` in `tests/mcp-harness.ts`) ends the helper, and the pin its wait took says it stopped; offline at the start with an error saying "401": two retries, then Ctrl+C ends it, with no "refused the token". `tests/agent-watch.test.ts`: the prompt starts the helper detached or has the user run it.
  - Declined:
    - Recorded permission requests of Codex, Gemini CLI and OpenCode — reason: those agents no longer start (not locked down), and this builder may not run real agents to record them; when one is locked down, its recorded requests come with it.
    - The manual run with the real Claude Code — reason: the lead's step (this builder may not start agents); it stays the one open "Done when" item, so the status stays `open`.
    - A separate `program` field beside `agent` — reason: the name is the contract (above); a new field on every tool call is more than stage 2 needs.
  - `RESULT: ok doctor 11/11 checks passed`. `RESULT: ok unit 3838/3838 (255 files)` (`kit unit --affected`; the helper's 12 tests among them). `kit specs --affected`, all 162 (the builder limit lifted): `RESULT: ok specs 162/162 passed`. `npm run check` and `npm run lint` are clean.
