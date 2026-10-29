import { execFileSync } from "node:child_process";
import { join } from "node:path";

let picked;

/**
 * The shared kit's folder, for this editor's own helpers and forwarders: the folder the kit launcher picks
 * (`scripts/agents/kit --home`), as for any kit command: a person's KIT_HOME wins, a pinned one `kit update`
 * removed is picked again, else the machine copy or the cache clone. Looked up once per process (for the
 * process's own environment), so one command never mixes two kits. Throws the launcher's RESULT line when
 * there is no kit.
 */
export function kitHomeFolder(env = process.env) {
  if (env === process.env && picked !== undefined) return picked;
  let home;
  try {
    home = execFileSync("bash", [join(import.meta.dirname, "kit"), "--home"], { env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
  } catch (error) {
    throw new Error(String(error.stdout ?? "").trim() || "RESULT: fail no Agent Kit (scripts/agents/kit --home failed)");
  }
  if (env === process.env) picked = home;
  return home;
}

/**
 * `env` handing the kit `kitHomeFolder` picked to a child, as the shell forwarders do: KIT_HOME is that kit, and a
 * kit the launcher picked keeps its marker (KIT_HOME_PINNED), so the child and everything below it never look up
 * `current` again; a person's KIT_HOME stays theirs.
 */
export function kitChildEnv(home, env = process.env) {
  const picked = !env.KIT_HOME || env.KIT_HOME === env.KIT_HOME_DEFAULT || env.KIT_HOME === env.KIT_HOME_PINNED;
  return picked ? { ...env, KIT_HOME: home, KIT_HOME_PINNED: home } : { ...env, KIT_HOME: home };
}

/** The kit's library this editor's own helpers load: KIT_LIB_MJS (tests), else the picked kit's kit-lib.mjs. */
export function kitLibrary(env = process.env) {
  return env.KIT_LIB_MJS || join(kitHomeFolder(env), "kit-lib.mjs");
}

/** kitLibrary, or the launcher's RESULT line and exit 2 when there is no kit (never a stack trace). */
export function kitLibraryOrExit(env = process.env) {
  try { return kitLibrary(env); }
  catch (error) { console.log(error.message); process.exit(2); }
}

/** The kit's bash library, as kit shots sources it: KIT_LIB (tests), else the picked kit's kit-lib.sh. */
export function kitShellLibrary(env = process.env) {
  return env.KIT_LIB || join(kitHomeFolder(env), "kit-lib.sh");
}
