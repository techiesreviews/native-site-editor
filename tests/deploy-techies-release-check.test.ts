// The live deploy (`npm run deploy:techies`) runs `kit release-check` first, so production only goes out
// from a clean checkout that is exactly origin/main (TOOLS-40, kitchen ticket 82). Preview deploys are unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts as Record<string, string>;
const live = scripts["deploy:techies"];

test("deploy:techies runs the release check before wrangler deploys", () => {
  assert.equal(live, "scripts/agents/kit release-check && wrangler deploy --config wrangler.techies.jsonc");
});

test("the preview deploy runs no release check", () => {
  assert.doesNotMatch(scripts["deploy:preview"], /release-check/);
});

test("the release steps name the check before the deploy", () => {
  const extras = readFileSync("docs/agents/kitchen-extras.md", "utf8");
  const release = extras.slice(extras.indexOf("## Release to production"), extras.indexOf("## The starter"));
  assert.match(release, /`scripts\/agents\/kit release-check && wrangler deploy --config wrangler\.techies\.jsonc`/);
});

// Runs the script's own command line in a folder with a stand-in kit and wrangler, so nothing is deployed.
function run(checkPasses: boolean) {
  const dir = mkdtempSync(join(tmpdir(), "deploy-techies-"));
  try {
    const calls = join(dir, "calls");
    mkdirSync(join(dir, "scripts/agents"), { recursive: true });
    mkdirSync(join(dir, "bin"));
    writeFileSync(join(dir, "scripts/agents/kit"), `#!/bin/sh\necho "kit $*" >> "${calls}"\n${checkPasses ? "exit 0" : "echo 'RESULT: fail unsaved file'; exit 1"}\n`);
    writeFileSync(join(dir, "bin/wrangler"), `#!/bin/sh\necho "wrangler $*" >> "${calls}"\n`);
    chmodSync(join(dir, "scripts/agents/kit"), 0o755);
    chmodSync(join(dir, "bin/wrangler"), 0o755);
    const result = spawnSync("sh", ["-c", live], { cwd: dir, encoding: "utf8", env: { ...process.env, PATH: `${join(dir, "bin")}:${process.env.PATH}` } });
    return { status: result.status, calls: existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n") : [] };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a failed release check stops the deploy before wrangler runs", () => {
  const { status, calls } = run(false);
  assert.equal(status, 1);
  assert.deepEqual(calls, ["kit release-check"]);
});

test("a passed release check goes on to the live deploy", () => {
  const { status, calls } = run(true);
  assert.equal(status, 0);
  assert.deepEqual(calls, ["kit release-check", "wrangler deploy --config wrangler.techies.jsonc"]);
});
