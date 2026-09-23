import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  DraftPreviewRuntime,
  demoDraftBaseline,
} from "../../scripts/draft-preview-runtime.ts";
import type { DraftFile } from "../../shared/draft-preview.ts";

const runIntegration = process.env.ASTRO_DRAFT_PREVIEW_INTEGRATION === "1";
const integrationTest = runIntegration ? test : test.skip;
const projectRoot = resolve(import.meta.dirname, "../..");
const fixtureRoot = join(projectRoot, "fixtures/astro-starter");

function runtime() {
  const artifactRoot = mkdtempSync(join(tmpdir(), "ase-draft-artifacts-"));
  const draftRuntime = new DraftPreviewRuntime({
    projectRoot,
    fixtureRoot,
    artifactRoot,
    previewOrigin: "http://preview.local",
  });
  return { draftRuntime, artifactRoot };
}

function request(sessionId: string, files: DraftFile[]) {
  return {
    sessionId,
    repo: demoDraftBaseline.repo,
    branch: demoDraftBaseline.branch,
    baseCommit: demoDraftBaseline.baseCommit,
    files,
  };
}

function htmlPath(artifactRoot: string, sessionId: string, revision: string) {
  return join(artifactRoot, sessionId, revision, "index.html");
}

const sessionA = "11111111-1111-4111-8111-111111111111";
const sessionB = "22222222-2222-4222-8222-222222222222";

integrationTest("builds real Astro overlays and keeps failed builds isolated", async () => {
  const { draftRuntime, artifactRoot } = runtime();
  try {
    const source = readFileSync(join(fixtureRoot, "src/pages/index.astro"), "utf8");
    const duplicated = source.replace(
      '<a class="button" href="/about/">Get to know this project ↗</a>',
      '<a class="button" href="/about/">Get to know this project ↗</a>\n  <a class="button" href="/about/">Second button</a>',
    );
    const first = await draftRuntime.build(request(sessionA, [{ path: "src/pages/index.astro", content: duplicated }]));
    const firstHtml = readFileSync(htmlPath(artifactRoot, sessionA, first.revision), "utf8");
    assert.equal((firstHtml.match(/class="button"/g) ?? []).length, 2);
    assert.match(firstHtml, /Second button/);

    const reordered = duplicated
      .replace('  <p class="lead">A place for ideas, experiments, and things worth sharing.</p>\n', "")
      .replace('<p class="eyebrow">A WORK IN PROGRESS</p>', '<p class="eyebrow">A WORK IN PROGRESS</p>\n  <p class="lead">A place for ideas, experiments, and things worth sharing.</p>');
    const second = await draftRuntime.build(request(sessionA, [{ path: "src/pages/index.astro", content: reordered }]));
    const secondHtml = readFileSync(htmlPath(artifactRoot, sessionA, second.revision), "utf8");
    assert.ok(secondHtml.indexOf("A WORK IN PROGRESS") < secondHtml.indexOf("A place for ideas"));

    const reverted = await draftRuntime.build(request(sessionA, []));
    const revertedHtml = readFileSync(htmlPath(artifactRoot, sessionA, reverted.revision), "utf8");
    assert.equal((revertedHtml.match(/class="button"/g) ?? []).length, 1);
    assert.doesNotMatch(revertedHtml, /Second button/);

    await assert.rejects(
      draftRuntime.build(request(sessionA, [{ path: "src/pages/index.astro", content: "---\nconst broken = ;\n---\n<p>bad</p>" }])),
      /Astro build failed|Command failed/,
    );
    assert.ok(existsSync(htmlPath(artifactRoot, sessionA, reverted.revision)), "last successful artifact remains after failed build");
  } finally {
    rmSync(artifactRoot, { recursive: true, force: true });
  }
});

integrationTest("isolates sessions and rejects unsafe overlays", async () => {
  const { draftRuntime, artifactRoot } = runtime();
  try {
    const source = readFileSync(join(fixtureRoot, "src/pages/index.astro"), "utf8");
    const buildA = await draftRuntime.build(request(sessionA, [{ path: "src/pages/index.astro", content: source.replace("A little space on the web, updated.", "Session A title") }]));
    const buildB = await draftRuntime.build(request(sessionB, [{ path: "src/pages/index.astro", content: source.replace("A little space on the web, updated.", "Session B title") }]));

    assert.match(readFileSync(htmlPath(artifactRoot, sessionA, buildA.revision), "utf8"), /Session A title/);
    assert.match(readFileSync(htmlPath(artifactRoot, sessionB, buildB.revision), "utf8"), /Session B title/);
    assert.equal(buildA.sources["src/pages/index.astro"].includes("Session B title"), false);
    assert.equal(buildB.sources["src/pages/index.astro"].includes("Session A title"), false);

    await assert.rejects(draftRuntime.build(request(sessionA, [{ path: "../secret.astro", content: "" }])), /Unsafe draft path/);
    await assert.rejects(draftRuntime.build(request(sessionA, [{ path: "package.json", content: "{}" }])), /Unsupported draft path/);
  } finally {
    rmSync(artifactRoot, { recursive: true, force: true });
  }
});

integrationTest("sandbox hides host home and blocks network during Astro build", async () => {
  const { draftRuntime, artifactRoot } = runtime();
  try {
    const source = `---
import { existsSync } from 'node:fs';
let network = 'blocked';
try {
  await fetch('https://example.com', { signal: AbortSignal.timeout(1500) });
  network = 'open';
} catch {}
const homeVisible = existsSync('/home/ubulex');
---
<html><body><p id="home">home:{String(homeVisible)}</p><p id="network">network:{network}</p></body></html>
`;
    const build = await draftRuntime.build(request(sessionA, [{ path: "src/pages/index.astro", content: source }]));
    const html = readFileSync(htmlPath(artifactRoot, sessionA, build.revision), "utf8");
    assert.match(html, /home:false/);
    assert.match(html, /network:blocked/);
  } finally {
    rmSync(artifactRoot, { recursive: true, force: true });
  }
});
