// The helper's token comes from a file only its owner can read (TOOLS-270), so it never sits on a command line, in
// shell history or in a user service's settings. Connect to MCP's copied prompt saves it there first.
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** `~/.config/editor-helper/token`, where the copied prompt saves the token (`HELPER_TOKEN_FILE` in src/agent-prompts.ts). */
export function defaultTokenFile() {
  return join(homedir(), ".config", "editor-helper", "token");
}

/** The token in `file`, or one line saying why there is none. The token itself is never in the line. */
export function readToken(file: string): { token: string } | { error: string } {
  const none = { error: `No token in ${file}: choose Connect to MCP in the editor, whose copied prompt saves it there.` };
  let text: string;
  try { text = readFileSync(file, "utf8"); } catch { return none; }
  // Like ssh with a key: a file other users can read is refused.
  if (process.platform !== "win32" && statSync(file).mode & 0o077) return { error: `${file} can be read by other users: run chmod 600 ${file}` };
  const token = text.trim();
  return token ? { token } : none;
}
