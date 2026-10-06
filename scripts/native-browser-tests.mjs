import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fixtureKind } from "../tests/native-save/fixture-contract.ts";

// The native save suite in three fixture groups, chosen by the specs' own
// Playwright tags: `@actual` needs the actual starter, `@native-static` the
// native static starter (a spec can carry both); the default group is
// everything else.
const grep = {
  default: ["--grep-invert", "@actual|@native-static"],
  actual: ["--grep", "@actual"],
  "native-static": ["--grep", "@native-static"],
};
const tagged = (name, tag) => readFileSync(`tests/native-save/${name}`, "utf8").includes(`"${tag}"`);
const inGroup = (name, group) => group === "default"
  ? !tagged(name, "@actual") && !tagged(name, "@native-static")
  : tagged(name, `@${group}`);

const args = process.argv.slice(2);
const group = args.shift();
try {
  if (!Object.hasOwn(grep, group)) throw new Error("Choose default, actual, or native-static.");
  const env = { ...process.env };
  // Files holding at least one test of the group (a file can mix groups; the grep picks the tests).
  let files = readdirSync("tests/native-save").filter(name => name.endsWith(".spec.ts")).sort().filter(name => inGroup(name, group));
  const forwarded = [];
  let check = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--check") check = true;
    else if (arg === "--port") {
      const value = args[++i];
      if (!value) throw new Error("--port requires an integer from 1 to 65535.");
      env.ASE_TEST_PORT = value;
    }
    else if (arg === "--spec") {
      const pattern = args[++i];
      if (!pattern) throw new Error("--spec requires a filename substring.");
      files = files.filter(name => name.includes(pattern));
    } else forwarded.push(arg);
  }
  // Creation starts from the demo account, independent of the archived preview fixture.
  const creationOnly = group === "native-static" && files.length === 1 && files[0] === "native-static-starter-create.spec.ts";
  env.ASE_NATIVE_SAVE_FIXTURE ??= group === "actual" ? "fixtures/actual-starter" : group === "native-static" && !creationOnly ? ".scratch/native-static-preview" : "fixtures/native-starter";
  if (group === "native-static") {
    if (!creationOnly) env.STATIC_SECTIONS_FIXTURE ??= "native";
    env.ASE_NATIVE_STARTER_SOURCE ??= "native-static";
    if (env.ASE_NATIVE_STARTER_SOURCE !== "native-static") throw new Error("Native static tests require ASE_NATIVE_STARTER_SOURCE=native-static.");
  }
  if (fixtureKind(env) !== (creationOnly ? "default" : group)) throw new Error(`Selected ${group} command does not match ASE_NATIVE_SAVE_FIXTURE. Use the matching test:browser command or unset the conflicting environment.`);
  if (!files.length) throw new Error("No specs match this fixture group and --spec selection.");
  if (env.ASE_TEST_PORT && (!/^\d+$/.test(env.ASE_TEST_PORT) || +env.ASE_TEST_PORT < 1 || +env.ASE_TEST_PORT > 65535)) throw new Error("--port must be an integer from 1 to 65535.");
  if (check) {
    console.log(`Fixture: ${group} (${resolve(env.ASE_NATIVE_SAVE_FIXTURE)})\n${grep[group].join(" ")}\n${files.join("\n")}`);
  } else {
    if (!forwarded.includes("--list") && !existsSync(resolve(env.ASE_NATIVE_SAVE_FIXTURE))) throw new Error(`Fixture does not exist: ${resolve(env.ASE_NATIVE_SAVE_FIXTURE)}. --check can inspect the selection without a server.`);
    // Only the group's files load: a spec may refuse another group's fixture at import.
    const paths = files.map(name => `tests/native-save/${name}`);
    const result = spawnSync(process.execPath, [createRequire(import.meta.url).resolve("@playwright/test/cli"), "test", "--project=native-save", ...grep[group], ...paths, ...forwarded], { env, stdio: "inherit" });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
} catch (error) {
  console.error(`Browser fixture contract: ${error.message}`);
  process.exitCode = 1;
}
