import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { previewAlias, previewOrigin } from "../fixtures/astro-starter/.astro-editor/preview-alias.mjs";

const config = {
  provider: "cloudflare-workers-assets" as const,
  worker: "astro-editor-starter",
  subdomain: "lexvd.workers.dev",
  revisionPath: "/.astro-editor/revision.json",
};

test("preview alias keeps short legal branch names unchanged", () => {
  assert.equal(previewAlias("main", config.worker), "main");
  assert.equal(previewAlias("feature__x", config.worker), "feature--x");
  assert.equal(previewAlias("feature--x", config.worker), "feature--x");
  assert.equal(previewAlias("topic_", config.worker), "topic-");
  assert.equal(previewOrigin(config, "main"), "https://main-astro-editor-starter.lexvd.workers.dev");
});

test("preview alias fits the Cloudflare alias-worker DNS label budget", () => {
  const worker = "w".repeat(20);
  const exactBudget = "b".repeat(42);
  assert.equal(previewAlias(exactBudget, worker), exactBudget);
  assert.equal(`${previewAlias(exactBudget, worker)}-${worker}`.length, 63);
  const budgetPlusOne = "c".repeat(43);
  assert.notEqual(previewAlias(budgetPlusOne, worker), budgetPlusOne);
  assert.equal(`${previewAlias(budgetPlusOne, worker)}-${worker}`.length, 63);
  const failedBranch = "a".repeat(44);
  const alias = previewAlias(failedBranch, worker);
  assert.equal(`${alias}-${worker}`.length, 63);
  assert.match(alias, /^[a-z][a-z0-9-]*[a-z0-9]$/);
});

test("preview alias hashes the full branch to avoid same-prefix collisions", () => {
  const worker = "w".repeat(20);
  const a = previewAlias(`${"feature/".repeat(8)}alpha`, worker);
  const b = previewAlias(`${"feature/".repeat(8)}bravo`, worker);
  assert.notEqual(a, b);
  assert.equal(a.length, b.length);
});

test("preview alias normalizes unicode and numeric-leading branches to valid labels", () => {
  const alias = previewAlias("123/mañana/x", config.worker);
  assert.match(alias, /^[a-z][a-z0-9-]*[a-z0-9]$/);
  assert.equal(alias.includes("ma-ana"), true);
});

test("preview alias rejects invalid worker names instead of guessing a URL", () => {
  assert.throws(() => previewAlias("", config.worker));
  assert.throws(() => previewAlias(undefined as unknown as string, config.worker));
  assert.throws(() => previewAlias("main", "bad_worker"));
  assert.throws(() => previewAlias("main", "w".repeat(63)));
});

test("workflow alias command reads preview.json worker and writes GitHub output", () => {
  const branch = "a".repeat(44);
  const dir = mkdtempSync(join(tmpdir(), "preview-alias-"));
  const output = join(dir, "github-output");
  try {
    const workflow = readFileSync("fixtures/astro-starter/.github/workflows/astro-editor-preview.yml", "utf8");
    const run = workflow.match(/      - name: Preview alias for this branch\n        id: alias\n        run: \|\n([\s\S]*?)        env:/)?.[1]
      .split("\n")
      .map((line) => line.startsWith("          ") ? line.slice(10) : line)
      .join("\n");
    assert.ok(run);
    execFileSync("bash", ["-e", "-u", "-o", "pipefail", "-c", run], {
      cwd: "fixtures/astro-starter",
      env: { ...process.env, BRANCH_NAME: branch, GITHUB_OUTPUT: output },
    });
    const alias = readFileSync(output, "utf8").trim().replace(/^name=/, "");
    assert.equal(`${alias}-${config.worker}`.length <= 63, true);
    assert.equal(alias, previewAlias(branch, config.worker));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
