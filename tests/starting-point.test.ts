import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blankSiteFiles,
  prepareStarterFiles,
  repositoryNameProblem,
  siteNameFromRepository,
  startingConfig,
  suggestedRepositoryName,
} from "../shared/starting-point.ts";
import type { StarterFile } from "../shared/types.ts";

test("repository names follow GitHub's rules", () => {
  for (const good of ["my-site", "My_Site.2", "a", "x".repeat(100), ".github-io", "site.github.io"])
    assert.equal(repositoryNameProblem(good), undefined, good);
  for (const bad of ["", "has space", "slash/name", "emoji😀", "x".repeat(101), ".", "..", "site.git", "site.GIT"])
    assert.equal(typeof repositoryNameProblem(bad), "string", bad);
});

test("a typed name becomes the name GitHub would make", () => {
  assert.equal(suggestedRepositoryName("My new site"), "My-new-site");
  assert.equal(suggestedRepositoryName("  Café  Münster! "), "Cafe-Munster");
  assert.equal(suggestedRepositoryName("a/b\\c"), "a-b-c");
  assert.equal(suggestedRepositoryName("---"), "");
  assert.equal(suggestedRepositoryName("x".repeat(150)).length, 100);
  for (const text of ["My new site", "Café!", "a b.c_d"])
    assert.equal(repositoryNameProblem(suggestedRepositoryName(text)), undefined, text);
});

test("a repository name reads as a site name", () => {
  assert.equal(siteNameFromRepository("my-site"), "My site");
  assert.equal(siteNameFromRepository("lex_portfolio.v2"), "Lex portfolio v2");
});

test("the Blank page is a home page, a shared stylesheet and settings", () => {
  const files = blankSiteFiles('Tom & "Jerry" <b>');
  assert.deepEqual(files.map((file) => file.path), ["index.html", "styles/site.css", ".editor/config.json"]);
  const home = files[0].content;
  assert.match(home, /^<!doctype html>/);
  assert.match(home, /<link rel="stylesheet" href="\/styles\/site\.css">/);
  assert.match(home, /<title>Tom &amp; &quot;Jerry&quot; &lt;b&gt;<\/title>/);
  assert.doesNotMatch(home, /<b>/);
  assert.match(home, /<h1>/);
  assert.deepEqual(JSON.parse(files[2].content), { site: { name: 'Tom & "Jerry" <b>' } });
  assert.equal(files[2].content, startingConfig('Tom & "Jerry" <b>'));
  assert.ok(files[1].content.includes(":root"));
});

test("the Starter site drops the template's own deployment and takes its address out", () => {
  const text = (path: string, content: string): StarterFile => ({ path, content });
  const files: StarterFile[] = [
    text(".github/workflows/deploy.yml", "name: deploy"),
    text("wrangler.jsonc", "{}"),
    text(".assetsignore", "README.md"),
    text(".wrangler/state", "x"),
    text(".editor/config.json", JSON.stringify({ site: { name: "Starter", url: "https://starter.example/" }, extra: 1 })),
    text(
      "index.html",
      '<head>\n  <meta name="robots" content="noindex">\n  <link rel="canonical" href="https://starter.example/">\n  <meta property="og:image" content="https://starter.example/og.png">\n</head>',
    ),
    text("404.html", '<meta name="robots" content="noindex">\n<p>Missing</p>'),
    text("README.md", "# Starter\n\n## Deploying\nUse wrangler.\n\n## Editing\nUse the editor.\n"),
    { path: "images/logo.png", base64: "AAEC", size: 3 },
    text("styles/site.css", "body{}"),
  ];
  const out = prepareStarterFiles(files, "My site");
  assert.deepEqual(
    out.map((file) => file.path),
    [".editor/config.json", "index.html", "404.html", "README.md", "images/logo.png", "styles/site.css"],
  );
  const byPath = Object.fromEntries(out.map((file) => [file.path, file])) as Record<string, any>;
  assert.deepEqual(JSON.parse(byPath[".editor/config.json"].content), { site: { name: "My site" } });
  assert.doesNotMatch(byPath["index.html"].content, /starter\.example|noindex/);
  assert.match(byPath["index.html"].content, /href="\/"/);
  assert.match(byPath["index.html"].content, /content="\/og\.png"/);
  assert.match(byPath["404.html"].content, /noindex/);
  assert.doesNotMatch(byPath["README.md"].content, /Deploying|wrangler/);
  assert.match(byPath["README.md"].content, /## Editing/);
  assert.deepEqual(byPath["images/logo.png"], { path: "images/logo.png", base64: "AAEC", size: 3 });
});

test("a template without settings gets none added", () => {
  const out = prepareStarterFiles([{ path: "index.html", content: "<p>hi</p>" }], "Site");
  assert.deepEqual(out, [{ path: "index.html", content: "<p>hi</p>" }]);
});
