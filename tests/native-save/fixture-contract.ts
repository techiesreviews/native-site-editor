import { existsSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { test } from "@playwright/test";

export type FixtureKind = "default" | "actual" | "native-static";
const canonical = (path: string) => existsSync(path) ? realpathSync(path) : resolve(path);
export function fixtureKind(env = process.env): FixtureKind {
  const path = canonical(resolve(env.ASE_NATIVE_SAVE_FIXTURE ?? "fixtures/native-starter"));
  const known: [string, FixtureKind][] = [
    [resolve("fixtures/native-starter"), "default"],
    [resolve("fixtures/actual-starter"), "actual"],
    [resolve(".scratch/native-static-preview"), "native-static"],
  ];
  // A linked worktree can use the main checkout’s archived fixture by absolute path.
  try {
    const sharedRoot = dirname(resolve(execFileSync("git", ["rev-parse", "--git-common-dir"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()));
    known.push([resolve(sharedRoot, "fixtures/native-starter"), "default"], [resolve(sharedRoot, "fixtures/actual-starter"), "actual"], [resolve(sharedRoot, ".scratch/native-static-preview"), "native-static"]);
  } catch { /* Outside Git, explicitly identified copies remain supported. */ }
  const detected = known.find(([candidate]) => canonical(candidate) === path)?.[1];
  const explicit = env.ASE_NATIVE_SAVE_FIXTURE_KIND;
  if (explicit && !["default", "actual", "native-static"].includes(explicit)) throw new Error("ASE_NATIVE_SAVE_FIXTURE_KIND must be default, actual, or native-static.");
  if (detected && explicit && detected !== explicit) throw new Error(`Fixture identity mismatch: ${path} is ${detected}, not ${explicit}.`);
  const kind = detected ?? explicit as FixtureKind | undefined;
  if (!kind) throw new Error(`Unknown fixture ${path}. For a compatible copy, explicitly set ASE_NATIVE_SAVE_FIXTURE_KIND=default, actual, or native-static. Use npm run test:browser:actual for the actual starter.`);
  if (env.STATIC_SECTIONS_FIXTURE && env.STATIC_SECTIONS_FIXTURE !== "native") throw new Error("STATIC_SECTIONS_FIXTURE only accepts native; unset it for actual/default tests.");
  if ((env.STATIC_SECTIONS_FIXTURE === "native") !== (kind === "native-static")) throw new Error("Fixture flag mismatch: native-static requires STATIC_SECTIONS_FIXTURE=native; actual/default require it unset. Use npm run test:browser:native-static.");
  return kind;
}

export function requireActualFixture() {
  const kind = fixtureKind();
  if (kind === "default" && !process.env.ASE_NATIVE_SAVE_FIXTURE) {
    test.skip(true, "Requires the actual starter. Run npm run test:browser:actual.");
  } else if (kind !== "actual") {
    throw new Error(`This spec requires the actual starter, received ${kind}. Run npm run test:browser:actual.`);
  }
}

export function requireStaticFixture() {
  if (process.env.STATIC_SECTIONS_FIXTURE === "native") fixtureKind();
  else requireActualFixture();
}
