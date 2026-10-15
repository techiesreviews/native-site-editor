import { test } from "node:test";
import assert from "node:assert/strict";
import { SOCIAL_IMAGE_SIZE, SOCIAL_IMAGE_OPTIONS, SOCIAL_IMAGE_NOTE, socialImageTrim, socialImageSize, socialCopyPath, socialImageAddress, socialImageSource } from "../src/page-builder/social-image";
import { prepareSocialCopy } from "../src/page-builder/social-copy-prepare";
import type { MediaWorkspaceContext } from "../src/page-builder/media-workspace";
import { parseMediaRecords } from "../shared/media-records";

test("sharing uses centred landscape, portrait and full frames; small sources never enlarge", () => {
  assert.deepEqual(SOCIAL_IMAGE_SIZE, { width: 1200, height: 630 });
  assert.deepEqual(socialImageTrim(2400, 1260), { x: 0, y: 0, width: 1, height: 1 });
  for (const [width, height] of [[3000, 1500], [1000, 2000], [600, 300]]) {
    const trim = socialImageTrim(width, height);
    assert.ok(Math.abs(trim.width * width / (trim.height * height) - 1200 / 630) < 1e-9);
    assert.equal(trim.x, (1 - trim.width) / 2); assert.equal(trim.y, (1 - trim.height) / 2);
    const size = socialImageSize(width, height);
    assert.ok(size.width <= width && size.height <= height);
  }
  assert.deepEqual(socialImageSize(3000, 2000), SOCIAL_IMAGE_SIZE);
  assert.deepEqual(socialImageSize(600, 300), { width: 571, height: 300 });
  assert.deepEqual(socialImageSize(500, 1000), { width: 500, height: 263 });
  assert.throws(() => socialImageTrim(0, 100));
});

test("sharing preparation requests JPEG 85 with neither responsive nor original copies", async () => {
  assert.deepEqual(SOCIAL_IMAGE_OPTIONS, { maxWidth: 1200, quality: 85, format: "jpeg", responsive: false, keepOriginal: false });
  let called = false;
  await prepareSocialCopy(new Blob(["pixels"], { type: "image/png" }), "source.png", undefined, undefined, async (file, options, _signal, trim) => {
    called = true; assert.equal(file.name, "source.png"); assert.equal(trim, undefined);
    assert.deepEqual(options, { ...SOCIAL_IMAGE_OPTIONS, sharing: true });
    return { outputs: [], before: 1, after: 1 };
  });
  assert.ok(called);
});

test("sharing names are tidy, numbered across families and never reuse removed or previous addresses", () => {
  const records = parseMediaRecords(undefined), source = "old/My Photo.PNG";
  assert.equal(socialCopyPath({ source, records, paths: [] }), "media/images/my-photo-social.jpg");
  assert.equal(socialCopyPath({ source, records, paths: ["media/images/my-photo-social.webp"] }), "media/images/my-photo-social-2.jpg");
  assert.equal(socialCopyPath({ source, records, paths: [], previous: "media/images/my-photo-social-7.jpg" }), "media/images/my-photo-social-8.jpg");
  records.removed = [{ path: "media/images/my-photo-social-4.jpg", sha: "old", date: "2026-10-14" }];
  assert.equal(socialCopyPath({ source, records, paths: [] }), "media/images/my-photo-social-5.jpg");
  assert.equal(socialCopyPath({ source, records: parseMediaRecords(undefined), paths: ["media/images/my-photo-social-480.jpg"] }), "media/images/my-photo-social-481.jpg");
});

test("sharing addresses encode paths, omit double slashes and explain missing addresses", () => {
  assert.deepEqual(socialImageAddress("https://example.com/", "media/images/a b#.jpg"), { address: "https://example.com/media/images/a%20b%23.jpg", missingAddress: false });
  assert.equal(socialImageAddress("https://example.com/site/", "media/images/a.jpg").address, "https://example.com/site/media/images/a.jpg");
  for (const url of [undefined, "", "example.com", "ftp://example.com", "bad address"]) {
    assert.deepEqual(socialImageAddress(url, "media/images/a.jpg"), { address: "/media/images/a.jpg", missingAddress: true, note: SOCIAL_IMAGE_NOTE });
  }
});

