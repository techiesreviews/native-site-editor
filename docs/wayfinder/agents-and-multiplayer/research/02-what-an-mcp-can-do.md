# What an "extensive MCP" can do for working with agents

Research for [ticket 02](../tickets/02-research-what-an-mcp-can-do.md). Planning only: this changes no product code. Facts were checked on 2026-10-24 against first-party docs, specs and source code (see Sources). Where a page has no date, it says "undated". Anything I could not confirm is marked "not confirmed". My own reasoning is marked "inference".

## Short answer

- **Lex keeps his own agent app** (Claude Code, Codex, ChatGPT or Claude desktop). The editor's MCP server gives that app everything it needs to read the site, change it and answer pins. That is what the talk recommends, and it is how Figma, Webflow, Framer, Paper, Pencil, tldraw and Canva all work in 2026. **None of these canvas tools puts a chat panel in its own product.** tldraw and Pencil are exceptions: they also ship their own agent.
- **What MCP offers in 2026** beyond plain tools:
  - **Progress messages** while a call runs.
  - **Questions from the server to the person** ("elicitation"): a small form in the agent app.
  - **Long jobs the agent can leave running** ("tasks").
  - **Small interactive screens inside the chat** ("MCP Apps").
- **Support for these is patchy:**
  - Claude Code supports questions and long jobs, but it cannot show MCP Apps.
  - Claude desktop and claude.ai show MCP Apps, but they do not support questions, long jobs or live updates.
  - ChatGPT shows MCP Apps and supports questions.
  - Codex supports questions. Whether it can show MCP Apps is not documented.
  - **No app lets an online server like ours push a pin into a running agent by itself.** The only push feature is Claude Code "channels". It is a research preview, and the server must run on Lex's own computer.
- **So the watching problem can't be solved by MCP features alone.** "Keep calling `wait_for_requests`" stays the base for every app.
- **Two upgrades help in Claude Code:**
  1. A long-job version of the wait. Claude Code then starts on a pin by itself when it arrives, with no watchdog subagent.
  2. A small helper on Lex's computer that pushes pins into the session. This is the same helper ticket 01 found.
- **The biggest gaps on our side are not MCP features.** Agents cannot take a picture of the preview to check their own work, cannot show where they are working, cannot start a conversation on a pin, and cannot undo their own drafts.
- **Recommendation (inference):** build the extensive MCP first. Add a chat panel only if, after that, Lex still finds asking from his agent app clumsy.

## What MCP offers, and which agent apps support it

The current MCP version is **2026-07-28**. It is the first new version since 2025-11-25. It drops sessions, moves long jobs ("tasks") into an official add-on, and replaces "server asks the client" with a retry pattern. It also marks Sampling, Roots and Logging as on their way out (versioning page and changelog, 2026-07-28).

What each feature means for us, in one line each:

| Feature | What it means for us | In MCP since |
|---|---|---|
| Progress messages | While `wait_for_requests` waits, the server says "still waiting", which keeps the call alive | 2024-11-05 (text added 2025-03-26) |
| Cancel | The agent app stops a call; we already forward this to the tab | 2024-11-05 |
| Elicitation (form) | The server asks Lex a short question inside the agent app ("Which colour?") | 2025-06-18 |
| Elicitation (link) | The server sends Lex to a web page, such as sign-in | 2025-11-25 |
| Sampling | The server borrows the agent's model; deprecated | 2024-11-05; deprecated 2026-07-28 |
| Tasks (long jobs) | A call returns a ticket at once; the app checks back and gets the result later | experimental 2025-11-25; add-on 2026-07-28 |
| Resources, subscriptions | Readable documents (we have `native-site://conventions` and `native-site://site`); "tell me when it changes" | 2024-11-05; reworked 2026-07-28 |
| Prompts | Ready-made instructions Lex picks from a menu (we have `edit_site` and `watch_editor`) | 2024-11-05 |
| Tool hints | read-only or destructive labels; Codex asks before any tool not marked read-only | 2025-03-26 |
| Structured results, resource links | Results the app can parse, links to documents | 2025-06-18 |
| Server instructions | A short guide the agent reads on connect (our `siteInstructions`) | 2024-11-05 |
| MCP Apps | A small web page from our server shown inside the chat; it can call our tools and post a message into the chat | add-on, final; spec 2026-01-26, ext-apps v2.0.3 2026-09-25 |

