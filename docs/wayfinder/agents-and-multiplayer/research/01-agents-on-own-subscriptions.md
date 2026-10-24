# Agents on Lex's own subscriptions (research, 2026-10-24)

For [Find how the editor can drive agents on Lex's own subscriptions](../tickets/01-research-agents-on-own-subscriptions.md). Facts checked on 2026-10-24 against the providers' own docs; sources and dates at the end.

## Short answer

- **Yes, with a small helper program on Lex's computer.** It starts Claude Code and Codex for him, each signed in with his own subscription, and they reach the site through the editor's existing MCP server. Both providers allow this for one person on their own machine.
- **The hosted editor cannot use a subscription by itself.** Anthropic forbids websites from offering Claude sign-in. OpenAI's "use your ChatGPT plan in other apps" scheme covers open-source apps that run on the user's machine; a hosted website needs OpenAI's approval first. So the subscription always lives in the helper (or in Claude's and OpenAI's own apps), never in the editor tab.
- **Best way to join the editor and the helper:** the helper connects out to the editor's Worker, the same way the editor tab already does. The browser never has to talk to Lex's computer directly, which Safari blocks and Chrome only allows after a permission prompt.
- **ChatGPT can already use the editor's MCP server** as a custom plugin, in ChatGPT's own window. Whether writing (not just reading) works on Lex's $20 Plus plan has to be tried on his account. ChatGPT only acts when Lex types, so it cannot watch for pins.
- **Several agents at once:** Claude Code and Codex both run subagents and report each one's progress in their event streams. A helper can pass that progress on to the editor.
- **Cost:** nothing beyond the plans Lex already pays for. Several agents use up the plan's limits faster.

## The options at a glance

| # | Option | Verdict |
|---|--------|---------|
| A | Helper on Lex's computer that connects out to the editor's Worker | Works today (needs building) |
| B | Helper that the editor tab reaches directly on localhost | Works with limits (Chrome prompts; Safari blocks) |
| C | ACP adapters inside the helper (one protocol for Claude, Codex, Gemini, OpenCode) | Works today |
| D | Claude Code "channels": push pin requests into Lex's open Claude Code session | Works with limits (research preview; a warning screen at every start) |
| E | Claude "Remote Control": steer local Claude Code from claude.ai or a phone | Works today, but in Claude's app, not the editor |
| F | ChatGPT drives the editor's MCP server (custom MCP plugin) | Works with limits |
| G | ChatGPT plan inside our own chat ("Sign in with ChatGPT") | Works with limits (inside the helper only) |
| H | Claude or ChatGPT subscription used straight from the hosted editor tab | Not possible |

## A. Helper that connects out to the editor's Worker (recommended)

**What it is.** A small program on Lex's computer (the "helper"). It signs in to the editor once and keeps a connection to the editor's Worker open, as an editor tab does today with `worker/agent-relay.ts`. When Lex asks for something in the editor (a pin, or a chat line), the Worker passes it to the helper. The helper starts Claude Code or Codex on his subscription, gives it the editor's MCP address (`worker/mcp.ts`), and sends progress back. The agents edit the site through the MCP tools they use today (`get_site`, `write_file`, `reply_to_request`, ...), so drafts still show up in the editor as now.

**Why it works.** Claude Code runs headless with `claude -p` or the Claude Agent SDK (TypeScript/Python), streaming events as JSON lines. Codex runs headless with `codex exec --json`, the Codex SDK, or `codex app-server` (the JSON-RPC protocol behind its VS Code extension). Both sign in with the subscription through their own login, and the helper never touches the passwords or tokens.

**It also fixes "the connection doesn't stay up".** Today a chat agent has to keep a "watchdog" subagent calling `wait_for_requests` (`src/agent-prompts.ts`). The helper can do that waiting itself, always, and start a fresh agent for each pin. Nothing then depends on a chat session staying alive.

**Several agents and progress.** The helper can run several Claude or Codex processes side by side, and each can start subagents.
- Claude: in the `stream-json` output, each subagent's messages carry `parent_tool_use_id`, so the helper can tell which subagent did what, nested at any depth. Add `--forward-subagent-text` to get their text as well.
- Codex: `codex exec --json` streams `thread.*`, `turn.*` and `item.*` events (commands, file changes, tool calls). App-server marks subagent threads (`subAgent`, `parentThreadId`).
- The helper turns these into one "who is doing what" feed for the editor. Each agent's MCP calls already show where it works on the page (slice 33, agent presence).

**Set-up for a non-technical user (target):**
1. Install Claude Code and/or Codex, and sign in once in each (a browser window opens and you sign in with your Claude or ChatGPT account).
2. Install the helper: one download or one copied command.
3. In the editor, choose "Connect this computer" and approve it once in the browser.
4. Leave the helper running. Agents work only while the computer is on, which Lex has said is fine.

**Cost.** Free to run. Uses Lex's Claude and ChatGPT plan limits. The Worker connection uses a little Durable Object time, like a tab does today; that is a budget number for the "cheapest" decision, not a blocker.

**Limits and risks.**
- Agents run with Lex's file and shell rights on his machine. The helper should start them in a locked-down permission mode (e.g. `--permission-mode` with a short `--allowedTools` list, and `--bare` so the user's own hooks and plugins don't load) and send any approval prompts to the editor.
- Anthropic warns that `--bare` skips the subscription login and needs an API key, so a subscription helper runs without `--bare` and limits tools another way.
- Anthropic's billing for scripted use may change (see Terms).

## B. Helper reached directly from the editor tab on localhost

**What it is.** The helper listens on `127.0.0.1`, and the editor tab connects to it with fetch or a WebSocket.

**Verdict: works with limits.**
- **Chrome / Edge:** since Chrome 142, a public site asking for `localhost` shows a "Local Network Access" permission prompt (fetch and page loads). Reports from vendors say WebSockets have been covered too since Chrome 147 (April 2026). Lex clicks Allow once per site.
- **Safari:** treats `http://localhost` from an `https` page as mixed content and upgrades or blocks it. That WebKit bug has stayed open since 2023. WebKit is building its own local-network check (July 2026 work), with no prompt shipped yet. **The editor tab cannot reliably reach the helper in Safari.**
- **Firefox:** rolling out its own local-network rules.
- The helper must still check where requests come from (only the editor's own address) and be paired (a one-time code), or any website Lex visits could try to drive his agents.

Option A avoids all of this, so B is only a fallback, or a speed-up for Chrome.

## C. Agent Client Protocol (ACP) adapters inside the helper

**What it is.** ACP is an open protocol (JSON-RPC over stdio) between an editor and a coding agent, used by Zed, JetBrains, Obsidian plugins and others. There are official adapters: `@agentclientprotocol/claude-agent-acp` (built on the Claude Agent SDK) and `@agentclientprotocol/codex-acp` (built on Codex app-server). Gemini CLI, OpenCode and Pi speak it too.

**Verdict: works today.** The helper can speak ACP to every agent instead of learning each tool's own stream. Both adapters report tool calls, plans/to-do lists, permission requests and **subagents as their own child sessions** with states (`running`, `requires_action`, `idle`). That is exactly what "see each agent working" needs. Each agent keeps its own login and billing (Zed's docs say the same), so subscriptions work as they do in the terminal.

**Limits.** ACP has no browser transport yet (HTTP is "draft in progress"), so it lives between the helper and the agents, not in the editor tab. The adapters change fast; pin their versions.

## D. Claude Code "channels" (Claude only)

**What it is.** A channel is a small MCP server, started by Claude Code, that **pushes** messages into a Claude Code session that is already open. It can also send replies back and pass approval prompts to another screen. Anthropic ships Telegram, Discord, iMessage and a localhost demo chat ("fakechat").

**Verdict: works with limits.** An editor channel could push each pin straight into Lex's open Claude Code session, with no watchdog polling. But:
- It is a **research preview**. Custom channels are not on Anthropic's allowed list, so they need `--dangerously-load-development-channels`. That shows a full-screen warning at every start and **only works in an interactive terminal session**, not in `-p` or the SDK.
- It is Claude only, needs a terminal left open, and events queue while Claude is busy.

Worth watching. If Anthropic opens the allowed list, this becomes a neat "pins go straight to Claude" path for people who already keep Claude Code open.

## E. Claude Remote Control (Claude only)

**What it is.** `claude remote-control` lets Lex steer Claude Code sessions on his computer from claude.ai/code or the Claude phone app. Up to 32 sessions at once by default, each optionally in its own git worktree. Subagent progress shows on every device.

**Verdict: works today, but not in our editor.** It needs a Pro or Max subscription (API keys are not supported), and only Anthropic's apps can be the screen. Useful as a companion (watch agents from the phone), but it does not give the editor a chat.

## F. ChatGPT drives the editor's MCP server

**What it is.** ChatGPT (web) can add a custom MCP server as a personal plugin: Plugins → + → Add custom MCP server → our `/mcp` URL → OAuth. Our server already offers OAuth discovery and dynamic client registration (`worker/oauth.ts`), which ChatGPT supports. Our tools already carry `readOnlyHint`, which ChatGPT uses to decide which calls need confirming.

**Verdict: works with limits.**
- **Plan:** OpenAI's help page documents full read-and-write MCP for Business, Enterprise and Edu. Reports disagree on whether Plus and Pro get write tools or only read and fetch. **Try it on Lex's Plus account before relying on it.** Free plans cannot add custom servers.
- **Confirmations:** every write tool asks for confirmation unless Lex ticks "remember" for that conversation.
- **No watching:** ChatGPT only acts when Lex sends a message, so it cannot keep a watchdog running for pins. OpenAI's new "MCP Events" could later let ChatGPT subscribe to pin requests by webhook. It needs the newer MCP protocol version (2026-07-28; our server speaks 2025-11-25) and works in ChatGPT "Work" chats only.
- **Where it shows:** in ChatGPT's window, not inside the editor.

**Set-up:** about five clicks in ChatGPT plus signing in to the editor. **Cost:** included in Plus.

## G. ChatGPT plan inside our own chat ("Sign in with ChatGPT")

**What it is.** OpenAI now lets apps use a person's ChatGPT plan for AI requests through "Sign in with ChatGPT", plan usage part. It is open to **all open-source apps and locally run personal apps** for Plus and Pro users; paid or remotely hosted apps must apply through an interest form. Usage counts against the plan's included ChatGPT Work and Codex usage, and the user can set a weekly limit per app.

**Verdict: works with limits.** Our editor is open source, but the hosted editor is a remotely hosted app, so it needs OpenAI's approval. The sign-in must also return to a `127.0.0.1` loopback address, so in practice **it runs in the helper**. Preview rules: requests only through the Responses API, no hosted MCP tools (the helper would pass our MCP tools as its own function tools), streaming only.

Simpler route to the same result: let the helper run Codex, which already signs in with ChatGPT and includes `codex exec`, the SDK and app-server on Plus. OpenAI even documents running app-server on a "Sign in with ChatGPT" token.

## H. Subscription used straight from the hosted editor tab

**Verdict: not possible.**
- Anthropic: "Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, or Max plan credentials on behalf of their users", and apps may not collect or hold Claude sign-in tokens.
- OpenAI: hosted apps need approval (see G), and the sign-in needs a loopback callback.

Aside, out of scope for this map (agents without Lex's computer): since 2026-10-07, Claude **Max** plans include $100 (Max 5x) or $200 (Max 20x) a month of Claude API credits that cover the Agent SDK. A hosted chat on Lex's own API key would cost nothing extra up to that amount. Pro plans get no credits.

## Terms in plain words

**Anthropic (Claude Pro/Max).**
- Allowed: Lex running the official, unmodified `claude` program on his own machine, signed in with his own plan, driven by the Agent SDK or `claude -p`. Anthropic's terms page says nothing prevents "an end user from signing in to the unmodified Claude Code binary with their own Claude subscription". Its plan limits "assume ordinary, individual usage of Claude Code and the Agent SDK". The support page (update 2026-10-07): "You can still use the Claude Agent SDK, `claude -p`, and third-party apps with your subscription limits."
- Not allowed: our product offering Claude sign-in, handling Claude tokens, or using one person's plan for others. A self-hoster's helper is fine as long as each person signs in to Claude themselves.
- Naming: we may say "runs Claude Code", or label it "Claude Agent". We may not call our feature "Claude Code" or copy its look.
- Risk: in May 2026 Anthropic announced moving scripted use (`claude -p`, Agent SDK) to a separate monthly credit, then paused it on 2026-06-15, promising notice before any new plan. In April 2026 it stopped plans covering harnesses that use Claude tokens directly (e.g. OpenClaw); using the official `claude` program is not affected.
- The consumer terms (2025-10-08) ban scripted access "except ... where we otherwise explicitly permit it". The Claude Code docs above are that permission.

**OpenAI (ChatGPT Plus $20, Pro from $100).**
- Allowed: Codex signed in with ChatGPT, including `codex exec`, the SDK and app-server, on Plus and up. Open-source and local apps using "Sign in with ChatGPT" plan usage. Custom MCP plugins in ChatGPT, within the plan rules in F.
- Not allowed: sharing the account, and scripted scraping of ChatGPT outside these programmes (Terms of Use). A hosted app using the plan without approval.

## Several agents at once: how each option reports progress

| Option | Several agents | How progress reaches us |
|--------|----------------|-------------------------|
| Claude Code (`-p` / Agent SDK) | Subagents in one session; several sessions side by side; worktrees keep their files apart | `stream-json` lines; subagent messages tagged with `parent_tool_use_id`; `system/init`, retry and permission events |
| Codex (`exec` / SDK / app-server) | Subagents on by default in current releases; several processes | JSONL `item.*` events; app-server `item/started`, `item/agentMessage/delta`, subagent threads with `parentThreadId` |
| ACP adapters | Subagents as child sessions | `session/update` with tool calls, plans, `subagent_update` states |
| Channels / Remote Control | One session per channel; Remote Control up to 32 | Shown in Claude's own apps only |
| ChatGPT plugin | Subagents in ChatGPT Work | Shown in ChatGPT only; to the editor only through MCP calls |

Whatever the option, every agent that edits through our MCP server already tells the editor where it is working. The helper adds the running list and status lines.

## Suggested next steps (for the grilling tickets)

1. Treat **A + C** (helper connecting out to the Worker, ACP inside) as the main candidate for "a chat connected to a local subscription". Decide in [05](../tickets/05-grill-several-agents-at-once.md) and [06](../tickets/06-grill-asking-with-a-pin.md) whether the helper also becomes the always-on pin watcher.
2. Have Lex try **F** on his Plus account (add our `/mcp` as a custom plugin, attempt a write) to settle the plan question.
3. Keep **D** (channels) and OpenAI **MCP Events** on a watch list. Both would let pins be pushed instead of polled.

## Sources (all read 2026-10-24 unless dated otherwise)

- Anthropic, Claude Code docs: [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance) (authentication and credential use; offering Claude Code in products; naming).
- Anthropic, [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) (no claude.ai login for third-party products; branding).
- Anthropic, [Run Claude Code programmatically](https://code.claude.com/docs/en/headless) (`-p`, `stream-json`, `parent_tool_use_id`, `--bare` needs an API key, permission flags).
- Anthropic, [Run agents in parallel](https://code.claude.com/docs/en/agents) (subagents, agent view, agent teams, workflows).
- Anthropic, [Channels](https://code.claude.com/docs/en/channels) and [Channels reference](https://code.claude.com/docs/en/channels-reference) (research preview; development flag only in interactive sessions; permission relay).
- Anthropic, [Remote Control](https://code.claude.com/docs/en/remote-control) (Pro/Max/Team/Enterprise, no API keys; `--capacity` default 32).
- Anthropic support, [Use the Claude Agent SDK with your Claude plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) (pause notice 2026-06-15; update 2026-10-07).
- Anthropic, [API credits for Max and Team plans](https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers) ($100/$200 monthly; covers the Agent SDK, not Claude Code).
- Anthropic, [Consumer Terms](https://www.anthropic.com/legal/consumer-terms) (effective 2025-10-08; automated access clause). [Claude pricing](https://claude.com/pricing) (Pro $20 monthly, Max from $100).
- Zed, [What Anthropic's new Claude billing means for Zed users](https://zed.dev/blog/anthropic-subscription-changes) (2026-05-14, updated 2026-06-16); [External agents](https://zed.dev/docs/ai/external-agents) and [Use an existing subscription](https://zed.dev/docs/ai/use-an-existing-subscription).
- OpenAI, [Codex app-server](https://learn.chatgpt.com/docs/app-server); [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk); [Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode); [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents); [Authentication](https://learn.chatgpt.com/docs/auth); [Pricing](https://learn.chatgpt.com/docs/pricing).
- OpenAI, Sign in with ChatGPT: [Quickstart](https://developers.openai.com/siwc/quickstart), [ChatGPT plan usage overview](https://developers.openai.com/siwc/token-sharing-open-source), [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) (loopback `127.0.0.1` callback), [Codex app-server with a plan token](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server), [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations); cookbook [Sign in with ChatGPT](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt) (hosted apps: waitlist); help article [Using your ChatGPT plan in other apps and sites](https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites) (seen through search; direct fetch refused).
- OpenAI, [Add custom MCP server](https://developers.openai.com/api/docs/guides/custom-mcp-server); [Plugins quickstart](https://developers.openai.com/plugins/quickstart); [Plugin authentication](https://developers.openai.com/plugins/build/auth); [MCP Events](https://developers.openai.com/plugins/build/mcp-events); [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels); help article [Developer mode and MCP apps in ChatGPT](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt) (plan section not readable; Plus/Pro write access unconfirmed).
- OpenAI, [Terms of Use](https://openai.com/policies/terms-of-use/) (credential sharing, automated extraction; read through search copies, direct fetch refused).
- Agent Client Protocol: [Transports](https://agentclientprotocol.com/protocol/v2/transports), [Agents](https://agentclientprotocol.com/get-started/agents), [Clients](https://agentclientprotocol.com/get-started/clients); adapters [claude-agent-acp](https://github.com/zed-industries/claude-agent-acp) and [codex-acp](https://github.com/agentclientprotocol/codex-acp) (READMEs).
- Chrome, [Local Network Access](https://developer.chrome.com/blog/local-network-access) (2025-06-09, updated 2025-09-29: prompt in Chrome 142); Chromium [Intent to Ship](https://groups.google.com/a/chromium.org/g/blink-dev/c/cwu_RUmBpzY/m/JWenvGViCAAJ) (WebSockets later); WebSockets in Chrome 147 per [Citrix CTX696569](https://support.citrix.com/external/article/CTX696569/chrome-147-and-edge-147-local-network-ac.html) and [QZ Tray](https://qz.io/docs/lna) (secondary).
- WebKit, [bug 250776](https://bugs.webkit.org/show_bug.cgi?id=250776) (Safari upgrades or blocks localhost from https pages; open since 2023-01-18); local-network check work, July 2026: [bug 319907](https://www2.webkit.org/show_bug.cgi?id=319907).
- Repo: `worker/mcp.ts` (tools with `readOnlyHint`), `worker/oauth.ts` (OAuth discovery, dynamic client registration), `worker/agent-relay.ts` (tab relay, `wait_for_requests` limits), `src/agent-prompts.ts` (watchdog prompt).
