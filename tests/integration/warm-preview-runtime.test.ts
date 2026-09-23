import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createWarmPreviewRuntime } from "../../scripts/warm-preview-runtime.ts";
import type { DraftFile, DraftPreviewRequest } from "../../shared/draft-preview.ts";

const runIntegration = process.env.ASTRO_WARM_PREVIEW_INTEGRATION === "1";
const integrationTest = runIntegration ? test : test.skip;
const projectRoot = resolve(import.meta.dirname, "../..");
const fixtureRoot = join(projectRoot, "fixtures/astro-starter");
const baseline = {
  repo: "demo/heading-starter-local-fixture",
  branch: "main",
  baseCommit: "c".repeat(40),
};
const sessionA = "11111111-1111-4111-8111-111111111111";
const sessionB = "22222222-2222-4222-8222-222222222222";
const heading = "A little space on the web, updated.";

function request(sessionId: string, files: DraftFile[]): DraftPreviewRequest {
  return { sessionId, ...baseline, files };
}

async function text(url: string) {
  const response = await fetch(url);
  assert.equal(response.status, 200, url);
  return response.text();
}

integrationTest("renders page, component and CSS overlays through one warm Astro dev server", async () => {
  const runtime = await createWarmPreviewRuntime({ projectRoot, fixtureRoot, baseline, port: 4594, devPort: 4595 });
  try {
    const page = readFileSync(join(fixtureRoot, "src/pages/index.astro"), "utf8").replace("A little space on the web, updated.", "Warm page title");
    const component = readFileSync(join(fixtureRoot, "src/components/Counter.tsx"), "utf8").replace("Visitors waved", "Warm counter");
    const css = readFileSync(join(fixtureRoot, "src/styles/site.css"), "utf8").replace("#2c5139", "rgb(1, 2, 3)");
    const build = await runtime.apply(request(sessionA, [
      { path: "src/pages/index.astro", content: page },
      { path: "src/components/Counter.tsx", content: component },
      { path: "src/styles/site.css", content: css },
    ]));
    const html = await text(build.previewUrl);
    assert.match(await text(`${build.previewUrl}?astro-editor-rev=${build.revision}`), /Warm page title/);
    assert.match(html, /Warm page title/);
    assert.match(html, /Warm counter/);
    const cssModulePath = /src="([^"]+\/src\/styles\/site\.css[^"]*)"/.exec(html)?.[1];
    assert.ok(cssModulePath);
    assert.match(await text(new URL(cssModulePath, build.previewUrl).href), /rgb\(1,2,3\)|rgb\(1, 2, 3\)/);
    assert.equal(build.sources["src/pages/index.astro"], page);
    assert.doesNotMatch(build.sources["src/pages/index.astro"], /ase-proof-snapshot/);
  } finally {
    await runtime.close();
  }
});

integrationTest("captures / and /about/, recovers after invalid input, reverts and rejects second sessions", async () => {
  const runtime = await createWarmPreviewRuntime({ projectRoot, fixtureRoot, baseline, port: 4694, devPort: 4695 });
  try {
    const layout = readFileSync(join(fixtureRoot, "src/layouts/Layout.astro"), "utf8").replace("Tere", "Warm Brand");
    const about = readFileSync(join(fixtureRoot, "src/pages/about.astro"), "utf8").replace("Room to try something new.", "Warm about title");
    const first = await runtime.apply(request(sessionA, [
      { path: "src/layouts/Layout.astro", content: layout },
      { path: "src/pages/about.astro", content: about },
    ]));
    assert.match(await text(first.previewUrl), /Warm Brand/);
    assert.match(await text(new URL("about/", first.previewUrl).href), /Warm about title/);

    await assert.rejects(
      runtime.apply(request(sessionA, [{ path: "src/pages/index.astro", content: "---\nconst broken = ;\n---\n<p>bad</p>" }])),
      /Astro dev server|render failed|Unexpected/,
    );
    assert.match(await text(first.previewUrl), /Warm Brand/);

    const reverted = await runtime.apply(request(sessionA, []));
    const revertedHtml = await text(reverted.previewUrl);
    assert.doesNotMatch(revertedHtml, /Warm Brand/);
    assert.equal(reverted.sources["src/pages/index.astro"], readFileSync(join(fixtureRoot, "src/pages/index.astro"), "utf8"));

    await assert.rejects(runtime.apply(request(sessionB, [])), /active session/);
  } finally {
    await runtime.close();
  }
});

