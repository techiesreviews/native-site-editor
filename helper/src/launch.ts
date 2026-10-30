// Starting an agent's ACP program for the helper (src/cli.ts).
import { spawn } from "node:child_process";
import type { AgentProcess } from "./helper.ts";

export const TOKEN_VARIABLE = "EDITOR_HELPER_TOKEN";
export const DEFAULT_URL = "https://editor.techies.tools/mcp";

/** Starts an agent's ACP program with its own stdin and stdout; the token stays out of its environment. */
export function launchAgent(command: string[], verbose = false): AgentProcess {
  const env = { ...process.env };
  delete env[TOKEN_VARIABLE];
  const child = spawn(command[0], command.slice(1), { stdio: ["pipe", "pipe", verbose ? "inherit" : "ignore"], env });
  // A program that cannot start, or that stops while the helper still writes to it (EPIPE), ends its connection only.
  child.on("error", () => child.stdout.destroy());
  child.stdin.on("error", () => child.stdout.destroy());
  return { input: child.stdout, output: child.stdin, stop: () => { child.stdin.end(); child.kill(); } };
}
