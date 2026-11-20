// The helper's token comes from a file only its owner can read (TOOLS-270), so it never sits on a command line, in
// shell history or in a user service's settings. Connect to MCP's copied prompt saves it there first.
import { closeSync, fstatSync, openSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** `~/.config/editor-helper/token`, where the copied prompt saves the token (`HELPER_TOKEN_FILE` in src/agent-prompts.ts). */
export function defaultTokenFile() {
  return join(homedir(), ".config", "editor-helper", "token");
}

/** The token in `file`, or one line saying why there is none and how to save it. The token itself is never in the line. */
export function readToken(file: string): { token: string } | { error: string } {
  const none = { error: `No token in ${file}. Choose Connect to MCP in the editor, whose copied prompt saves it there, or run (umask 077 && mkdir -p "${dirname(file)}" && rm -f "${file}" && cat > "${file}"), paste the token, then press Enter and Ctrl+D.` };
  let descriptor: number;
  try { descriptor = openSync(file, "r"); } catch { return none; }
  try {
    // Like ssh with a key: a file other users can read or change is refused. The mode is the open file's own.
    if (process.platform !== "win32" && fstatSync(descriptor).mode & 0o077) return { error: `${file} can be read or changed by other users: run chmod 600 ${file}` };
    const token = readFileSync(descriptor, "utf8").trim();
    return token ? { token } : none;
  } catch { return none; } finally { closeSync(descriptor); }
}
