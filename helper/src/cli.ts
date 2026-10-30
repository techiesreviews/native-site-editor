#!/usr/bin/env node
// editor-helper [mcp-url] [--agent claude|codex|gemini|opencode] [--agent-command "<program and arguments>"] [--max-agents n] [--verbose]
// The token comes from EDITOR_HELPER_TOKEN (Connect to MCP's copied prompt gives the whole command).
import { parseArgs } from "node:util";
import { AGENT_COMMANDS, AGENT_FLAGS, commandName, type PinAgent } from "./agents.ts";
import { HELPER_VERSION, runHelper } from "./helper.ts";
import { DEFAULT_URL, launchAgent, TOKEN_VARIABLE } from "./launch.ts";

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      agent: { type: "string" },
      "agent-command": { type: "string" },
      "max-agents": { type: "string" },
      verbose: { type: "boolean", default: false },
      version: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.version) { console.log(HELPER_VERSION); return; }
  if (values.help) {
    console.log(`editor-helper [mcp-url]: starts Claude Code for each pin of your site.
The token comes from ${TOKEN_VARIABLE}; Connect to MCP in the editor copies the whole command.
  --agent claude|codex|gemini|opencode  start this agent instead
  --agent-command "<command>"  start this ACP agent for every pin instead
  --max-agents <n>             at most this many agents at once (default 3)
  --verbose                    show the agents' own logs`);
    return;
  }
  const token = process.env[TOKEN_VARIABLE];
  if (!token) { console.error(`Set ${TOKEN_VARIABLE}: choose Connect to MCP in the editor, which copies the whole command.`); process.exitCode = 1; return; }
  const custom = values["agent-command"]?.trim().split(/\s+/);
  if (custom && !custom[0]) { console.error("--agent-command needs a command."); process.exitCode = 1; return; }
  const agent = values.agent === undefined ? undefined : AGENT_FLAGS[values.agent.trim().toLowerCase()];
  if (values.agent !== undefined && !agent) { console.error(`--agent is one of ${Object.keys(AGENT_FLAGS).join(", ")}.`); process.exitCode = 1; return; }
  const stopping = new AbortController();
  process.once("SIGINT", () => stopping.abort());
  process.once("SIGTERM", () => stopping.abort());
  const why = await runHelper({
    url: positionals[0] ?? DEFAULT_URL,
    token,
    ...(agent ? { agent } : {}),
    launch: (program: PinAgent) => launchAgent(custom ?? AGENT_COMMANDS[program], values.verbose),
    // A custom program works under its own name.
    ...(custom ? { agentName: commandName(custom) } : {}),
    ...(values["max-agents"] ? { maxAgents: Math.max(1, Number(values["max-agents"]) || 3) } : {}),
    log: line => console.error(`[editor-helper] ${line}`),
    signal: stopping.signal,
  });
  if (/refused|ended|cannot take pins/.test(why)) process.exitCode = 1;
}

await main().catch((error: unknown) => {
  console.error(`[editor-helper] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
