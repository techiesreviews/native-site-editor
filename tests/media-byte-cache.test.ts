import { test } from "node:test";
import assert from "node:assert/strict";
import { createMediaByteCache, type MediaByteCachePorts } from "../src/page-builder/media-byte-cache";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture(overrides: Partial<MediaByteCachePorts> = {}) {
  const versions = new Map([["photo.jpg", "v1"]]);
  const loads: string[] = [], decodes: string[] = [], revoked: string[] = [];
  let alive = true, serial = 0;
  const ports = {
    load: async (path: string) => { loads.push(path); return new Blob([path]); },
    version: (path: string) => versions.get(path), alive: () => alive,
    createUrl: () => `blob:${++serial}`, revokeUrl: (url: string) => { revoked.push(url); },
    decode: async (url: string) => { decodes.push(url); return { width: 20, height: 10 }; },
    ...overrides,
  } satisfies MediaByteCachePorts;
  return { cache: createMediaByteCache(ports), versions, loads, decodes, revoked, close: () => { alive = false; } };
}

test("get shares one promise, load and decode per path per version", async () => {
  const f = fixture();
  const first = f.cache.get("photo.jpg"), second = f.cache.get("photo.jpg");
  assert.equal(first, second);
  const bytes = await first;
  assert.deepEqual({ width: bytes.width, height: bytes.height, version: bytes.version }, { width: 20, height: 10, version: "v1" });
  assert.equal(f.cache.get("photo.jpg"), first);
  assert.deepEqual(f.loads, ["photo.jpg"]);
  assert.deepEqual(f.decodes, [bytes.url]);
  f.cache.dispose();
});

test("sync retains unchanged version; new version reloads and revokes old URL", async () => {
  const f = fixture(), first = f.cache.get("photo.jpg");
  const old = await first;
  f.cache.sync([{ path: "photo.jpg", version: "v1" }]);
  assert.equal(f.cache.get("photo.jpg"), first);
  assert.deepEqual(f.revoked, []);
  f.versions.set("photo.jpg", "v2");
  f.cache.sync([{ path: "photo.jpg", version: "v2" }]);
  const next = f.cache.get("photo.jpg");
  assert.notEqual(first, next);
  const bytes = await next;
  assert.equal(bytes.version, "v2");
  assert.notEqual(bytes.url, old.url);
  assert.deepEqual(f.revoked, [old.url]);
  assert.equal(f.loads.length, 2);
  assert.equal(f.decodes.length, 2);
  f.cache.dispose();
});

test("clear revokes cached URLs after settlement but keeps Optimise previews until dispose", async () => {
  const f = fixture();
  const bytes = await Promise.all([f.cache.get("photo.jpg"), f.cache.get("other.jpg")]);
  const preview = f.cache.objectUrl(new Blob(["preview"]));
  f.cache.clear();
  await Promise.resolve();
  assert.deepEqual(f.revoked, bytes.map(item => item.url));
  assert.ok(!f.revoked.includes(preview));
  await f.cache.get("photo.jpg");
  assert.equal(f.loads.length, 3);
  f.cache.dispose();
  assert.ok(f.revoked.includes(preview));
});

test("dropping a pending load revokes only after decoding settles", async () => {
  const load = deferred<Blob>(), decode = deferred<{ width?: number; height?: number }>();
  const f = fixture({ load: () => load.promise, decode: () => decode.promise });
  const pending = f.cache.get("photo.jpg");
  f.cache.drop("photo.jpg");
  assert.deepEqual(f.revoked, []);
  load.resolve(new Blob(["image"]));
  await Promise.resolve();
  assert.deepEqual(f.revoked, []);
  decode.resolve({ width: 4 });
  const bytes = await pending;
  assert.deepEqual(f.revoked, [bytes.url]);
  f.cache.dispose();
});

test("dropping a rejected decode still releases its URL", async () => {
  const decode = deferred<{ width?: number; height?: number }>();
  const f = fixture({ decode: () => decode.promise });
  const pending = f.cache.get("photo.jpg");
  await Promise.resolve();
  f.cache.drop("photo.jpg");
  decode.reject(new Error("decode failed"));
  await assert.rejects(pending, /decode failed/);
  assert.deepEqual(f.revoked, ["blob:1"]);
});

test("dropping an entry never revokes a URL still used by another cached entry", async () => {
  const f = fixture({ createUrl: () => "blob:shared" });
  await Promise.all([f.cache.get("photo.jpg"), f.cache.get("other.jpg")]);
  f.cache.drop("photo.jpg");
  await Promise.resolve();
  assert.deepEqual(f.revoked, []);
  f.cache.drop("other.jpg");
  await Promise.resolve();
  assert.deepEqual(f.revoked, ["blob:shared"]);
});

test("dispose revokes cached and preview URLs once, including pending decode", async () => {
  const decode = deferred<{ width?: number; height?: number }>();
  const f = fixture({ decode: () => decode.promise });
  const pending = f.cache.get("photo.jpg");
  await Promise.resolve();
  const preview = f.cache.objectUrl(new Blob(["preview"]));
  f.cache.dispose();
  assert.deepEqual(f.revoked, ["blob:1", preview]);
  decode.resolve({});
  await pending;
  f.cache.dispose();
  assert.deepEqual(f.revoked, ["blob:1", preview]);
});

test("a view closed while loading rejects without creating or decoding a URL", async () => {
  const load = deferred<Blob>();
  const f = fixture({ load: () => load.promise });
  const pending = f.cache.get("photo.jpg");
  f.close();
  load.resolve(new Blob(["image"]));
  await assert.rejects(pending, { message: "Image library closed." });
  assert.deepEqual(f.decodes, []);
  assert.deepEqual(f.revoked, []);
  f.cache.dispose();
});

test("dispose during a pending load also rejects with the closed-view error", async () => {
  const load = deferred<Blob>();
  const f = fixture({ load: () => load.promise });
  const pending = f.cache.get("photo.jpg");
  f.cache.dispose();
  load.resolve(new Blob());
  await assert.rejects(pending, { message: "Image library closed." });
  assert.deepEqual(f.revoked, []);
});
