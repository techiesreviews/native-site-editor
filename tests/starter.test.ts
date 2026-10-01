import { test } from "node:test";
import assert from "node:assert/strict";
import { gunzipSync, gzipSync } from "node:zlib";
import { HttpError } from "../worker/github.ts";
import { starterFile, starterFiles, starterTarballUrl, untar } from "../worker/starter.ts";
import { tar, tarEntry, tarball } from "./tar-helper.ts";

const encoder = new TextEncoder();
const top = "techiesreviews-native-site-editor-starter-abc123";
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1, 2]);
const site = {
  "index.html": "<h1>Hi</h1>",
  "styles/site.css": "body{}",
  "images/logo.png": png,
  ".editor/config.json": JSON.stringify({ site: { name: "Starter", url: "https://starter.example" } }),
  "wrangler.jsonc": "{}",
};

test("untar lists regular files without the top folder", () => {
  const files = untar(gunzipSync(tarball(site)));
  assert.deepEqual(files.map((file) => file.path), Object.keys(site));
  assert.equal(new TextDecoder().decode(files[0].bytes), "<h1>Hi</h1>");
  assert.deepEqual([...files[2].bytes], [...png]);
});

test("untar skips symlinks and unsafe paths, and reads a long name from a pax header", () => {
  const long = `${top}/${"deep/".repeat(30)}file.txt`;
  const record = ` path=${long}\n`;
  const pax = `${record.length + String(record.length).length}${record}`;
  const files = untar(
    tar([
      tarEntry("pax", pax, "x"),
      tarEntry("truncated-name", "long"),
      tarEntry(`${top}/link`, "", "2"),
      tarEntry(`${top}/../evil.txt`, "x"),
      tarEntry(`${top}/ok.txt`, "ok"),
    ]),
  );
  assert.deepEqual(files.map((file) => file.path), [`${"deep/".repeat(30)}file.txt`, "ok.txt"]);
});

test("a binary file is base64 and text is text", () => {
  assert.deepEqual(starterFile("a.txt", encoder.encode("héllo")), { path: "a.txt", content: "héllo" });
  assert.deepEqual(starterFile("logo.png", png), { path: "logo.png", base64: Buffer.from(png).toString("base64"), size: png.length });
  assert.ok("base64" in starterFile("bad.bin", new Uint8Array([0xff, 0xfe, 0x41])));
});

test("starterFiles downloads the tarball, prepares the files for the site and sorts them", async () => {
  const urls: string[] = [];
  const files = await starterFiles("My site", async (input) => {
    urls.push(String(input));
    return new Response(tarball(site), { status: 200 });
  });
  assert.deepEqual(urls, [starterTarballUrl()]);
  assert.equal(urls[0], "https://codeload.github.com/techiesreviews/native-site-editor-starter/tar.gz/refs/heads/main");
  assert.deepEqual(files.map((file) => file.path), [".editor/config.json", "images/logo.png", "index.html", "styles/site.css"]);
  assert.deepEqual(JSON.parse((files[0] as { content: string }).content), { site: { name: "My site" } });
  assert.ok("base64" in files[1]);
});

test("starterFiles fails clearly when the tarball cannot be had", async () => {
  const bad = (error: unknown) => error instanceof HttpError && error.status === 502;
  await assert.rejects(() => starterFiles("x", async () => new Response("nope", { status: 404 })), bad);
  await assert.rejects(
    () =>
      starterFiles("x", async () => {
        throw new Error("offline");
      }),
    bad,
  );
  await assert.rejects(() => starterFiles("x", async () => new Response("not gzip", { status: 200 })), bad);
  await assert.rejects(
    () => starterFiles("x", async () => new Response(tarball({ "README.md": "x" }))),
    (error: unknown) => bad(error) && /no home page/.test((error as Error).message),
  );
});

test("untar refuses a header whose size is not plain octal or runs past the archive", () => {
  const bad = (error: unknown) => error instanceof HttpError && error.status === 502;
  const archive = (sizeField: string) => tar([tarEntry(`${top}/a.txt`, "hello", "0", sizeField)]);
  assert.throws(() => untar(archive("-1000\0")), bad);
  assert.throws(() => untar(archive("0000000089\0")), bad, "not octal");
  assert.throws(() => untar(archive("1e3\0")), bad);
  assert.throws(() => untar(archive("77777777777\0")), bad, "larger than the archive");
  // The archive ends one byte before the entry does.
  const short = tar([tarEntry(`${top}/a.txt`, "hello")]).subarray(0, 512 + 4);
  assert.throws(() => untar(short), bad, "cut short");
  assert.deepEqual(untar(archive("00000000005\0")).map((file) => file.path), ["a.txt"]);
  assert.deepEqual(untar(archive("")).map((file) => file.path), ["a.txt"], "an empty size field reads as 0 bytes");
});

test("starterFiles reports a malformed archive as unpackable", async () => {
  const broken = gzipSync(tar([tarEntry(`${top}/index.html`, "x", "0", "-1000\0")]));
  await assert.rejects(
    () => starterFiles("x", async () => new Response(broken)),
    (error: unknown) => error instanceof HttpError && error.status === 502 && /could not be unpacked/.test(error.message),
  );
});
