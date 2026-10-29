import { execFileSync } from "node:child_process";
import { join } from "node:path";

/**
 * The shared kit's folder, for this editor's own helpers and forwarders: the folder the kit launcher picks
 * (`scripts/agents/kit --home`), as for any kit command: a person's KIT_HOME wins, a pinned one `kit update`
 * removed is picked again, else the machine copy or the cache clone. Throws the launcher's RESULT line when
 * there is no kit.
 */
export function kitHomeFolder(env = process.env) {
  try {
    return execFileSync("bash", [join(import.meta.dirname, "kit"), "--home"], { env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
  } catch (error) {
    throw new Error(String(error.stdout ?? "").trim() || "RESULT: fail no Agent Kit (scripts/agents/kit --home failed)");
  }
}
