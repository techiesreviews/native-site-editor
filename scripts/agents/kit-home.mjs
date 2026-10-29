import { execFileSync } from "node:child_process";
import { join } from "node:path";

/**
 * The shared kit's folder, for this editor's own helpers and forwarders: KIT_HOME when a kit front door or a
 * person set it, else the folder the kit launcher picks (`scripts/agents/kit --home`: the machine copy, or
 * the cache clone it makes). Throws the launcher's RESULT line when there is no kit.
 */
export function kitHomeFolder(env = process.env) {
  if (env.KIT_HOME) return env.KIT_HOME;
  try {
    return execFileSync("bash", [join(import.meta.dirname, "kit"), "--home"], { env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
  } catch (error) {
    throw new Error(String(error.stdout ?? "").trim() || "RESULT: fail no Agent Kit (scripts/agents/kit --home failed)");
  }
}