### Which app supports what

Sources: each vendor's own docs, checked 2026-10-24.

| | Claude Code | Codex | ChatGPT | Claude desktop / claude.ai |
|---|---|---|---|---|
| Tools | Yes | Yes | Yes | Yes |
| Resources | Yes (`@` mentions) | In release notes, not in user docs | Used for MCP Apps; general use not confirmed | Yes |
| "Tell me when it changes" | Not documented | Not confirmed | Not confirmed | **No** |
| Prompts | Yes, as `/` commands | Not confirmed | Not confirmed | Yes |
| Progress messages | Count as "still alive"; shown in `/tasks` | Not confirmed | Not confirmed | Not confirmed |
| Questions to the person (elicitation) | Yes, in the interactive terminal only | Yes (needs an approval setting) | Yes | Not in Anthropic docs; a third party (2026-06-30) says no |
| Long jobs (tasks) | Public beta, v2.1.304+, needs a 2026-07-28 connection | Not confirmed | Not confirmed | No |
| MCP Apps (screens in chat) | **No** | Not documented | **Yes** | **Yes** (web, desktop, mobile) |
| Server pushes into the session | **Channels**: preview, local only | Not for outside servers | No | No |
| Longest single call | Ends after **5 min without a byte or progress message** (HTTP servers); total about 28 h | 60 s per docs, **300 s** per source code | Not documented | **240 s** |
| Server instructions | Yes, first 4,096 characters | Yes; "keep the first 512 characters self-contained" | Yes | Not stated |

**What the timing means for `wait_for_requests`.** Today each call waits at most 25 seconds and then asks the agent to call again (`worker/mcp.ts`, `wait_for_requests`). That fits every app's limit. A longer wait would need the server to send progress messages, which our server cannot do today: it answers in plain JSON (`responseMode: "json"`, with whitespace sent to keep the line open). It would also have to stay under 240 seconds for Claude desktop.

**Claude Code moves long calls to the background.** A call in the main conversation still running after 2 minutes becomes a background task, and its result arrives later as a notice. For MCP long jobs ("tasks"), the docs say that if Claude is idle when the result arrives, it starts on it by itself. That is the documented wake-up. For ordinary backgrounded calls the docs only promise the notice. Calls from subagents are not backgrounded.

## How canvas tools shape their MCP

| Product | Tool shape | How the agent reads the canvas | Lex's current selection | Must the app be open? | Showing the agent's work, and two editors at once |
|---|---|---|---|---|---|
| **Figma** (blog 2026-03-24) | Many small tools (about 32); writing through `use_figma`, which runs plugin code (beta, paid plan) | Structure outline, design context, **screenshot** | Only with the desktop app server; online, you give a link | Desktop server: yes | Not documented |
| **Webflow** (repo 2026-10-06) | A few big tools, each taking a list of actions | Element snapshots, data | Yes, through the "Bridge App" | **Yes, a Designer tab must stay open**; sleeping tabs cause timeouts | Agent changes go to the activity log; editing together not addressed |
| **Framer** (2026-10-23) | Not stated | Not stated | Not stated | **No**, online server only | Agent works on a **branch** until published |
| **Paper** (undated) | Small set, including "write HTML into this node" | Selection plus file | **Yes** ("the hero section I have selected") | Yes, the desktop app | "Some visual feedback in Paper" while the agent works |
| **Pencil / pen.dev** (2026-10-13, 10-19) | 4 big tools, including `execute` | App state, style | Yes, in its own composer | Yes, the desktop app | Parallel agents in "Split Work" or "Side by Side" |
| **tldraw** (2026-03-03, 09-22) | MCP App with 3 tools; its own agent writes code against the canvas | Each turn: viewport, **screenshot**, shape data | Viewport | Runs inside the chat (MCP App) | Agents are "embodied" on the canvas: visible location and state, "same cues as human collaborators" |
| **Canva** (undated) | 46 small tools; edits inside a start / perform / commit **transaction** | Design thumbnail | Not stated | No | Transaction; locking not documented |
| **Excalidraw** | MCP App that draws as the agent streams | In chat | No | No | n/a |