test("only existing repository still rasters need sharing copies; authored exclusions stay untouched", () => {
  const records = parseMediaRecords(undefined), paths = ["images/a.png", "images/logo.svg", "images/old.jpg", "images/movie.gif"];
  records.files["images/old.jpg"] = { sharing: true };
  const options = { page: "about/index.html", siteUrl: "https://example.com/", canonical: "https://canonical.example/about/", paths, records };
  for (const value of ["/images/a.png", "../images/a.png", "https://example.com/images/a.png", "https://canonical.example/images/a.png"]) assert.equal(socialImageSource({ ...options, value }), "images/a.png");
  for (const value of ["https://outside.example/images/a.png", "//outside.example/images/a.png", "/images/logo.svg", "/missing.jpg", "/images/old.jpg", "data:image/png,x"]) assert.equal(socialImageSource({ ...options, value }), undefined);
  assert.equal(socialImageSource({ ...options, value: "/images/movie.gif", bytes: new Uint8Array() }), "images/movie.gif");
  const frame = [44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 1, 0, 0];
  const animated = new Uint8Array([...new TextEncoder().encode("GIF89a"), 1, 0, 1, 0, 0, 0, 0, ...frame, ...frame, 59]);
  assert.equal(socialImageSource({ ...options, value: "/images/movie.gif", bytes: animated }), undefined);
  assert.equal(parseMediaRecords(JSON.stringify(records)).files["images/old.jpg"].sharing, true);
});

test("authored outside, SVG and missing paths bypass media records and worker preparation", async () => {
  const { shareImage } = await import("../src/page-builder/social-sharing");
  for (const value of ["https://outside.example/a.png", "/logo.svg", "/missing.png"]) {
    let contexts = 0;
    const result = await shareImage(async () => {
      contexts++;
      const excluded = () => { throw new Error("Excluded values must not read media records or prepare images."); };
      return {
        key: "excluded", scope: { account: "owner", repoId: 1, repo: "owner/repo", branch: "main" },
        drafts: { get: () => undefined, save: excluded, remove: excluded },
        paths: [], items: [], pages: [], components: {}, assertLive() {},
        read: excluded, blob: excluded, assetVersion: () => undefined, applyBatch: excluded, openPage: excluded,
      } satisfies MediaWorkspaceContext;
    }, { value, previous: "", page: "index.html", expectedSources: new Map(), live: () => true, edits() { throw new Error("Must not write."); } }, () => {});
    assert.equal(result, undefined); assert.equal(contexts, value === "/missing.png" ? 1 : 0);
  }
});

test("an existing sharing copy is linked at the full address without a new copy", async () => {
  const { shareImage } = await import("../src/page-builder/social-sharing");
  const path = "media/images/a-social.jpg";
  const records = JSON.stringify({ version: 2, collections: [], files: { [path]: { sharing: true, trimmedFrom: { source: "images/a.png", trim: { x: 0, y: 0.1, width: 1, height: 0.8 } } } } });
  const never = () => { throw new Error("A reused sharing copy must not be prepared or written."); };
  const context = async () => ({
    key: "reuse", scope: { account: "owner", repoId: 1, repo: "owner/repo", branch: "main" },
    drafts: { get: () => undefined, save: never, remove: never },
    paths: [path, "images/a.png", ".editor/media.json"], items: [], pages: [], components: {}, assertLive() {},
    read: async (file: string) => file === ".editor/media.json" ? records : undefined,
    blob: never, assetVersion: () => "v1", applyBatch: never, openPage: never,
  } satisfies MediaWorkspaceContext);
  const request = { value: "/" + path, previous: "", page: "index.html", expectedSources: new Map(), live: () => true, edits: never };
  assert.deepEqual(await shareImage(context, { ...request, siteUrl: "https://site.example/" }, never),
    { address: "https://site.example/" + path, missingAddress: false, reused: true, path });
  // Saved earlier without an address: once the site has one, choosing it again links it fully.
  assert.equal((await shareImage(context, { ...request, value: "https://site.example/" + path, siteUrl: "https://site.example" }, never))?.address, "https://site.example/" + path);
  assert.equal((await shareImage(context, request, never))?.missingAddress, true);
});


test("GitHub Pages sharing addresses retain one prefix and resolve back to repository pictures", () => {
  const path = "media/images/a b.jpg";
  for (const siteUrl of ["https://user.github.io/my-site/", "https://user.github.io/my-site", "https://user.github.io/my-site/index.html"]) {
    const result = socialImageAddress(siteUrl, path);
    assert.deepEqual(result, { address: "https://user.github.io/my-site/media/images/a%20b.jpg", missingAddress: false });
    for (const value of [result.address, "/my-site/media/images/a%20b.jpg", "/media/images/a%20b.jpg"]) {
      assert.equal(socialImageSource({ value, page: "index.html", siteUrl, paths: [path], records: parseMediaRecords(undefined) }), path);
    }
  }
});