integrationTest("serves old revision resources from the accepted snapshot", async () => {
  const runtime = await createWarmPreviewRuntime({ projectRoot, fixtureRoot, baseline, port: 4794, devPort: 4795 });
  try {
    const css = readFileSync(join(fixtureRoot, "src/styles/site.css"), "utf8");
    const first = await runtime.apply(request(sessionA, [{ path: "src/styles/site.css", content: css.replace("#2c5139", "rgb(10, 20, 30)") }]));
    const firstHtml = await text(first.previewUrl);
    const firstCssPath = /src="([^"]+\/src\/styles\/site\.css[^"]*)"/.exec(firstHtml)?.[1];
    assert.ok(firstCssPath);
    const firstCss = await text(new URL(firstCssPath, first.previewUrl).href);
    assert.match(firstCss, /rgb\(10,20,30\)|rgb\(10, 20, 30\)/);
    const retryUrl = new URL(firstCssPath, first.previewUrl);
    retryUrl.searchParams.set("astro-retry", "123");
    assert.equal(await text(retryUrl.href), firstCss);

    await runtime.apply(request(sessionA, [{ path: "src/styles/site.css", content: css.replace("#2c5139", "rgb(90, 80, 70)") }]));
    assert.equal(await text(new URL(firstCssPath, first.previewUrl).href), firstCss);
  } finally {
    await runtime.close();
  }
});

integrationTest("bounds a hanging Astro render during close", async () => {
  const runtime = await createWarmPreviewRuntime({ projectRoot, fixtureRoot, baseline, port: 4894, devPort: 4895 });
  try {
    const hanging = `---
await new Promise(() => {});
---
<html><body>never</body></html>
`;
    const apply = runtime.apply(request(sessionA, [{ path: "src/pages/index.astro", content: hanging }])).then(
      () => undefined,
      (error: unknown) => error,
    );
    const started = Date.now();
    await runtime.close();
    assert.ok(Date.now() - started < 6_000, "close should not wait for a hanging render indefinitely");
    assert.match(String(await apply), /terminated|closed|fetch failed|invalid|render|Astro/i);
  } finally {
    await runtime.close();
  }
});

integrationTest("isolates Vite optimizer cache across parallel warm runtimes", async () => {
  const runtimeA = await createWarmPreviewRuntime({ projectRoot, fixtureRoot, baseline, port: 4994, devPort: 4995 });
  const runtimeB = await createWarmPreviewRuntime({ projectRoot, fixtureRoot, baseline, port: 5094, devPort: 5095 });
  try {
    const source = readFileSync(join(fixtureRoot, "src/pages/index.astro"), "utf8");
    const [buildA, buildB] = await Promise.all([
      runtimeA.apply(request(sessionA, [{ path: "src/pages/index.astro", content: source.replace(heading, "Parallel warm A") }])),
      runtimeB.apply(request(sessionA, [{ path: "src/pages/index.astro", content: source.replace(heading, "Parallel warm B") }])),
    ]);
    assert.match(await text(buildA.previewUrl), /Parallel warm A/);
    assert.match(await text(buildB.previewUrl), /Parallel warm B/);

    const jsA = /component-url="([^"]+\/src\/components\/Counter\.tsx[^"]*)"/.exec(await text(buildA.previewUrl))?.[1];
    const jsB = /component-url="([^"]+\/src\/components\/Counter\.tsx[^"]*)"/.exec(await text(buildB.previewUrl))?.[1];
    assert.ok(jsA);
    assert.ok(jsB);
    assert.equal((await fetch(new URL(jsA, buildA.previewUrl))).status, 200);
    assert.equal((await fetch(new URL(jsB, buildB.previewUrl))).status, 200);
  } finally {
    await runtimeA.close();
    await runtimeB.close();
  }
});
