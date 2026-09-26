import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { crc32, unzipStored, zipFiles } from "../src/zip.ts";
import { buildSiteZip, collectSiteFiles, siteUrlFromConfig, siteZipName, type SiteFiles } from "../src/site-download.ts";

const decoder = new TextDecoder();

test("crc32 matches the standard check value", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  assert.equal(crc32(new Uint8Array()), 0);
});

test("zipFiles writes a store-only archive that reads back byte for byte", () => {
  const bytes = new Uint8Array([0, 1, 2, 255, 128, 10]);
  const archive = zipFiles({ "index.html": "<h1>Café</h1>", "assets/images/a.png": bytes, "über/ü.txt": "" }, new Date(2026, 8, 25, 12, 30, 10));
  const view = new DataView(archive.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint16(6, true), 0x0800, "UTF-8 names");
  assert.equal(view.getUint16(8, true), 0, "stored");
  assert.equal(view.getUint16(12, true), ((2026 - 1980) << 9) | (9 << 5) | 25);
  assert.equal(view.getUint16(10, true), (12 << 11) | (30 << 5) | 5);
  // End of central directory: three entries.
  assert.equal(view.getUint32(archive.length - 22, true), 0x06054b50);
  assert.equal(view.getUint16(archive.length - 12, true), 3);
  const read = unzipStored(archive);
  assert.deepEqual(Object.keys(read), ["index.html", "assets/images/a.png", "über/ü.txt"]);
  assert.equal(decoder.decode(read["index.html"]), "<h1>Café</h1>");
  assert.deepEqual([...read["assets/images/a.png"]], [...bytes]);
  assert.equal(read["über/ü.txt"].length, 0);
  assert.equal(unzipStored(zipFiles({})).constructor, Object);
});

test("the site's address comes only from .editor/config.json's site.url", () => {
  const config = (site: unknown) => JSON.stringify({ site });
  assert.equal(siteUrlFromConfig(config({ name: "Larkspur", url: "https://larkspur.example" })), "https://larkspur.example/");
  assert.equal(siteUrlFromConfig(config({ url: "https://a.example/x" })), "https://a.example/x");
  assert.equal(siteUrlFromConfig(config({ name: "No url" })), undefined);
  assert.equal(siteUrlFromConfig(JSON.stringify({ url: "https://top-level.example" })), undefined);
  assert.equal(siteUrlFromConfig(config({ url: "javascript:alert(1)" })), undefined);
  assert.equal(siteUrlFromConfig(config({ url: "larkspur.example" })), undefined);
  assert.equal(siteUrlFromConfig("{not json"), undefined);
  assert.equal(siteUrlFromConfig(undefined), undefined);
  assert.equal(siteZipName("lex/native-site-editor-starter"), "native-site-editor-starter-site.zip");
});

// The fixture as a branch: every file a blob named by its path.
function fixtureSite(held: Record<string, string>, deleted: string[] = []): SiteFiles {
  const root = "fixtures/native-starter";
  const all: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else all.push(relative(root, full));
    }
  };
  walk(root);
  const paths = [...all.filter((path) => !deleted.includes(path)), ...Object.keys(held).filter((path) => !all.includes(path))];
  return {
    repository: "lex/starter",
    paths,
    held: (path) => held[path],
    blob: async (path) => (all.includes(path) ? `sha:${path}` : undefined),
    readTexts: async (shas) => Object.fromEntries(shas.map((sha) => [sha, readFileSync(join(root, sha.slice(4)), "utf8")])),
    readBase64: async (sha) => readFileSync(join(root, sha.slice(4))).toString("base64"),
  };
}

test("Download site zips the repository's files as they are, drafts included", async () => {
  const index = readFileSync("fixtures/native-starter/index.html", "utf8");
  const edited = index.replace("A native browser preview", "Unsaved draft heading");
  const site = fixtureSite({
    "index.html": edited,
    "draft-only/index.html": "<!doctype html>\n<title>Only in the browser</title>\n",
  }, ["about/index.html"]);
  const files = await collectSiteFiles(site);
  assert.equal(typeof files["styles/site.css"], "string", "CSS reads as text");
  assert.equal(typeof files[".editor/config.json"], "string", "the editor's settings go along");
  assert.ok(files["images/studio-desk.svg"] !== undefined);
  const { zip, count } = await buildSiteZip(site);
  const read = unzipStored(zip);
  assert.equal(Object.keys(read).length, count);
  assert.equal(decoder.decode(read["index.html"]), edited, "the draft, byte for byte");
  assert.equal(decoder.decode(read["draft-only/index.html"]), "<!doctype html>\n<title>Only in the browser</title>\n");
  assert.equal(decoder.decode(read["styles/site.css"]), readFileSync("fixtures/native-starter/styles/site.css", "utf8"));
  assert.deepEqual([...read["images/studio-desk.svg"]], [...readFileSync("fixtures/native-starter/images/studio-desk.svg")]);
  assert.equal(read["about/index.html"], undefined, "a deleted file is left out");
});
