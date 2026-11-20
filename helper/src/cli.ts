#!/usr/bin/env node
// editor-helper [mcp-url] [--token-file <path>] [--agent claude|codex|gemini|opencode] [--agent-command "<program and arguments>"] [--max-agents n] [--verbose]
// The token comes from a file only its owner can read, ~/.config/editor-helper/token by default (src/token.ts);
// Connect to MCP's copied prompt saves it there and gives the start command.
import { parseArgs } from "node:util";
import { AGENT_COMMANDS, AGENT_FLAGS, commandName, type PinAgent } from "./agents.ts";
import { HELPER_VERSION, runHelper } from "./helper.ts";
import { DEFAULT_URL, launchAgent } from "./launch.ts";
import { defaultTokenFile, readToken } from "./token.ts";

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "token-file": { type: "string" },
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
The token comes from ${defaultTokenFile()}, which only you may read; Connect to MCP in the editor copies a prompt that saves it there.
  --token-file <path>          read the token from this file instead
  --agent claude|codex|gemini|opencode  start this agent instead
  --agent-command "<command>"  start this ACP agent for every pin instead
  --max-agents <n>             at most this many agents at once (default 3)
  --verbose                    show the agents' own logs`);
    return;
  }
  const read = readToken(values["token-file"] ?? defaultTokenFile());
  if ("error" in read) { console.error(read.error); process.exitCode = 1; return; }
  const custom = values["agent-command"]?.trim().split(/\s+/);
  if (custom && !custom[0]) { console.error("--agent-command needs a command."); process.exitCode = 1; return; }
  const agent = values.agent === undefined ? undefined : AGENT_FLAGS[values.agent.trim().toLowerCase()];
  if (values.agent !== undefined && !agent) { console.error(`--agent is one of ${Object.keys(AGENT_FLAGS).join(", ")}.`); process.exitCode = 1; return; }
  const most = values["max-agents"] === undefined ? undefined : Number(values["max-agents"]);
  if (most !== undefined && !(Number.isInteger(most) && most >= 1)) { console.error("--max-agents is a whole number, 1 or more."); process.exitCode = 1; return; }
  // A closed terminal makes writing the log fail (EIO, EPIPE): the pins are still answered.
  process.stderr.on("error", () => {});
  const stopping = new AbortController();
  // Ctrl+C, a stop, and a closed terminal (SIGHUP) all end the helper the same way: each unfinished pin hears it.
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.once(signal, () => stopping.abort());
  const end = await runHelper({
    url: positionals[0] ?? DEFAULT_URL,
    token: read.token,
    ...(agent ? { agent } : {}),
    launch: (program: PinAgent) => launchAgent(custom ?? AGENT_COMMANDS[program], values.verbose),
    // A custom program works under its own name.
    ...(custom ? { agentName: commandName(custom) } : {}),
    ...(most ? { maxAgents: most } : {}),
    log: line => console.error(`[editor-helper] ${line}`),
    signal: stopping.signal,
  });
  if (end.failed) process.exitCode = 1;
}

await main().catch((error: unknown) => {
  console.error(`[editor-helper] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
