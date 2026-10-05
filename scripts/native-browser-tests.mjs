import { readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fixtureKind } from "../tests/native-save/fixture-contract.ts";

const actualOnly = new Set([
  "native-card-paths-json.spec.ts", "native-card-paths-starter.spec.ts",
  "native-editor-json.spec.ts", "native-editor-json-lifecycle.spec.ts",
  "native-manual-collection.spec.ts", "native-static-section-save-host.spec.ts",
  "native-social-preview.spec.ts", "native-fields-migration.spec.ts",
  "native-static-sections-host.spec.ts", "native-structure-readiness.spec.ts",
]);
// Native-only: these need the native static starter (or create it) and skip elsewhere.
// Listed names that do not exist yet simply match nothing.
const nativeOnly = new Set([
  "native-static-starter-create.spec.ts", "native-static-grid-collection-host.spec.ts",
  "native-master-host.spec.ts", "native-master-visual-host.spec.ts", "native-master-controls.spec.ts",
  "native-master-assets-host.spec.ts", "native-master-code-collapse.spec.ts", "native-master-after-done-proof.spec.ts",
  "native-master-page-part-controls.spec.ts",
  "native-shared-authoring-host.spec.ts", "native-shared-link-host.spec.ts", "native-shared-files-lifecycle.spec.ts",
]);
const args = process.argv.slice(2);
const group = args.shift();
try {
  if (!["default", "actual", "native-static"].includes(group)) throw new Error("Choose default, actual, or native-static.");
  const env = { ...process.env };
  let files = readdirSync("tests/native-save").filter(name => name.endsWith(".spec.ts")).sort().filter(name => {
    const actual = actualOnly.has(name) || /-actual\.spec\.ts$/.test(name);
    return group === "default" ? !actual && !nativeOnly.has(name) : group === "actual" ? actual : name === "native-static-sections-host.spec.ts" || nativeOnly.has(name);
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
    console.log(`Fixture: ${group} (${resolve(env.ASE_NATIVE_SAVE_FIXTURE)})\n${files.join("\n")}`);
  } else {
    if (!forwarded.includes("--list") && !existsSync(resolve(env.ASE_NATIVE_SAVE_FIXTURE))) throw new Error(`Fixture does not exist: ${resolve(env.ASE_NATIVE_SAVE_FIXTURE)}. --check can inspect the selection without a server.`);
    const result = spawnSync(process.execPath, [createRequire(import.meta.url).resolve("@playwright/test/cli"), "test", "-c", "playwright.native-save.config.ts", ...files, ...forwarded], { env, stdio: "inherit" });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
} catch (error) {
  console.error(`Browser fixture contract: ${error.message}`);
  process.exitCode = 1;
}
