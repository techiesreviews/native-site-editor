import { test } from "node:test";
import assert from "node:assert/strict";
import { startTags } from "../shared/html-source.ts";
import type { ImprovePicture } from "../src/page-builder/improve-images.ts";
import { bringInOutsidePictures, outsidePictureName, outsidePicturesAllowed, readOutsidePicture, rewriteOutsidePictures, normaliseOutsidePicture, type BringInOutsidePicturesInput, type OutsidePictureReadDeps } from "../src/page-builder/outside-pictures.ts";
import { chooseMediaPath, mediaStorageName, mediaCopyName } from "../src/page-builder/media-storage.ts";
import type { prepareMediaFile } from "../src/page-builder/media-prepare.ts";

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const address = "https://mobbin.com/og-image.png";
function picture(source: string, index = 0): ImprovePicture {
  const tag = startTags(source).filter(t => t.name === "img" || t.name === "meta")[index];
  return { key: address, address, kind: tag.name === "meta" ? "sharing" : "outside", tag, changes: ["bring-in"], ticked: true };
}
const prepare: typeof prepareMediaFile = async (file, _key, folder) => ({
  request: { file, folder: folder!, result: { outputs: [
    { blob: new Blob([png]), extension: "webp", width: 1200, height: 600 },
    { blob: new Blob([png]), extension: "webp", width: 480, height: 240, variantWidth: 480 },
  ], before: file.size, after: 16 } },
});
function fixture(source = '<a href="' + address + '"><img src="' + address + '" alt=Logo class="hero"></a>') {
  let calls = 0, reads = 0, written = source;
  const paths = new Set<string>();
  const input: BringInOutsidePicturesInput = {
    file: "index.html", pictures: [picture(source)], source, records: { files: {} }, paths, by: "lex", prepare,
    fetch: async () => { reads++; return new Response(png, { headers: { "content-type": "image/png" } }); },
    probe: async () => false, assertLive() {},
    workspace: { async import(requests, place) {
      calls++;
      assert.equal(place?.source, written, place?.stale);
      if (!place?.live?.()) throw new Error("Cancelled");
      const added = requests.map(request => {
        const path = chooseMediaPath({ folder: request.folder, name: mediaStorageName(request.file.name, request.result?.outputs[0].extension), copies: request.result?.outputs.flatMap(o => o.variantWidth ? [o.variantWidth] : []) ?? [], paths });
        paths.add(path);
        for (const copy of request.result?.outputs ?? []) if (copy.variantWidth) paths.add(mediaCopyName(path, copy.variantWidth));
        return path;
      });
      const page = place!.apply(added, requests, input.records);
      written = typeof page === "string" ? page : page.page;
      return added;
    } },
  };
  return { input, calls: () => calls, reads: () => reads, written: () => written, change: (text: string) => { written = text; } };
}
test("source-site naming, countries, no stem, escaped and unicode stems", () => {
  for (const [url, name] of [
    [address, "mobbin-og-image.webp"], ["https://cdn.mobbin.com/mobbin-logo.png", "mobbin-logo.webp"],
    ["https://images.unsplash.com/photo.png", "unsplash-photo.webp"], ["https://i.ytimg.com/x.jpg", "ytimg-x.webp"],
    ["https://bbc.co.uk/a.png", "bbc-a.webp"], ["https://news.example.com.au/a.png", "example-a.webp"],
    ["https://www.mobbin.com/?id=x", "mobbin.webp"], ["https://mobbin.com/Caf%C3%A9%20Logo.PNG", "mobbin-café-logo.webp"],
    ["https://mobbin.com/a%2Fb.png", "mobbin-a-b.webp"],
  ]) assert.equal(outsidePictureName(url, "image/webp"), name);
});
test("https normalisation shares one cached read and uses private CORS options", async () => {
  let calls = 0;
  const deps: OutsidePictureReadDeps = { fetch: async (url, options) => {
    calls++; assert.equal(url, address); assert.equal(options?.mode, "cors"); assert.equal(options?.credentials, "omit");
    assert.equal(options?.referrerPolicy, "no-referrer"); assert.equal(options?.redirect, "follow");
    return new Response(png);
  } };
  assert.equal(normaliseOutsidePicture("http://mobbin.com/og-image.png"), address);
  assert.equal((await readOutsidePicture("//mobbin.com/og-image.png", deps)).status, "read");
  assert.equal((await readOutsidePicture("http://mobbin.com/og-image.png", deps)).status, "read");
  assert.equal(calls, 1);
});
test("every readable refusal and gone response", async () => {
  for (const status of [404, 410, 500, 503, 401, 403, 451, 400, 429, 204, 302]) {
    const result = await readOutsidePicture(address, { fetch: async () => new Response(status === 204 ? null : "no", { status }) });
    assert.equal(result.status, [404, 410, 500, 503].includes(status) ? "gone" : "not-allowed", String(status));
  }
  assert.equal((await readOutsidePicture(address, { fetch: async () => new Response("<html>Parked domain</html>", { headers: { "content-type": "text/html" } }) })).status, "gone");
  for (const loads of [true, false]) assert.equal((await readOutsidePicture(address, { fetch: async () => { throw new TypeError("Failed to fetch"); }, probe: async () => loads })).status, loads ? "not-allowed" : "gone");
});
test("declared images and sniffed JPEG PNG GIF WebP AVIF BMP; SVG stays outside", async () => {
  for (const bytes of [png, new Uint8Array([255, 216, 255]), new TextEncoder().encode("GIF89a"), new TextEncoder().encode("RIFF0000WEBP"), new TextEncoder().encode("0000ftypavif"), new TextEncoder().encode("BM")]) {
    assert.equal((await readOutsidePicture(address, { fetch: async () => new Response(bytes) })).status, "read");
  }
  assert.equal((await readOutsidePicture(address, { fetch: async () => new Response("image", { headers: { "content-type": "image/png" } }) })).status, "read");
  assert.equal((await readOutsidePicture(address, { fetch: async () => new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } }) })).status, "failed");
});
test("a picture over 20 MiB is still read: the limit applies to the prepared files, as when adding", async () => {
  const big = new Uint8Array(20 * 1024 * 1024 + 1); big.set(png);
  const read = await readOutsidePicture(address, { fetch: async () => new Response(big, { headers: { "content-type": "image/png" } }) });
  assert.equal(read.status, "read");
  const f = fixture(); f.input.prepare = async () => { throw new Error("media/images/mobbin-og-image.webp is larger than the 20 MiB limit."); };
  const result = await bringInOutsidePictures(f.input);
  assert.equal(result.left[0].reason, "failed"); assert.match(result.left[0].note!, /20 MiB/); assert.equal(f.calls(), 0);
});
test("only the img tag changes, link and other bytes survive, outside srcset replaced", async () => {
  const source = 'prefix\n<a href="' + address + '"><img src="' + address + '" srcset="https://other.test/x.png 480w" alt=Logo class="hero"></a>\nsuffix';
  const f = fixture(source);
  const result = await bringInOutsidePictures(f.input);
  assert.equal(f.calls(), 1); assert.deepEqual(result.brought, [{ key: address, path: "media/images/mobbin-og-image.webp" }]);
  const written = f.written();
  assert.ok(written.startsWith('prefix\n<a href="' + address + '">')); assert.ok(written.endsWith("</a>\nsuffix"));
  assert.match(written, /alt=Logo class="hero"/); assert.match(written, /width="1200" height="600"/);
  assert.match(written, /sizes="auto, 100vw"/); assert.match(written, /loading="lazy"/);
  assert.match(written, /srcset="\/media\/images\/mobbin-og-image-480.webp 480w, \/media\/images\/mobbin-og-image.webp 1200w"/);
  assert.ok(!written.includes("other.test"));
});
test("pure rewrite applies descending ranges and keeps authored loading, sizes and priority", () => {
  const source = '<img src="x" loading="eager" fetchpriority="high"><span>same</span><img src="y" sizes="50vw">';
  const replacements = [0, 1].map(index => ({ picture: picture(source, index), image: { path: "media/images/x.webp", alt: "", width: 800, height: 400, variants: [{ path: "media/images/x-480.webp", width: 480 }] } }));
  const result = rewriteOutsidePictures(source, replacements);
  assert.match(result, /<span>same<\/span>/); assert.match(result, /loading="eager" fetchpriority="high"/); assert.match(result, /sizes="50vw"/);
  assert.ok(!result.includes('loading="lazy"')); assert.ok(!result.includes("auto,"));
});
test("conflicts numbered, one fetch/import for repeated picture in row and across rows", async () => {
  const f = fixture('<img src="' + address + '"><img src="' + address + '">');
  f.input.pictures!.push(picture(f.input.source, 1)); f.input.brought = new Map();
  const paths = new Set(["media/images/mobbin-og-image.webp", "media/images/mobbin-og-image-2.webp"]); f.input.paths = paths;
  const workspace = f.input.workspace;
  // The fake importer uses its own reservation set; seed it through a first import's external paths.
  f.input.workspace = { async import(requests, place) {
    assert.equal(requests.length, 1);
    const path = chooseMediaPath({ folder: "media/images", name: "mobbin-og-image.webp", copies: [480], paths });
    assert.equal(path, "media/images/mobbin-og-image-3.webp");
    place!.apply([path], requests, f.input.records);
    return [path];
  } };
  const first = await bringInOutsidePictures(f.input); assert.equal(first.brought.length, 2); assert.equal(f.reads(), 1);
  const second = fixture(); second.input.brought = f.input.brought; second.input.fetch = f.input.fetch;
  await bringInOutsidePictures(second.input); assert.equal(f.reads(), 1); assert.equal(second.calls(), 1);
  assert.match(second.written(), /srcset=/);
  f.input.workspace = workspace;
});
test("sharing address uses site's address without responsive copies", async () => {
  const f = fixture('<meta property="og:image" content="' + address + '">');
  f.input.siteUrl = "https://my.test/subfolder";
  const workspace = f.input.workspace;
  f.input.workspace = { async import(requests, place) { assert.equal(requests[0].result?.outputs.length, 1); return workspace.import(requests, place); } };
  await bringInOutsidePictures(f.input);
  assert.match(f.written(), /content="https:\/\/my.test\/subfolder\/media\/images\/mobbin-og-image.webp"/);
  assert.ok(!f.written().includes("srcset"));
});
test("own copy uses adding recipe, keep original and its own tidy name; never fetches", async () => {
  const f = fixture(); f.input.own = new Map([[address, new File([png], "My Copy.png", { type: "image/png" })]]);
  f.input.records.adding = { image: "smaller", keepOriginal: true };
  f.input.prepare = async (...args) => { assert.equal(args[0].name, "My Copy.png"); assert.equal(args[7], "smaller"); assert.equal(args[8], true); return prepare(...args); };
  const result = await bringInOutsidePictures(f.input);
  assert.equal(result.brought[0].path, "media/images/my-copy.webp"); assert.equal(f.reads(), 0);
});
test("failures, unticked pictures and outside picture sources remain byte-identical", async () => {
  for (const status of [404, 403]) {
    const f = fixture(); f.input.fetch = async () => new Response("", { status });
    const result = await bringInOutsidePictures(f.input);
    assert.equal(result.left[0].reason, status === 404 ? "gone" : "not-allowed"); assert.equal(f.calls(), 0); assert.equal(f.written(), f.input.source);
  }
  const f = fixture();
  f.input.pictures![0].ticked = false; assert.deepEqual((await bringInOutsidePictures(f.input)).left, []); assert.equal(f.calls(), 0);
});
test("abort, live cancellation, changed repository and stale file save nothing", async () => {
  for (const mode of ["abort", "live", "repository", "stale"]) {
    const f = fixture(), controller = new AbortController(); f.input.signal = controller.signal;
    let current = true; f.input.live = () => current;
    f.input.assertLive = () => { if (mode === "repository" && !current) throw new Error("Repository changed"); };
    f.input.prepare = async (...args) => {
      const result = await prepare(...args);
      if (mode === "abort") controller.abort();
      else if (mode === "stale") f.change("new source");
      else current = false;
      return result;
    };
    await assert.rejects(bringInOutsidePictures(f.input)); assert.equal(f.written(), mode === "stale" ? "new source" : f.input.source);
    if (mode !== "stale") assert.equal(f.calls(), 0);
  }
});
test("agent rule refuses even own/shared files and never fetches, prepares or imports", async () => {
  assert.equal(outsidePicturesAllowed("agent"), false); assert.equal(outsidePicturesAllowed("lex"), true);
  const f = fixture(); f.input.by = "agent"; f.input.own = new Map([[address, new File([png], "own.png")]]);
  f.input.brought = new Map([[address, "media/images/existing.webp"]]);
  f.input.prepare = async () => { assert.fail("agent prepared media"); };
  const result = await bringInOutsidePictures(f.input); assert.equal(result.left.length, 1);
  assert.equal(result.left[0].reason, "for-lex");
  assert.equal(f.reads(), 0); assert.equal(f.calls(), 0);
});
test("a sharing picture brought in first is not reused by page pictures with the same address", async () => {
  const brought = new Map<string, string>();
  const sharing = fixture('<meta property="og:image" content="' + address + '">'), page = fixture();
  sharing.input.brought = brought; page.input.brought = brought;
  await bringInOutsidePictures(sharing.input); await bringInOutsidePictures(page.input);
  assert.equal(page.calls(), 1, "the page picture is prepared with its own copies");
  assert.match(page.written(), /srcset="\/media\/images\/mobbin-og-image-480\.webp 480w, /);
});
test("failed reads are cached across rows for the run, with no writes", async () => {
  for (const status of [404, 403]) {
    const brought = new Map<string, string>();
    const first = fixture(), second = fixture(); let reads = 0;
    const fetch: typeof globalThis.fetch = async () => { reads++; return new Response("", { status }); };
    for (const f of [first, second]) {
      f.input.fetch = fetch; f.input.brought = brought;
      assert.equal((await bringInOutsidePictures(f.input)).left.length, 1); assert.equal(f.calls(), 0);
    }
    assert.equal(reads, 1);
  }
});
test("cancel at the commit boundary leaves the row and shared map unchanged", async () => {
  const f = fixture(), brought = new Map<string, string>();
  f.input.brought = brought;
  f.input.workspace = { async import(_requests, place) {
    f.input.live = () => false;
    assert.equal(place?.live?.(), false);
    throw new DOMException("Cancelled", "AbortError");
  } };
  await assert.rejects(bringInOutsidePictures(f.input));
  assert.equal(brought.size, 0); assert.equal(f.written(), f.input.source);
});
test("animated GIF preparation retains GIF bytes instead of making a video", async () => {
  const f = fixture(), gif = new File([new Uint8Array([71, 73, 70, 56, 57, 97, 2, 0, 3, 0])], "mobbin-animation.gif", { type: "image/gif" });
  f.input.own = new Map([[address, gif]]);
  f.input.prepare = async (...args) => {
    const output = await args[10]!(gif, "balanced");
    assert.equal(output.outputs[0].blob, gif);
    assert.equal(output.outputs[0].extension, "gif");
    assert.equal(output.outputs[0].width, 2); assert.equal(output.outputs[0].height, 3);
    return { request: { file: gif, folder: "media/images", result: output } };
  };
  const result = await bringInOutsidePictures(f.input);
  assert.equal(result.brought[0].path, "media/images/mobbin-animation.gif");
});

test("a <picture> around an outside picture loses its wrapper and sources; the link stays", async () => {
  for (const [sources, artDirected] of [
    ['<source srcset="https://other.test/x.avif" type="image/avif">', false],
    ['<source media="(max-width: 600px)" srcset="/media/images/local-narrow.webp">', true],
  ] as const) {
    const source = '<p>Hi</p><a href="' + address + '"><picture>' + sources + '<img src="' + address + '" alt=Logo></picture></a><p>End</p>';
    const f = fixture(source);
    const result = await bringInOutsidePictures(f.input);
    assert.equal(f.written().startsWith('<p>Hi</p><a href="' + address + '"><img '), true, f.written());
    assert.ok(f.written().endsWith(' alt=Logo></a><p>End</p>'), f.written());
    assert.ok(!f.written().includes("<picture") && !f.written().includes("<source"));
    assert.match(f.written(), /src="\/media\/images\/mobbin-og-image\.webp"/);
    assert.deepEqual(result.notes.includes("The brought-in picture is now used on all screens."), artDirected);
  }
});
