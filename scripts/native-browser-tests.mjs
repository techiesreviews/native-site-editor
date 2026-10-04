import { readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fixtureKind } from "../tests/native-save/fixture-contract.ts";

const actualOnly = new Set([
  "native-card-paths-json.spec.ts", "native-card-paths-starter.spec.ts",
  "native-editor-json.spec.ts", "native-editor-json-lifecycle.spec.ts",
  "native-manual-collection.spec.ts", "native-static-section-save-host.spec.ts",
  "native-social-preview.spec.ts", "native-fields-migration.spec.ts",
  "native-static-sections-host.spec.ts", "native-structure-readiness.spec.ts",
]);
const args = process.argv.slice(2);
const group = args.shift();
try {
  if (!["default", "actual", "native-static"].includes(group)) throw new Error("Choose default, actual, or native-static.");
  const env = { ...process.env };
  env.ASE_NATIVE_SAVE_FIXTURE ??= group === "actual" ? "fixtures/actual-starter" : group === "native-static" ? ".scratch/native-static-preview" : "fixtures/native-starter";
  if (group === "native-static") env.STATIC_SECTIONS_FIXTURE ??= "native";
  if (fixtureKind(env) !== group) throw new Error(`Selected ${group} command does not match ASE_NATIVE_SAVE_FIXTURE. Use the matching test:browser command or unset the conflicting environment.`);
  let files = readdirSync("tests/native-save").filter(name => name.endsWith(".spec.ts")).sort().filter(name => {
    const actual = actualOnly.has(name) || /-actual\.spec\.ts$/.test(name);
    return group === "default" ? !actual : group === "actual" ? actual : name === "native-static-sections-host.spec.ts";
  });
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
  if (!files.length) throw new Error("No specs match this fixture group and --spec selection.");
  if (env.ASE_TEST_PORT && (!/^\d+$/.test(env.ASE_TEST_PORT) || +env.ASE_TEST_PORT < 1 || +env.ASE_TEST_PORT > 65535)) throw new Error("--port must be an integer from 1 to 65535.");
  if (check) {
    console.log(`Fixture: ${group} (${resolve(env.ASE_NATIVE_SAVE_FIXTURE)})\n${files.join("\n")}`);
  } else {
    if (!forwarded.includes("--list") && !existsSync(resolve(env.ASE_NATIVE_SAVE_FIXTURE))) throw new Error(`Fixture does not exist: ${resolve(env.ASE_NATIVE_SAVE_FIXTURE)}. --check can inspect the selection without a server.`);
    const result = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "-c", "playwright.native-save.config.ts", ...files, ...forwarded], { env, stdio: "inherit" });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
} catch (error) {
  console.error(`Browser fixture contract: ${error.message}`);
  process.exitCode = 1;
}
