import { test } from "node:test";
import assert from "node:assert/strict";
import { fileType, fileTypeLabel } from "../src/components/file-type";

test("a Files row's type follows its name", () => {
  const cases: [string, ReturnType<typeof fileType>][] = [
    ["index.html", "page"], ["about/index.HTM", "page"], ["styles/site.css", "style"], ["components/components.js", "script"],
    ["app.mjs", "script"], ["wrangler.jsonc", "data"], [".editor/config.json", "data"], ["site.webmanifest", "data"],
    [".github/workflows/pages.yml", "data"], ["_redirects", "data"], ["_headers", "data"], ["README.md", "text"],
    ["robots.txt", "text"], ["LICENSE", "text"], ["images/social-card.png", "picture"], ["images/favicon.svg", "picture"],
    ["photo.JPEG", "picture"], ["clip.mp4", "video"], ["song.mp3", "sound"], ["price-list.pdf", "pdf"], ["brief.docx", "document"],
    ["fonts/inter.woff2", "font"], ["backup.zip", "archive"], [".gitignore", "other"], [".assetsignore", "other"], ["Makefile", "other"],
  ];
  for (const [name, type] of cases) assert.equal(fileType(name), type, name);
});

test("only other files go without a type word", () => {
  assert.equal(fileTypeLabel("page"), "Page");
  assert.equal(fileTypeLabel("picture"), "Picture");
  assert.equal(fileTypeLabel("other"), "");
});