**Patterns (inference):**

1. The products with the most control give agents **a few powerful tools** (code or action lists) next to plain read tools, as the talk said.
2. **Every serious one returns a screenshot**, so the agent can check its own work.
3. **Live selection needs a bridge to an open editor** (Webflow, Paper, Pencil, Figma desktop). We already have one: the receiving tab answers over the relay, and `get_selection` gives the selection.
4. **Nobody documents how they handle a person editing the same thing at the same time.** Framer uses branches and Canva uses transactions. Our hash checks plus drafts are already stricter than most.
5. **Only tldraw shows agents on the canvas as presences**, and it does that in its own app, not through an MCP feature. Showing where an agent works is our product's job: clean-up slice 33.

## What agents cannot do that Lex can

Today's MCP server has **36 tools** (the ticket's "12" is out of date; `shared/agent-tool-table.ts`, `docs/mcp.md`):

- 6 reads
- 8 file and page tools
- 15 Media tools
- 4 section and component tools
- 3 request tools

It also has 2 resources and 2 prompts. Gaps, from `docs/NATIVE-PROJECT.md` and the tool table:

| Lex can | Agent today | Matters for |
|---|---|---|
| **See** the page | Only measurements (`inspect_preview`); **no picture of the preview** | Checking its own work (talk: "let agents check their work") |
| See the page at phone and other widths | `inspect_preview` measures only at the width of Lex's editor pane | Checking its own work |
| Point at an element and start a conversation (Ask agent) | Can only answer a pin; **cannot start one** or ask unprompted | Asking both ways |
| See every pin and dismiss one | `wait_for_requests` with `all` lists pins; no dismiss or "I'm on it" | Several agents |
| Show where he is (selection, typing) | **Cannot show where it works** (planned in slice 33) | Seeing agents work |
| Undo, Redo, discard drafts | **No undo or discard**; can only write again | Fixing its own mistakes |
| Save to GitHub, switch branch, see deploy status | None (Save is deliberately Lex's) | Kept as is |
| Upload or fetch new media, add a new YouTube or Vimeo address | Refused on purpose (`OUTSIDE_MEDIA_REFUSED`) | Kept as is |
| Site and Navigation settings, Detach component, Duplicate page, link a word, bold and italic | Only by raw file edits (`edit_file`, `write_file`); no matching tools | Saves tokens and errors |
| Select an element and highlight it for someone | `open_page` shows a page; no "select or flash this element" | Showing its work |

## What our tools and `wait_for_requests` would need

In order of value for Lex's three pains: asking by pin, staying connected, seeing agents work (inference).

1. **A preview picture tool** (for example `screenshot_preview`, page plus width). It returns an image of the preview as the tab renders it, at Lex's width or a phone width. Every canvas MCP has one. How the tab makes the image is a build question.
2. **"Where I'm working" tools** for slice 33's presence: the agent says "on section 1.2 of /about/", and the tab shows it like a Figma cursor. Also a way to say "I'm on this pin" (the pin already shows "seen").
3. **Let agents start a conversation.** An `ask_user` tool that puts a question pin on an element, using the existing pin and answer flow. This is the editor's own version of elicitation, and it works in every app. Real elicitation only shows in Claude Code (terminal), Codex and ChatGPT, not on the pin where Lex looks.
4. **Undo for the agent's own changes:** a `discard_change` tool per edit (by `requestId`).
5. **Keep `wait_for_requests` as the base for every app**, and add per-app upgrades:
   - **Claude Code, long-job wait:** when the app supports the tasks add-on, `wait_for_requests` returns a job ticket, and the result arrives when a pin comes. Claude then "starts on it unprompted" when idle, with no watchdog subagent. Needs: modern 2026-07-28 connections (`handleMcp` already recognises them), the tasks add-on, and somewhere to keep the job. The relay Durable Object already holds waits, and it can keep holding only the wait, not the pin's content. Lex decides on cost.
   - **Progress messages on waits:** let a wait last up to about 4 minutes instead of 25 seconds, which cuts the number of calls. Needs a streamed answer for this one tool instead of plain JSON.
   - **Claude Code channels:** a small local plugin that pushes each pin into the session. Research preview: custom channels need `--dangerously-load-development-channels`, with a warning at every start. The same local helper as ticket 01.
6. **Next step in every reply**, as the talk recommends. We already do this for waits and errors (`waited`, `editorClosedMessage`). Extend it to edit results: "check with `screenshot_preview`, then `reply_to_request`".
7. **Shorter server instructions up front.** Codex reads the first 512 characters as the summary, and Claude Code cuts at 4,096. Put "start with `get_site`; pins come from `wait_for_requests`" first.
8. **Optional MCP App, for Claude desktop and ChatGPT only:** a small "pins and drafts" card or a live preview inside the chat. It must never be required, because Claude Code cannot show it (OpenAI guide: "tools must work without UI").
9. **Missing shortcut tools** (site settings, navigation, detach, duplicate) only if the next rounds of agent work show agents struggling with raw edits. The talk: "anything a user can do, an agent should be able to do"; Anthropic: fewer, clearer tools.

## Extensive MCP or chat panel in the editor: what Lex sees and does

| | Extensive MCP (agent in its own app) | Chat panel in the editor |
|---|---|---|
| **Where Lex types** | In Claude Code, Codex, ChatGPT or Claude desktop, plus pins in the editor | In the editor, beside the page, plus pins |
| **Starting** | Opens his agent app once, connects (OAuth or Connect to MCP), says "watch my editor" | Opens the editor; the panel is there, but it still needs an agent behind it: the local helper from ticket 01, since the hosted tab cannot use his plans |
| **Asking about an element** | Pin in the editor (as today), or "change the hero" in the agent app | Pin, or type in the panel with the selection attached |
| **Seeing agents work** | Drafts appear live in the editor; presence (slice 33) shows where; the agent's own steps show in its app | Same drafts and presence; the steps also scroll in the panel |
| **Answering an agent's question** | On the pin (works everywhere), or in the agent app if it asks there | In the panel or on the pin |
| **Several agents** | Each runs in Lex's app; subagents show there | The panel must show each agent's thread; more for us to build |
| **When the connection drops** | Lex restarts the watch in his app (Claude Code long-job wait or a channel makes this rarer) | The helper restarts it; Lex sees the state in the panel |
| **Cost to us** | Lowest: tools and small server features; no chat UI, no model bills | A chat UI plus the local helper; still no model bills (his plans) |
| **What he gives up** | Two windows; the agent's thinking lives in another app | Less choice of app; we copy what agent apps already do well |

**Inference:** the MCP route gives Lex the strong part of a chat panel (asking in words, seeing the steps) in apps he already uses. The pin covers "about this element". A panel adds one window, but it needs the ticket 01 helper anyway. Since that helper is also what makes pins push into Claude Code, build the helper and the MCP upgrades first, then decide on the panel.

## Sources (checked 2026-10-24)

MCP specification
- Versioning, current version 2026-07-28: https://modelcontextprotocol.io/specification/versioning
- Changelog 2026-07-28 (released 2026-07-28): https://modelcontextprotocol.io/specification/2026-07-28/changelog . Earlier ones: /2025-11-25/changelog, /2025-06-18/changelog, /2025-03-26/changelog
- Schemas by version: https://github.com/modelcontextprotocol/modelcontextprotocol (schema/*/schema.ts)
- Extensions and client matrix (last change 2026-09-28): https://modelcontextprotocol.io/docs/extensions/overview , https://modelcontextprotocol.io/extensions/client-matrix , https://modelcontextprotocol.io/extensions/apps/overview , https://modelcontextprotocol.io/extensions/tasks/overview
- MCP Apps SEP-1865 (Final, created 2025-11-21): https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp ; ext-apps (spec 2026-01-26, v2.0.3 2026-09-25): https://github.com/modelcontextprotocol/ext-apps

Agent apps
- Claude Code MCP: timeouts, 5-minute idle limit, backgrounding after 2 minutes, tasks beta v2.1.304, elicitation in the terminal only, list_changed (undated; read 2026-10-24): https://code.claude.com/docs/en/mcp
- Claude Code channels: stdio, local, research preview, development flag, no acknowledgement (undated; read 2026-10-24): https://code.claude.com/docs/en/channels-reference , https://code.claude.com/docs/en/channels
- Claude connectors, 240 s limit and MCP Apps (undated): https://claude.com/docs/connectors/building ; Bringing MCP 2026-07-28 to Claude (2026-07-28): https://claude.com/blog/bringing-mcp-2026-07-28-to-claude
- Relativity on Claude connectors, third party (2026-06-30): https://help.relativity.com/RelativityOne/Content/Relativity/MCP/Anthropic_Claude.htm
- Codex MCP and config (undated): https://developers.openai.com/codex/mcp , https://developers.openai.com/codex/config-reference ; source and releases v0.141 to v0.164 (2026-06-18 to 2026-10-23), PR #28234 (300 s default, merged 2026-06-15): https://github.com/openai/codex
- OpenAI Apps and plugins (undated): https://developers.openai.com/plugins/build/mcp-server , /plugins/build/chatgpt-ui , /plugins/plan/tools , /plugins/concepts/ui-guidelines

Canvas tools
- Figma: https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/ (undated); https://www.figma.com/blog/the-figma-canvas-is-now-open-to-agents/ (2026-03-24)
- Webflow: https://developers.webflow.com/mcp/reference/overview (undated); https://github.com/webflow/mcp-server (pushed 2026-10-06)
- Framer: https://www.framer.com/mcp/ (2026-10-23); https://www.framer.com/help/articles/use-external-agents-with-framer/ (2026-10-21)
- Paper: https://paper.design/docs/mcp (undated)
- Pencil / pen.dev: https://docs.pencil.dev/getting-started/ai-integration (2026-10-13); https://docs.pencil.dev/core-concepts/ai-agents (2026-10-19)
- tldraw: https://tldraw.dev/blog/tldraw-mcp-app (2026-03-03); https://tldraw.dev/blog/harnessing-the-agents (2026-09-22)
- Canva: https://www.canva.dev/docs/apps/mcp/tools/ (undated)
- Miro: https://developers.miro.com/docs/miro-mcp (2026-10-08)
- Excalidraw: https://github.com/excalidraw/excalidraw-mcp

Design guidance
- Anthropic, Writing effective tools for AI agents (2025-09-11): https://www.anthropic.com/engineering/writing-tools-for-agents
- Anthropic, Building agents that reach production systems with MCP (2026-04-22): https://claude.com/resources/articles/building-agents-that-reach-production-systems-with-mcp

Repo (read 2026-10-24, `dev` at 8dc4fe26): `shared/agent-tool-table.ts`, `shared/agent-requests.ts`, `worker/mcp.ts`, `worker/site-conventions.ts`, `src/agent-prompts.ts`, `docs/mcp.md`, `docs/NATIVE-PROJECT.md`.

**Not confirmed:**
- That Claude Code channels stop working on 2026-07-28 connections. It was reported from the channels page; the reference page I re-read does not mention it.
- ChatGPT's general use of resources and its call time limit.
- Whether Codex can show MCP Apps.
