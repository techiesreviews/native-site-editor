// Starting an agent's ACP program for the helper (src/cli.ts).
import { spawn } from "node:child_process";
import type { AgentProcess } from "./helper.ts";

export const DEFAULT_URL = "https://editor.techies.tools/mcp";

/** Starts an agent's ACP program with its own stdin and stdout. The token is in no environment: the helper reads it from its file. */
export function launchAgent(command: string[], verbose = false): AgentProcess {
  // Its own process group: Ctrl+C in the helper's terminal reaches the helper alone, which then stops the agents.
  const child = spawn(command[0], command.slice(1), { stdio: ["pipe", "pipe", verbose ? "inherit" : "ignore"], detached: true });
  // A program that cannot start, or that stops while the helper still writes to it (EPIPE), ends its connection only.
  child.on("error", () => child.stdout.destroy());
  child.stdin.on("error", () => child.stdout.destroy());
  const stop = () => {
    child.stdin.end();
    // The whole group: an npx wrapper and the agent it started.
    try { if (child.pid) process.kill(-child.pid, "SIGTERM"); } catch { child.kill(); }
  };
  return { input: child.stdout, output: child.stdin, stop };
}
