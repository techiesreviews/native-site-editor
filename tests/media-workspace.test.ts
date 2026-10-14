import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMediaWorkspaceBatch, createMediaWorkspace, type MediaWorkspaceBatch, type MediaWorkspaceContext } from "../src/page-builder/media-workspace";
import { MEDIA_RECORDS_PATH, parseMediaRecords } from "../shared/media-records";
import { memoryUploadBytes, gitBlobSha } from "../src/uploads";

function fixture() {
  const text = new Map<string, string>([
    ["index.html", '<head></head><body><img src="/images/a.png" alt="Keep this alt"></body>'],
    ["styles/site.css", '.hero { background:url(/images/a.png); }'],
    [MEDIA_RECORDS_PATH, '{"images/a.png":{"alt":"Default","tags":["hero"]}}'],
  ]);
  const paths = new Set([...text.keys(), "images/a.png", "images/unused.png"]);
  const bytes = new Map([ ["images/a.png", new Blob(["original"])], ["images/unused.png", new Blob(["unused"])] ]);
  const versions = new Map([ ["images/a.png", "a-v1"], ["images/unused.png", "unused-v1"] ]);
  const history: (() => void)[] = [];
  const batches: MediaWorkspaceBatch[] = [];
  let live = true, failStage = false, failCommit = false;
  let afterRead: (() => void) | undefined, afterStage: (() => void) | undefined;
  const restore = (state: { text: Map<string, string>; paths: Set<string>; bytes: Map<string, Blob>; versions: Map<string, string> }) => {
    text.clear(); state.text.forEach((value, key) => text.set(key, value));
    paths.clear(); state.paths.forEach((value) => paths.add(value));
    bytes.clear(); state.bytes.forEach((value, key) => bytes.set(key, value));
    versions.clear(); state.versions.forEach((value, key) => versions.set(key, value));
  };
  const stamp = { holds: () => live, changed: () => live ? undefined : "scope" as const };
  const context: MediaWorkspaceContext = {
    history: true, removedCopies: memoryUploadBytes(), now: () => Date.parse("2026-10-14T12:00:00Z"), key: "owner/repo:main", scope: { account: "owner", repoId: 1, repo: "owner/repo", branch: "main" },
    drafts: { get() { return undefined; }, save() { throw new Error("Legacy draft mutation"); }, remove() { throw new Error("Legacy draft mutation"); } },
    get paths() { return [...paths]; },
    get items() { return [...bytes.keys()].map((path) => ({ path })); },
    pages: ["index.html"], components: {},
    assertLive() { if (!stamp.holds()) throw new Error("Repository scope changed"); },
    async read(path) { const value = text.get(path); if (path === MEDIA_RECORDS_PATH) afterRead?.(); return value; },
    async blob(path) { return bytes.get(path)!; },
    assetVersion(path) { return versions.get(path); },
    async openPage() {},
    async applyBatch(batch) {
      batches.push(batch);
      await applyMediaWorkspaceBatch(batch, {
        assertLive: () => context.assertLive(), paths: () => [...paths], source: (path) => text.get(path), assetVersion: (path) => versions.get(path),
        async snapshot() { return { text: new Map(text), paths: new Set(paths), bytes: new Map(bytes), versions: new Map(versions), committed: false, owned: [] as string[] }; },
        async stage(batch, state) {
          for (const upload of batch.uploads) { if (!bytes.has(upload.path)) state.owned.push(upload.path); bytes.set(upload.path, upload.blob); if (failStage) throw new Error("Byte storage failed"); }
          afterStage?.();
        },
        commit(batch, state) {
          state.committed = true;
          for (const move of batch.moves) { bytes.set(move.to, bytes.get(move.from)!); bytes.delete(move.from); paths.delete(move.from); paths.add(move.to); versions.set(move.to, versions.get(move.from)!); versions.delete(move.from); }
          for (const path of batch.deletes) { bytes.delete(path); paths.delete(path); versions.delete(path); }
          for (const { path, sha } of batch.restores) { paths.add(path); versions.set(path, sha); }
          for (const [path, value] of batch.edits) { text.set(path, value); paths.add(path); }
          for (const upload of batch.uploads) { paths.add(upload.path); versions.set(upload.path, `upload:${upload.path}`); }
          if (failCommit) throw new Error("Draft storage failed");
          history.push(() => restore(state));
        },
        async rollback(_batch, state) {
          if (state.committed) restore(state);
          else for (const path of state.owned) bytes.delete(path);
        },
      });
    },
  };
  const host = createMediaWorkspace(async () => context);
  return { host, context, text, paths, bytes, versions, batches, history, setLive(value: boolean) { live = value; }, failStage() { failStage = true; }, failCommit() { failCommit = true; }, afterRead(work: () => void) { afterRead = work; }, afterStage(work: () => void) { afterStage = work; } };
}

test("rename moves binary, HTML/CSS references and metadata in one undoable transaction", async () => {
  const f = fixture(); await f.host.load();
  f.text.set(MEDIA_RECORDS_PATH, '{"images/a.png":{"alt":"Default","tags":["hero"],"credit":"Artist"}}');
  await f.host.rename("images/a.png", "garden.png");
  assert.equal(f.batches.length, 1);
  assert.deepEqual(f.batches[0].moves, [{ from: "images/a.png", to: "images/garden.png" }]);
  assert.ok(f.text.get("index.html")!.includes('/images/garden.png" alt="Keep this alt"'));
  assert.ok(f.text.get("styles/site.css")!.includes("/images/garden.png"));
  assert.equal(JSON.parse(f.text.get(MEDIA_RECORDS_PATH)!).version, 2);
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/garden.png"].description?.text, "Default");
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/garden.png"].credit, "Artist");
  assert.equal(f.history.length, 1);
  f.history.pop()!();
  assert.equal(f.paths.has("images/garden.png"), false);
  assert.equal(await f.bytes.get("images/a.png")!.text(), "original");
  assert.ok(f.text.get("index.html")!.includes("/images/a.png"));
});
test("delete removes binary and metadata together; one Undo restores both", async () => {
  const f = fixture(); await f.host.load(); await f.host.remove(["images/a.png"]);
  assert.equal(f.batches.length, 1); assert.equal(f.bytes.has("images/a.png"), false);
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/a.png"], undefined);
  f.history.pop()!(); assert.equal(f.bytes.has("images/a.png"), true);
  assert.ok(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/a.png"]);
});

test("several families remove and restore in one batch each; Undo of restore returns the list", async () => {
  const f = fixture();
  for (const path of ["images/a-480.webp", "media/originals/a.heic", "images/a-crop.webp"]) {
    f.paths.add(path); f.bytes.set(path, new Blob([path])); f.versions.set(path, path + "-sha");
  }
  await f.host.load();
  await f.host.remove(["images/a.png", "images/unused.png"]);
  const removed = (await f.host.load()).removed!;
  assert.equal(removed.length, 2); assert.equal(f.history.length, 1);
  assert.equal(removed[0].date, "2026-10-14");
  assert.deepEqual(removed.find(entry => entry.path === "images/a.png")?.family?.map(member => member.path), ["images/a-480.webp", "media/originals/a.heic"]);
  assert.ok(f.paths.has("images/a-crop.webp"));
  await f.host.restore(removed.map(entry => ({ path: entry.path, id: entry.sha! })));
  assert.equal(f.batches.length, 2); assert.equal(f.history.length, 2);
  assert.equal(f.batches[1].label, "Restore files"); assert.equal(f.batches[1].restores.length, 4);
  assert.equal(f.batches[1].uploads.length, 0); assert.equal((await f.host.load()).removed?.length, 0);
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/a.png"].description?.text, "Default");
  f.history.pop()!();
  assert.equal((await f.host.load()).removed?.length, 2); assert.equal(f.paths.has("images/a.png"), false);
  f.history.pop()!(); assert.ok(f.paths.has("images/a.png"));
});

test("local removals store current bytes; missing browser copies refuse the whole restore", async () => {
  const f = fixture(), store = memoryUploadBytes();
  f.context.history = false; f.context.removedCopies = store;
  await f.host.load(); await f.host.remove(["images/unused.png"]);
  const entry = (await f.host.load()).removed![0], key = entry.browserKey!;
  assert.equal(key, `removed:2026-10-14:${await gitBlobSha(new TextEncoder().encode("unused"))}`);
  assert.equal(entry.sha, undefined); assert.equal(await (await store.get(key))?.text(), "unused");
  await store.delete(key);
  await assert.rejects(f.host.restore([{ path: entry.path, id: key }]), /unused.png was kept in this browser only and its copy is gone/);
  assert.equal(f.batches.length, 1); assert.equal((await f.host.load()).removed?.length, 1);
  await store.put(key, new Blob(["unused"]));
  await f.host.restore([{ path: entry.path, id: key }]);
  assert.equal(f.batches[1].restores.length, 0); assert.equal(await f.batches[1].uploads[0].blob.text(), "unused");
  assert.equal(f.batches[1].label, "Restore unused.png"); assert.equal((await f.host.load()).removed?.length, 0);
});

test("a conflict in the last selected family refuses every restore", async () => {
  const f = fixture(); await f.host.load(); await f.host.remove(["images/a.png", "images/unused.png"]);
  const entries = (await f.host.load()).removed!.map(entry => ({ path: entry.path, id: entry.sha! }));
  f.paths.add("images/unused.png"); f.versions.set("images/unused.png", "different");
  await assert.rejects(f.host.restore(entries), /images\/unused.png already exists/);
  assert.equal(f.batches.length, 1); assert.equal(f.paths.has("images/a.png"), false);
  assert.equal((await f.host.load()).removed?.length, 2);
});

test("removal and restore writes prune expired and already-back entries", async () => {
  const f = fixture();
  const records = parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH));
  records.removed = [
    { path: "expired.png", sha: "expired", date: "2026-09-13" },
    { path: "images/a.png", sha: "a-v1", date: "2026-10-14" },
    { path: "retained.png", sha: "retained", date: "2026-09-14" },
  ];
  f.text.set(MEDIA_RECORDS_PATH, JSON.stringify(records));
  await f.host.load(); await f.host.remove(["images/unused.png"]);
  assert.deepEqual(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).removed?.map(entry => entry.path), ["retained.png", "images/unused.png"]);
  f.context.now = () => Date.parse("2026-10-15T12:00:00Z");
  await f.host.restore([{ path: "images/unused.png", id: "unused-v1" }]);
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).removed?.length ?? 0, 0);
});
test("async source and asset changes reject entire rename without erasing other edits", async () => {
  for (const asset of [false, true]) {
    const f = fixture(); await f.host.load();
    f.afterRead(() => asset ? f.versions.set("images/a.png", "a-v2") : f.text.set("index.html", "New user source"));
    await assert.rejects(f.host.rename("images/a.png", "garden.png"), /changed while preparing/);
    assert.equal(f.paths.has("images/garden.png"), false); assert.equal(f.history.length, 0);
    assert.equal(asset ? f.versions.get("images/a.png") : f.text.get("index.html"), asset ? "a-v2" : "New user source");
  }
});
test("upload families, copied metadata and reference replacement share one transaction", async () => {
  const f = fixture(); await f.host.load();
  const output = (value: string, variantWidth?: number) => ({ blob: new Blob([value], { type: "image/webp" }), extension: "webp", variantWidth });
  await f.host.import([
    { file: new File(["original"], "images/a.png"), result: { outputs: [output("primary"), output("small", 480)], before: 8, after: 7 }, folder: "images", replaceFrom: "images/a.png", expectedAssetVersion: "a-v1", metadata: { alt: "Default", tags: ["hero"] } },
    { file: new File(["second"], "a.png"), result: { outputs: [output("second")], before: 6, after: 6 }, folder: "images" },
  ]);
  assert.equal(f.batches.length, 1); assert.equal(f.history.length, 1);
  assert.deepEqual(f.batches[0].uploads.map((item) => item.path), ["images/a-2.webp", "images/a-2-480.webp", "images/a-3.webp"]);
  assert.ok(f.text.get("index.html")!.includes("/images/a-2.webp"));
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/a-2.webp"].description?.text, "Default");
  f.history.pop()!();
  assert.equal(f.bytes.has("images/a-2.webp"), false); assert.equal(f.paths.has("images/a-2-480.webp"), false);
  assert.equal(await f.bytes.get("images/a.png")!.text(), "original");
});
test("new files join the viewed collection in the same batch; without one the records stay as they were", async () => {
  const f = fixture(); await f.host.load();
  await f.host.collections({ kind: "new", name: "Studio picks" });
  const before = f.text.get(MEDIA_RECORDS_PATH);
  const request = (name: string, collection?: string) => ({
    file: new File(["bytes"], name), result: { outputs: [{ blob: new Blob([name], { type: "image/webp" }), extension: "webp" }], before: 5, after: 4 },
    folder: "images", ...collection ? { collection } : {},
  });
  // Under All collections: the same upload as before, records untouched.
  assert.deepEqual(await f.host.import([request("plain.png")]), ["images/plain.webp"]);
  assert.equal(f.text.get(MEDIA_RECORDS_PATH), before);
  // Viewing a collection: both files and their memberships in one batch, one Undo step.
  const batches = f.batches.length, steps = f.history.length;
  assert.deepEqual(await f.host.import([request("one.png", "Studio picks"), request("two.png", "Studio picks")]), ["images/one.webp", "images/two.webp"]);
  assert.equal(f.batches.length, batches + 1); assert.equal(f.history.length, steps + 1);
  const records = parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH));
  assert.deepEqual(records.files["images/one.webp"].collections, ["Studio picks"]);
  assert.deepEqual(records.files["images/two.webp"].collections, ["Studio picks"]);
  assert.equal(records.files["images/plain.webp"], undefined);
  f.history.pop()!();
  assert.equal(f.bytes.has("images/one.webp"), false);
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/one.webp"], undefined);
  // A collection removed meanwhile refuses the whole batch: nothing half-added.
  await assert.rejects(f.host.import([request("three.png", "Gone")]), /no collection called "Gone"/);
  assert.equal(f.bytes.has("images/three.webp"), false);
});
test("staging failure and commit failure restore owned bytes, paths and drafts without partial uploads", async () => {
  for (const failStage of [true, false]) {
    const f = fixture(); await f.host.load(); failStage ? f.failStage() : f.failCommit();
    await assert.rejects(f.host.import([{ file: new File(["bytes"], "new.png"), result: { outputs: [{ blob: new Blob(["new"]), extension: "png" }], before: 5, after: 3 }, folder: "images" }]), /storage failed/);
    assert.equal(f.bytes.has("images/new.png"), false); assert.equal(f.paths.has("images/new.png"), false);
    assert.equal(f.history.length, 0); assert.equal(await f.bytes.get("images/a.png")!.text(), "original");
  }
});
test("last guard after byte staging preserves an intervening source edit and removes owned bytes", async () => {
  const f = fixture(); await f.host.load(); f.afterStage(() => f.text.set(MEDIA_RECORDS_PATH, '{"other.png":{"alt":"User edit"}}'));
  await assert.rejects(f.host.import([{ file: new File(["bytes"], "new.png"), result: { outputs: [{ blob: new Blob(["new"]), extension: "png" }], before: 5, after: 3 }, folder: "images" }]), /changed while preparing/);
  assert.equal(f.bytes.has("images/new.png"), false); assert.equal(f.paths.has("images/new.png"), false);
  assert.equal(f.text.get(MEDIA_RECORDS_PATH), '{"other.png":{"alt":"User edit"}}');
});
test("used images cannot pass Delete unused and unread sources cannot be called unused", async () => {
  const f = fixture(); await f.host.load(); await assert.rejects(f.host.remove(["images/a.png"], true), /now referenced/);
  f.text.delete("styles/site.css");
  await assert.rejects(f.host.remove(["images/unused.png"], true), /usage is incomplete/);
  assert.equal(f.batches.length, 0);
});
test("Delete unused refuses image-set strings and escaped url references", async () => {
  for (const css of ['.x{background:image-set("/images/unused.png" 1x)}', '.x{background:u\\72l(/images/unused.png)}', '.x{background:u\\72\r\nl(/images/unused.png)}']) {
    const f = fixture(); f.text.set("styles/site.css", css); await f.host.load();
    await assert.rejects(f.host.remove(["images/unused.png"], true), /now referenced/);
    assert.equal(f.batches.length, 0); assert.equal(f.paths.has("images/unused.png"), true);
  }
});
test("scope changes reject before mutation", async () => {
  const f = fixture(); await f.host.load();
  f.setLive(false); await assert.rejects(f.host.rename("images/a.png", "garden.png"), /scope changed/);
  assert.equal(f.batches.length, 0);
});
test("encoded old bytes cannot replace a newer image; missing preview receipts fail closed", async () => {
  for (const receipt of [undefined, "a-v1"]) {
    const f = fixture(); await f.host.load();
    f.bytes.set("images/a.png", new Blob(["newer bytes B"])); f.versions.set("images/a.png", "a-v2");
    await assert.rejects(f.host.import([{ file: new File(["original bytes A"], "images/a.png"), result: { outputs: [{ blob: new Blob(["encoded A"]), extension: "webp" }], before: 16, after: 9 }, folder: "images", replaceFrom: "images/a.png", expectedAssetVersion: receipt }]), /revision was not captured|changed since its optimisation preview/);
    assert.equal(f.batches.length, 0); assert.equal(f.paths.has("images/a.webp"), false);
    assert.equal(await f.bytes.get("images/a.png")!.text(), "newer bytes B");
    assert.ok(f.text.get("index.html")!.includes("/images/a.png"));
  }
});
test("preview revision stays in the final batch even when a read races later", async () => {
  const f = fixture(); const library = await f.host.load();
  assert.equal(library.items.find((item) => item.path === "images/a.png")?.version, "a-v1");
  f.afterStage(() => f.versions.set("images/a.png", "a-v2"));
  await assert.rejects(f.host.import([{ file: new File(["original"], "images/a.png"), result: { outputs: [{ blob: new Blob(["encoded"]), extension: "webp" }], before: 8, after: 7 }, folder: "images", replaceFrom: "images/a.png", expectedAssetVersion: "a-v1" }]), /changed while preparing/);
  assert.equal(f.batches[0].expectedAssets.get("images/a.png"), "a-v1");
  assert.equal(f.paths.has("images/a.webp"), false); assert.equal(f.bytes.has("images/a.webp"), false);
});

function addFamily(f: ReturnType<typeof fixture>) {
  const members = ["images/a-480w.webp", "images/a-960.png", "media/originals/a.HEIC"];
  for (const path of members) { f.paths.add(path); f.bytes.set(path, new Blob([path])); f.versions.set(path, path + ":v1"); }
  // The library cannot preview HEIC, but the family still owns it.
  Object.defineProperty(f.context, "items", { get: () => [...f.bytes.keys()].filter(path => !path.endsWith(".HEIC")).map(path => ({ path })) });
  return members;
}

test("family rename rewrites srcset, captures hidden originals and undoes in one step", async () => {
  const f = fixture(), members = addFamily(f);
  f.text.set("index.html", '<img src="/images/a.png" srcset="/images/a-480w.webp 480w, /images/a-960.png 960w">');
  await f.host.load(); await f.host.rename("images/a.png", "garden.png");
  assert.deepEqual(f.batches[0].moves.map(move => move.to), ["images/garden.png", "images/garden-480w.webp", "images/garden-960.png", "media/originals/garden.HEIC"]);
  assert.equal(f.batches[0].expectedAssets.get(members[2]), members[2] + ":v1");
  assert.match(f.text.get("index.html")!, /garden-480w.webp 480w, \/images\/garden-960.png 960w/);
  assert.equal(f.history.length, 1); f.history.pop()!();
  for (const path of ["images/a.png", ...members]) assert.ok(f.bytes.has(path));
});

test("family delete removes every member and metadata in one Undo", async () => {
  const f = fixture(), members = addFamily(f);
  f.text.set(MEDIA_RECORDS_PATH, JSON.stringify(Object.fromEntries(["images/a.png", ...members].map(path => [path, { alt: "Family" }]))));
  await f.host.load(); await f.host.remove(["images/a.png", members[0]]);
  assert.deepEqual(f.batches[0].deletes, ["images/a.png", ...members]);
  assert.deepEqual(Object.keys(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files), []);
  assert.equal(f.history.length, 1); f.history.pop()!();
  for (const path of members) assert.ok(f.bytes.has(path));
});

test("Delete unused refuses a used responsive copy", async () => {
  const f = fixture(), members = addFamily(f);
  f.text.set("index.html", '<img src="/' + members[0] + '">'); f.text.set("styles/site.css", "");
  await f.host.load(); await assert.rejects(f.host.remove(["images/a.png"], true), /now referenced/);
  assert.equal(f.batches.length, 0);
});

test("hidden original changes during preparation reject the whole family rename", async () => {
  const f = fixture(), members = addFamily(f); await f.host.load();
  f.afterRead(() => f.versions.set(members[2], "newer"));
  await assert.rejects(f.host.rename("images/a.png", "garden.png"), /changed while preparing/);
  assert.equal(f.history.length, 0); assert.ok(f.paths.has("images/a.png"));
});

test("taken copy destination refuses the entire Images rename", async () => {
  const f = fixture(); addFamily(f); f.paths.add("images/garden-480w.webp");
  await f.host.load(); await assert.rejects(f.host.rename("images/a.png", "garden.png"), /is taken. Try images\/garden-2.png/);
  assert.equal(f.batches.length, 0);
});

test("every family member's record follows the rename, and Undo restores the old keys", async () => {
  const f = fixture(), members = addFamily(f);
  const before = { "images/a.png": { alt: "Main" }, [members[0]]: { tags: ["copy"] }, [members[2]]: { tags: ["original"] } };
  f.text.set(MEDIA_RECORDS_PATH, JSON.stringify(before));
  await f.host.load(); await f.host.rename("images/a.png", "garden.png");
  assert.deepEqual({ ...parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files }, {
    "images/garden.png": { description: { text: "Main" } }, "images/garden-480w.webp": { collections: ["copy"] }, "media/originals/garden.HEIC": { collections: ["original"] },
  });
  assert.equal(f.history.length, 1); f.history.pop()!();
  assert.deepEqual(JSON.parse(f.text.get(MEDIA_RECORDS_PATH)!), before);
});

test("description metadata rewrites shared and missing page alts with records in one undoable batch", async () => {
  const f = fixture(); await f.host.load();
  const original = '<img src="/images/a.png" alt="Default"><img src="/images/a.png" alt=""><img src="/images/a.png"><img src="/images/a.png" alt="a"><img src="/images/a.png" alt="a.png"><img src="/images/a.png" alt="Own words">';
  f.text.set("index.html", original);
  const css = f.text.get("styles/site.css");
  await f.host.metadata({ "images/a.png": { alt: "New description" } });
  assert.equal(f.batches.length, 1);
  assert.equal(f.batches[0].expectedSources.get("index.html"), original);
  assert.equal(f.batches[0].edits.size, 2);
  assert.equal((f.text.get("index.html")!.match(/alt="New description"/g) ?? []).length, 5);
  assert.ok(f.text.get("index.html")!.includes('alt="Own words"'));
  assert.equal(f.text.get("styles/site.css"), css);
  f.history.pop()!();
  assert.equal(f.text.get("index.html"), original);
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/a.png"].description?.text, "Default");
  await f.host.metadata({ "images/a.png": { decorative: true } });
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/a.png"].decorative, true);
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/a.png"].description, undefined);
  assert.equal((f.text.get("index.html")!.match(/alt=""/g) ?? []).length, 5);
  const decorated = f.text.get("index.html");
  await f.host.metadata({ "images/a.png": { decorative: false } });
  assert.equal(f.text.get("index.html"), decorated);
});

test("library load and Delete unused read scripts, notes and SVG text, and rename rewrites them", async () => {
  const f = fixture();
  f.context.origins = ["https://native.example"];
  for (const [file, source] of [
    ["app.js", 'const image = "/images/unused.png"'],
    ["AGENTS.md", "Keep unused.png"],
    ["embedded.svg", '<svg><image href="https://native.example/images/unused.png"/></svg>'],
  ]) { f.paths.add(file); f.text.set(file, source); }
  const loaded = await f.host.load();
  assert.deepEqual(loaded.usage["images/unused.png"].files, ["embedded.svg", "app.js", "AGENTS.md"]);
  await assert.rejects(() => f.host.remove!(["images/unused.png"], true), /now referenced/);
  await f.host.rename!("images/unused.png", "renamed.png");
  assert.equal(f.text.get("app.js"), 'const image = "/images/renamed.png"');
});

test("an uploaded SVG the host holds no source for is proved by its revision, so other renames still apply", async () => {
  const f = fixture();
  f.paths.add("images/logo.svg"); f.bytes.set("images/logo.svg", new Blob(["<svg/>"])); f.versions.set("images/logo.svg", "upload-v1");
  const read = f.context.read.bind(f.context);
  f.context.read = async (path) => path === "images/logo.svg" ? "<svg/>" : read(path);
  await f.host.load();
  await f.host.rename!("images/a.png", "b.png");
  assert.equal(f.batches.length, 1);
  assert.equal(f.batches[0].expectedSources.has("images/logo.svg"), false);
  assert.equal(f.batches[0].expectedAssets.get("images/logo.svg"), "upload-v1");
  assert.ok(f.paths.has("images/b.png"));
});

test("the Always keep mark reaches a family's main when only an original the library does not list is kept", async () => {
  const f = fixture();
  f.paths.add("media/originals/a.HEIC");
  f.text.set(MEDIA_RECORDS_PATH, JSON.stringify({ version: 2, collections: [], files: { "media/originals/a.HEIC": { alwaysKeep: true } } }));
  const library = await f.host.load();
  assert.ok(!library.items.some(item => item.path === "media/originals/a.HEIC"));
  assert.deepEqual(library.keep?.sort(), ["images/a.png", "media/originals/a.HEIC"]);
});

test("File details saves its fields and the rename as one step, even before media records exist", async () => {
  const f = fixture();
  f.text.delete(MEDIA_RECORDS_PATH); f.paths.delete(MEDIA_RECORDS_PATH);
  f.text.set("index.html", '<head></head><body><img src="/images/a.png"></body>');
  const before = new Map(f.text);
  await f.host.load();
  await f.host.details!("images/a.png", { alt: "A garden", decorative: false, alwaysKeep: true }, "Garden.png");
  assert.equal(f.batches.length, 1);
  assert.deepEqual(f.batches[0].moves, [{ from: "images/a.png", to: "images/garden.png" }]);
  assert.equal(f.text.get("index.html"), '<head></head><body><img alt="A garden" src="/images/garden.png"></body>');
  assert.ok(f.text.get("styles/site.css")!.includes("/images/garden.png"));
  const records = parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH));
  assert.deepEqual(records.files["images/garden.png"], { description: { text: "A garden" }, alwaysKeep: true });
  assert.equal(records.files["images/a.png"], undefined);
  // One Undo restores files, references and the absent records.
  assert.equal(f.history.length, 1);
  f.history.pop()!();
  assert.deepEqual(f.text, before);
  assert.equal(await f.bytes.get("images/a.png")!.text(), "original");
});

test("a refused rename in File details saves none of its fields", async () => {
  for (const name of ["unused.png", "garden.jpg", "a/b.png"]) {
    const f = fixture(); await f.host.load();
    const before = new Map(f.text);
    await assert.rejects(f.host.details!("images/a.png", { alt: "Changed", decorative: false, alwaysKeep: true }, name));
    assert.equal(f.batches.length, 0, name);
    assert.deepEqual(f.text, before, name);
    assert.equal(f.paths.has("images/a.png"), true);
  }
});

test("File details without a rename writes only the fields", async () => {
  const f = fixture(); await f.host.load();
  await f.host.details!("images/a.png", { alt: "Default", decorative: false, alwaysKeep: true });
  assert.equal(f.batches.length, 1); assert.deepEqual(f.batches[0].moves, []);
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/a.png"].alwaysKeep, true);
  assert.ok(f.text.get("index.html")!.includes('alt="Keep this alt"'));
});

test("File details renames a whole family with its fields in one step; a taken copy name refuses all of it", async () => {
  const f = fixture(), members = addFamily(f);
  f.text.set("index.html", '<img src="/images/a.png" srcset="/images/a-480w.webp 480w, /images/a-960.png 960w">');
  f.text.set(MEDIA_RECORDS_PATH, JSON.stringify({ [members[0]]: { tags: ["copy"] } }));
  const before = new Map(f.text);
  await f.host.load();
  await f.host.details!("images/a.png", { alt: "A garden", decorative: false, alwaysKeep: true }, "garden.png");
  assert.equal(f.batches.length, 1);
  assert.deepEqual(f.batches[0].moves.map(move => move.to), ["images/garden.png", "images/garden-480w.webp", "images/garden-960.png", "media/originals/garden.HEIC"]);
  assert.match(f.text.get("index.html")!, /alt="A garden"/);
  assert.match(f.text.get("index.html")!, /src="\/images\/garden.png" srcset="\/images\/garden-480w.webp 480w, \/images\/garden-960.png 960w"/);
  const files = parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files;
  assert.deepEqual(files["images/garden.png"], { description: { text: "A garden" }, alwaysKeep: true });
  assert.deepEqual(files["images/garden-480w.webp"], { collections: ["copy"] });
  f.history.pop()!();
  assert.deepEqual(f.text, before);
  for (const path of ["images/a.png", ...members]) assert.ok(f.bytes.has(path));
  const taken = fixture(); addFamily(taken); taken.paths.add("images/garden-480w.webp");
  const untouched = new Map(taken.text);
  await taken.host.load();
  await assert.rejects(taken.host.details!("images/a.png", { alt: "A garden", decorative: false, alwaysKeep: true }, "garden.png"), /images\/garden.png is taken. Try images\/garden-2.png/);
  assert.equal(taken.batches.length, 0); assert.deepEqual(taken.text, untouched);
});

test("To check: load lists agent words; OK clears a file's mark and keeps its words, as one Undo step", async () => {
  const f = fixture();
  f.text.set(MEDIA_RECORDS_PATH, JSON.stringify({ version: 2, collections: [], files: { "images/a.png": { description: { text: "Agent alt", byAgent: true } } } }));
  assert.deepEqual((await f.host.load()).toCheck, [{ file: "images/a.png", text: "Agent alt" }]);
  const row = { file: "images/a.png", text: "Agent alt" };
  await f.host.check!(row);
  assert.equal(f.batches.length, 1); assert.equal(f.batches[0].label, "Description checked");
  assert.deepEqual([...f.batches[0].edits.keys()], [MEDIA_RECORDS_PATH]);
  assert.deepEqual(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/a.png"].description, { text: "Agent alt" });
  assert.deepEqual((await f.host.load()).toCheck, []);
  // A row that is already checked refuses and writes nothing.
  await assert.rejects(f.host.check!(row), /changed meanwhile/);
  assert.equal(f.batches.length, 1);
  f.history.pop()!();
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/a.png"].description?.byAgent, true);
});

test("To check: Lex's edit of a file description updates the places using it and clears the mark", async () => {
  const f = fixture();
  f.text.set("index.html", '<img src="/images/a.png" alt="Agent alt"><img src="/images/a.png" alt=""><img src="/images/a.png" alt="a.png"><img src="/images/a.png" alt="Own">');
  f.text.set(MEDIA_RECORDS_PATH, JSON.stringify({ version: 2, collections: [], files: { "images/a.png": { description: { text: "Agent alt", byAgent: true } } } }));
  await f.host.load();
  const row = { file: "images/a.png", text: "Agent alt" };
  await assert.rejects(f.host.check!(row, "  "), /Write the description/);
  await f.host.check!(row, "Lex's words ");
  assert.equal(f.batches.length, 1); assert.equal(f.batches[0].label, "Edit description");
  assert.equal(f.text.get("index.html"), '<img src="/images/a.png" alt="Lex\'s words"><img src="/images/a.png" alt="Lex\'s words"><img src="/images/a.png" alt="Lex\'s words"><img src="/images/a.png" alt="Own">');
  assert.deepEqual(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/a.png"].description, { text: "Lex's words" });
  f.history.pop()!();
  assert.ok(f.text.get("index.html")!.includes('alt="Agent alt"'));
});

test("To check: a place's agent words clear on OK, or on Lex's words written into the page in the same step", async () => {
  const records = JSON.stringify({ version: 2, collections: [], files: { "images/a.png": { places: { "index.html": { agentText: "Agent place" } } } } });
  const f = fixture();
  f.text.set("index.html", '<img src="/images/a.png" alt="Agent place">');
  f.text.set(MEDIA_RECORDS_PATH, records);
  assert.deepEqual((await f.host.load()).toCheck, [{ file: "images/a.png", page: "index.html", text: "Agent place" }]);
  const row = { file: "images/a.png", page: "index.html", text: "Agent place" };
  await f.host.check!(row);
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/a.png"].places, undefined);
  assert.equal(f.text.get("index.html"), '<img src="/images/a.png" alt="Agent place">');
  f.history.pop()!();
  await f.host.load();
  await f.host.check!(row, "Lex place");
  assert.equal(f.batches.length, 2);
  assert.deepEqual([...f.batches[1].edits.keys()].sort(), [MEDIA_RECORDS_PATH, "index.html"].sort());
  assert.equal(f.text.get("index.html"), '<img src="/images/a.png" alt="Lex place">');
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/a.png"].places, undefined);
  f.history.pop()!();
  assert.equal(f.text.get("index.html"), '<img src="/images/a.png" alt="Agent place">');
  assert.equal(f.text.get(MEDIA_RECORDS_PATH), records);
});

test("To check refuses OK or Save on words an agent changed after Lex saw them, writing nothing", async () => {
  const f = fixture();
  const records = (description: string, place: string) => JSON.stringify({ version: 2, collections: [], files: {
    "images/a.png": { description: { text: description, byAgent: true }, places: { "index.html": { agentText: place } } } } });
  f.text.set("index.html", '<img src="/images/a.png" alt="Place B">');
  f.text.set(MEDIA_RECORDS_PATH, records("Words A", "Place A"));
  await f.host.load();
  // The agent writes B after Lex saw A.
  f.text.set(MEDIA_RECORDS_PATH, records("Words B", "Place B"));
  for (const [row, text] of [[{ file: "images/a.png", text: "Words A" }, undefined], [{ file: "images/a.png", text: "Words A" }, "Lex"],
    [{ file: "images/a.png", page: "index.html", text: "Place A" }, undefined], [{ file: "images/a.png", page: "index.html", text: "Place A" }, "Lex"]] as const)
    await assert.rejects(f.host.check!(row, text), /changed meanwhile/);
  assert.equal(f.batches.length, 0);
  assert.equal(f.text.get(MEDIA_RECORDS_PATH), records("Words B", "Place B"));
  assert.equal((await f.host.load()).toCheck?.length, 2);
});

test("To check: saving the same words counts as OK for a file and a place; one Undo restores each mark", async () => {
  const f = fixture();
  const records = JSON.stringify({ version: 2, collections: [], files: {
    "images/a.png": { description: { text: "Agent alt", byAgent: true }, places: { "index.html": { agentText: "Agent place" } } } } });
  f.text.set("index.html", '<img src="/images/a.png" alt="Agent place">');
  f.text.set(MEDIA_RECORDS_PATH, records);
  await f.host.load();
  await f.host.check!({ file: "images/a.png", text: "Agent alt" }, " Agent alt ");
  await f.host.check!({ file: "images/a.png", page: "index.html", text: "Agent place" }, "Agent place");
  assert.deepEqual(f.batches.map(batch => [batch.label, [...batch.edits.keys()]]), [["Description checked", [MEDIA_RECORDS_PATH]], ["Description checked", [MEDIA_RECORDS_PATH]]]);
  assert.equal(f.text.get("index.html"), '<img src="/images/a.png" alt="Agent place">');
  assert.deepEqual(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/a.png"], { description: { text: "Agent alt" } });
  assert.deepEqual((await f.host.load()).toCheck, []);
  f.history.pop()!();
  assert.deepEqual((await f.host.load()).toCheck, [{ file: "images/a.png", page: "index.html", text: "Agent place" }]);
  f.history.pop()!();
  assert.equal(f.text.get(MEDIA_RECORDS_PATH), records);
});

test("agent file descriptions flow to following places, mark To check, and undo with records", async () => {
  const f = fixture(); await f.host.load();
  f.text.set("index.html", '<body><img src="/images/a.png" alt="Default"><img src="/images/a.png" alt="Own"><img src="/images/a.png"><img src="/images/a.png" alt=""><img src="/images/a.png" alt="a.png"></body>');
  const before = f.text.get("index.html");
  await f.host.describe("images/a.png", { text: "A garden & flowers" });
  assert.equal(f.batches.length, 1); assert.equal(f.history.length, 1);
  assert.match(f.batches[0].label, /Agent described a.png/);
  assert.equal((f.text.get("index.html")!.match(/alt="A garden &amp; flowers"/g) ?? []).length, 4);
  assert.match(f.text.get("index.html")!, /alt="Own"/);
  assert.deepEqual(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/a.png"].description, { text: "A garden & flowers", byAgent: true });
  assert.deepEqual((await f.host.load()).toCheck, [{ file: "images/a.png", text: "A garden & flowers" }]);
  f.history.pop()!();
  assert.equal(f.text.get("index.html"), before);
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/a.png"].description?.byAgent, undefined);
});

test("agent own words and place Decorative are one batch and one Undo, retaining unchecked marks", async () => {
  const f = fixture(); await f.host.load();
  const before = f.text.get("index.html");
  await f.host.describe("images/a.png", { page: "index.html", text: "Own agent words" });
  assert.match(f.text.get("index.html")!, /alt="Own agent words"/);
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/a.png"].places?.["index.html"].agentText, "Own agent words");
  assert.deepEqual((await f.host.load()).toCheck, [{ file: "images/a.png", page: "index.html", text: "Own agent words" }]);
  assert.equal(f.history.length, 1);
  await f.host.describe("images/a.png", { page: "index.html", decorative: true });
  assert.match(f.text.get("index.html")!, /alt=""/);
  const marked = parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/a.png"].places?.["index.html"];
  assert.equal(marked?.decorative, true); assert.equal(marked?.agentText, "Own agent words");
  f.history.pop()!(); assert.match(f.text.get("index.html")!, /alt="Own agent words"/);
  f.history.pop()!(); assert.equal(f.text.get("index.html"), before);
});

test("an agent's words for every use of a file on a page keep one mark and one To check row", async () => {
  const f = fixture(); await f.host.load();
  f.text.set("index.html", '<body><img src="/images/a.png" alt="Old"><img src="/images/a.png" alt="Old"></body>');
  await f.host.describe("images/a.png", { page: "index.html", text: "Both words" });
  assert.equal((f.text.get("index.html")!.match(/alt="Both words"/g) ?? []).length, 2);
  assert.deepEqual((await f.host.load()).toCheck, [{ file: "images/a.png", page: "index.html", text: "Both words" }]);
  f.history.pop()!(); assert.equal((f.text.get("index.html")!.match(/alt="Old"/g) ?? []).length, 2);
});

test("agent file Decorative follows library rules and never clears an unchecked description", async () => {
  const f = fixture(); await f.host.load();
  f.text.set("index.html", '<body><img src="/images/a.png" alt="Default"><img src="/images/a.png" alt="Own"></body>');
  await f.host.describe("images/a.png", { decorative: true });
  assert.match(f.text.get("index.html")!, /alt=""/); assert.match(f.text.get("index.html")!, /alt="Own"/);
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/a.png"].decorative, true);
  f.history.pop()!();
  await f.host.describe("images/a.png", { text: "Default" });
  await f.host.describe("images/a.png", { decorative: true });
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/a.png"].description?.byAgent, true);
  assert.equal((await f.host.load()).toCheck.length, 1);
  await f.host.describe("images/a.png", { decorative: false });
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/a.png"].decorative, undefined);
});

test("agent descriptions refuse blanks, outside files and pages that do not use the file without writing", async () => {
  const f = fixture(); await f.host.load();
  await assert.rejects(f.host.describe("images/a.png", { text: "  " }), /Use decorative: true/);
  await assert.rejects(f.host.describe("images/outside.png", { text: "Words" }), /never upload, fetch or generate/);
  await assert.rejects(f.host.describe("images/unused.png", { page: "index.html", text: "Words" }), /not used on index.html/);
  assert.equal(f.batches.length, 0); assert.equal(f.history.length, 0);
});

test("agent collection actions call Media's rules, each undoable with no page open", async () => {
  const { applyAgentMedia } = await import("../src/agent-media-actions");
  const f = fixture();
  const run = (args: import("../shared/agent").AgentCommandArgs) => applyAgentMedia(f.context, {
    id: "collection", operation: "change_collection", path: "", branch: "main", commit: "abc", content: "", state: "pending", createdAt: 0, args,
  }, () => { throw new Error("Collections must not open a page"); });
  const records = () => parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH));
  await run({ action: "new", name: "Trip", files: ["images/a.png"] });
  assert.ok(records().files["images/a.png"].collections?.includes("Trip"));
  await assert.rejects(run({ action: "new", name: "trip" }), /already exists/);
  await run({ action: "add", name: "Trip", files: ["images/unused.png"] });
  assert.ok(records().files["images/unused.png"].collections?.includes("Trip"));
  f.history.pop()!(); assert.equal(records().files["images/unused.png"], undefined);
  await run({ action: "take-out", name: "Trip", files: ["images/a.png"] });
  assert.ok(!records().files["images/a.png"].collections?.includes("Trip"));
  assert.ok(records().collections.includes("Trip")); assert.ok(f.bytes.has("images/a.png"));
  f.history.pop()!(); assert.ok(records().files["images/a.png"].collections?.includes("Trip"));
  await assert.rejects(run({ action: "rename", name: "Trip", to: "hero" }), /already exists/);
  await run({ action: "rename", name: "Trip", to: "Holiday" });
  assert.ok(records().files["images/a.png"].collections?.includes("Holiday"));
  f.history.pop()!(); assert.ok(records().collections.includes("Trip"));
  await run({ action: "delete", name: "Trip" });
  assert.ok(!records().collections.includes("Trip")); assert.ok(f.bytes.has("images/a.png"));
  assert.equal(records().files["images/a.png"].description?.text, "Default");
  f.history.pop()!(); assert.ok(records().collections.includes("Trip"));
  f.history.pop()!(); assert.deepEqual(records().collections, ["hero"]);
  assert.ok(f.batches.every(batch => batch.edits.size === 1 && batch.edits.has(MEDIA_RECORDS_PATH)));
});

test("Always keep forwards by default; explicit false overrides and suggestion is exposed", async () => {
  for (const keep of [undefined, false, true]) {
    const f = fixture();
    f.text.set(MEDIA_RECORDS_PATH, '{"version":2,"collections":[],"files":{"images/a.png":{"alwaysKeep":true}}}');
    await f.host.load();
    await f.host.rename("images/a.png", "Garden", keep === undefined ? undefined : { keepOldAddress: keep });
    assert.equal(f.text.get("_redirects"), keep === false ? undefined : '/images/a.png /images/garden.png 301\n');
    assert.equal(f.history.length, 1);
    f.history.pop()!();
    assert.equal(f.text.has("_redirects"), false);
  }
  const f = fixture(); f.paths.add("images/garden.png"); await f.host.load();
  await assert.rejects(f.host.rename("images/a.png", "Garden.png"), error => error instanceof Error && "suggestion" in error && error.suggestion === "images/garden-2.png");
  await assert.rejects(f.host.rename("images/a.png", "Garden.webp"), /Keep the image's file format/);
});

const rectangle = { x: .1, y: .1, width: .8, height: .8 };
const oldTrim = "media/images/a-crop.webp";
const oldSmall = "media/images/a-crop-480.webp";
function trimFixture() {
  const f = fixture();
  for (const path of [oldTrim, oldSmall]) {
    f.paths.add(path); f.bytes.set(path, new Blob(["old pixels"])); f.versions.set(path, "old-v1");
  }
  f.text.set("index.html", '<img src="/media/images/a-crop.webp" srcset="/media/images/a-crop-480.webp 480w">');
  f.text.set(MEDIA_RECORDS_PATH, JSON.stringify({ version: 2, collections: ["Hero"], files: {
    "images/a.png": { description: { text: "Original", byAgent: true }, collections: ["Hero"], alwaysKeep: true },
    [oldTrim]: { description: { text: "Trim", byAgent: true }, trimmedFrom: { source: "images/a.png", trim: rectangle } },
    [oldSmall]: { decorative: true },
  } }));
  const result = { outputs: [
    { blob: new Blob(["new main"], { type: "image/webp" }), extension: "webp", width: 800, height: 400 },
    { blob: new Blob(["small"], { type: "image/webp" }), extension: "webp", width: 480, height: 240, variantWidth: 480 },
  ], before: 8, after: 8 };
  const request = () => ({
    source: "images/a.png", previous: oldTrim, trim: rectangle, result, sourceVersion: f.versions.get("images/a.png"),
    place: {
      path: "index.html", source: f.text.get("index.html")!,
      records: { text: f.text.get(MEDIA_RECORDS_PATH) },
      apply(path: string) { return { page: '<img src="/' + path + '" srcset="/' + path.replace(".webp", "-480.webp") + ' 480w">' }; },
    },
  });
  return { ...f, request };
}
test("trim uploads, page swap, records and unused family deletion share one Undo step", async () => {
  const f = trimFixture(), original = f.bytes.get("images/a.png"), originalRecord = parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/a.png"];
  const before = new Map(f.text);
  const path = await f.host.trim(f.request());
  assert.equal(path, "media/images/a-crop-2.webp");
  assert.equal(f.batches.length, 1); assert.equal(f.history.length, 1);
  const batch = f.batches[0];
  assert.equal(batch.label, "Picture trimmed");
  assert.deepEqual(batch.uploads.map(upload => upload.path), [path, "media/images/a-crop-2-480.webp"]);
  assert.deepEqual(batch.deletes, [oldTrim, oldSmall]);
  assert.deepEqual([...batch.edits.keys()].sort(), [MEDIA_RECORDS_PATH, "index.html"].sort());
  assert.deepEqual(batch.moves, []);
  assert.ok(!batch.uploads.some(upload => upload.path === "images/a.png"));
  assert.ok(!batch.deletes.includes("images/a.png")); assert.ok(!batch.edits.has("images/a.png"));
  const next = parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH));
  assert.deepEqual(next.files[path], { description: { text: "Trim", byAgent: true }, trimmedFrom: { source: "images/a.png", trim: rectangle } });
  assert.equal(next.files[oldTrim], undefined); assert.equal(next.files[oldSmall], undefined);
  assert.equal(next.removed?.[0].path, oldTrim);
  assert.deepEqual(next.removed?.[0].record?.trimmedFrom, { source: "images/a.png", trim: rectangle });
  assert.equal(next.removed?.[0].family?.[0].path, oldSmall);
  assert.deepEqual(next.removed?.[0].family?.[0].record, { decorative: true });
  assert.deepEqual(next.files["images/a.png"], originalRecord); assert.equal(f.bytes.get("images/a.png"), original);
  f.history.pop()!();
  assert.deepEqual(f.text, before); assert.ok(f.bytes.has(oldTrim)); assert.ok(f.bytes.has(oldSmall)); assert.ok(!f.bytes.has(path));
});
test("a previous main or responsive copy still mentioned in site text stays untouched", async () => {
  for (const file of ["other.html", "scripts/data.js", "_redirects", "settings.json"]) {
    for (const member of [oldTrim, oldSmall]) {
      const f = trimFixture(), before = parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH));
      f.paths.add(file); f.text.set(file, file + ' "/' + member + '"');
      await f.host.trim(f.request());
      assert.deepEqual(f.batches[0].deletes, []);
      const after = parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH));
      assert.deepEqual(after.files[oldTrim], before.files[oldTrim]);
      assert.deepEqual(after.files[oldSmall], before.files[oldSmall]);
    }
  }
});
test("another place on the same page keeps the previous trimmed copy", async () => {
  const f = trimFixture(), request = f.request();
  request.place.apply = path => ({ page: '<img src="/' + path + '"><img src="/' + oldTrim + '">' });
  await f.host.trim(request);
  assert.deepEqual(f.batches[0].deletes, []);
});
test("unreadable text keeps the previous copy and still saves the trim", async () => {
  for (const rejects of [false, true]) {
    const f = trimFixture();
    f.paths.add("unreadable.js");
    const read = f.context.read.bind(f.context);
    f.context.read = async path => {
      if (path === "unreadable.js") { if (rejects) throw new Error("Read failed"); return undefined; }
      return read(path);
    };
    await f.host.trim(f.request());
    assert.deepEqual(f.batches[0].deletes, []);
    assert.equal(f.batches[0].uploads.length, 2); assert.equal(f.history.length, 1);
  }
});
test("Always keep on any previous family member prevents deletion", async () => {
  for (const member of [oldTrim, oldSmall]) {
    const f = trimFixture(), records = parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH));
    records.files[member].alwaysKeep = true;
    f.text.set(MEDIA_RECORDS_PATH, JSON.stringify(records));
    await f.host.trim(f.request());
    assert.deepEqual(f.batches[0].deletes, []);
    assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["media/images/a-crop-2.webp"].alwaysKeep, undefined);
  }
});
test("stale page, newer records and cancelled placement refuse the entire trim", async () => {
  for (const stale of ["page", "records", "cancel", "stage"] as const) {
    const f = trimFixture(), request = f.request();
    if (stale === "page") f.text.set("index.html", "New page");
    if (stale === "records") f.text.set(MEDIA_RECORDS_PATH, f.text.get(MEDIA_RECORDS_PATH)! + "\n");
    if (stale === "cancel") request.place = { ...request.place, ...{ live: () => false } };
    if (stale === "stage") f.afterStage(() => f.text.set("index.html", "Changed while staging"));
    await assert.rejects(f.host.trim(request), /changed|Cancelled/i);
    assert.equal(f.history.length, 0); assert.ok(!f.bytes.has("media/images/a-crop-2.webp"));
    assert.ok(f.bytes.has(oldTrim)); assert.ok(f.bytes.has("images/a.png"));
  }
});
test("trim validates no-op, cap, one primary format and source record preservation", async () => {
  for (const bad of ["noop", "cap", "format", "primary", "record"] as const) {
    const f = trimFixture(), request = f.request();
    if (bad === "noop") request.trim = { x: 0, y: 0, width: 1, height: 1 };
    if (bad === "cap") request.result.outputs[0].blob = new Blob([new Uint8Array(21 * 1024 * 1024)]);
    if (bad === "format") request.result.outputs[1].extension = "png";
    if (bad === "primary") request.result.outputs.push(request.result.outputs[0]);
    if (bad === "record") {
      const apply = (path: string) => request.place.apply(path);
      const place: import("../src/page-builder/media-workspace").MediaTrimRequest["place"] = {
        ...request.place, apply(path, records) {
          records.files["images/a.png"] = { description: { text: "Changed source" } };
          return { ...apply(path), records };
        },
      };
      await assert.rejects(f.host.trim({ ...request, place }), /original picture's record/);
    } else await assert.rejects(f.host.trim(request));
    assert.equal(f.batches.length, 0); assert.equal(f.history.length, 0);
  }
});
test("a re-trim never reuses an address on the Recently removed list", async () => {
  const f = trimFixture(), records = JSON.parse(f.text.get(MEDIA_RECORDS_PATH)!);
  records.removed = [{ path: "media/images/a-crop-2.webp", sha: "abc", date: "2026-10-01", family: [{ path: "media/images/a-crop-3-480.webp", sha: "def" }] }];
  f.text.set(MEDIA_RECORDS_PATH, JSON.stringify(records));
  const request = f.request();
  request.place.records = { text: f.text.get(MEDIA_RECORDS_PATH) };
  assert.equal(await f.host.trim(request), "media/images/a-crop-4.webp");
});
test("pixels prepared from an older original refuse without saving anything", async () => {
  for (const sourceVersion of ["a-v0", undefined]) {
    const f = trimFixture(), before = new Map(f.text);
    await assert.rejects(f.host.trim({ ...f.request(), sourceVersion }), /changed while it was being trimmed/);
    assert.equal(f.batches.length, 0); assert.equal(f.history.length, 0); assert.deepEqual(f.text, before);
    assert.ok(f.bytes.has(oldTrim));
  }
});

test("replace is one batch and Undo step, preserves old family SHA and record, uploads over occupied addresses", async () => {
  const f = fixture();
  const copy = "images/a-480.png", original = "media/originals/a.jpg";
  for (const path of [copy, original]) { f.paths.add(path); f.bytes.set(path, new Blob(["old " + path])); f.versions.set(path, "sha:" + path); }
  await f.host.load();
  const oldRecord = parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/a.png"];
  const main = new Blob(["new main"], { type: "image/png" }), small = new Blob(["new copy"], { type: "image/png" });
  const next = await f.host.replace({ path: "images/a.png", result: { before: 10, after: 8, outputs: [
    { blob: main, extension: "png", width: 800, height: 400 }, { blob: small, extension: "png", width: 480, height: 240, variantWidth: 480 },
  ] } });
  assert.equal(next, "images/a.png"); assert.equal(f.batches.length, 1); assert.equal(f.history.length, 1);
  const batch = f.batches[0]; assert.equal(batch.label, "Replace everywhere");
  assert.deepEqual(batch.overwrites, ["images/a.png", copy]);
  assert.ok(batch.deletes.every(path => !batch.uploads.some(upload => upload.path === path)));
  assert.equal(await f.bytes.get(next)!.text(), "new main");
  const data = parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)), entry = data.removed![0];
  assert.equal(entry.path, next); assert.equal(entry.sha, "a-v1");
  assert.deepEqual(entry.family?.map(member => [member.path, member.sha]), [[copy, "sha:" + copy], [original, "sha:" + original]]);
  assert.deepEqual(data.files[next], oldRecord); assert.deepEqual(entry.record, oldRecord);
  await assert.rejects(f.host.restore([{ path: entry.path, id: entry.sha! }]), /already exists/);
  assert.equal(f.history.length, 1);
  f.history.pop()!();
  assert.equal(await f.bytes.get(next)!.text(), "original");
  assert.equal(await f.bytes.get(copy)!.text(), "old " + copy);
  assert.ok(f.paths.has(original)); assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).removed, undefined);
});

test("replace keeps an Always keep copy's record when the copy stays at its address", async () => {
  const f = fixture();
  const copy = "images/a-480.png";
  f.paths.add(copy); f.bytes.set(copy, new Blob(["old copy"])); f.versions.set(copy, "sha:" + copy);
  f.text.set(MEDIA_RECORDS_PATH, JSON.stringify({ version: 2, collections: [], files: { [copy]: { alwaysKeep: true } } }));
  await f.host.load();
  await f.host.replace({ path: "images/a.png", result: { before: 10, after: 8, outputs: [
    { blob: new Blob(["new main"], { type: "image/png" }), extension: "png", width: 800, height: 400 },
    { blob: new Blob(["new copy"], { type: "image/png" }), extension: "png", width: 480, height: 240, variantWidth: 480 },
  ] } });
  const data = parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH));
  assert.equal(data.files[copy]?.alwaysKeep, true);
  // Still protected: the library marks the family Always keep.
  assert.ok((await f.host.load()).keep.includes("images/a.png"));
});

test("replace captures old family and trimmed revisions before preparation; stale member refuses", async () => {
  for (const member of ["images/a.png", "media/originals/a.jpg", "images/trim.png"]) {
    const f = fixture();
    for (const extra of ["media/originals/a.jpg", "images/trim.png"]) { f.paths.add(extra); f.bytes.set(extra, new Blob(["old"])); f.versions.set(extra, "old"); }
    f.text.set(MEDIA_RECORDS_PATH, JSON.stringify({ version: 2, collections: [], files: {
      "images/trim.png": { trimmedFrom: { source: "images/a.png", trim: { x: 0, y: 0, width: .5, height: .5 } } },
    } }));
    await f.host.load(); f.afterRead(() => f.versions.set(member, "newer"));
    await assert.rejects(f.host.replace({ path: "images/a.png", result: { before: 1, after: 1, outputs: [{ blob: new Blob(["new"]), extension: "png", width: 800, height: 400 }] } }), /changed while preparing/);
    assert.equal(f.history.length, 0); assert.equal(await f.bytes.get("images/a.png")!.text(), "original");
  }
});

test("replace refuses unreadable text and cancelled requests without a mutation", async () => {
  for (const unreadable of [true, false]) {
    const f = fixture(); await f.host.load();
    if (unreadable) f.paths.add("missing.json");
    await assert.rejects(f.host.replace({ path: "images/a.png", result: { before: 1, after: 1, outputs: [{ blob: new Blob(["new"]), extension: "png", width: 800, height: 400 }] }, live: () => false }), unreadable ? /Could not read missing.json/ : /Cancelled/);
    assert.equal(f.history.length, 0); assert.equal(await f.bytes.get("images/a.png")!.text(), "original");
  }
});

test("browser-only replacement preserves old bytes at their occupied address", async () => {
  const f = fixture(); f.context.history = false; await f.host.load();
  await f.host.replace({ path: "images/a.png", result: { before: 1, after: 1, outputs: [{ blob: new Blob(["new"]), extension: "png", width: 800, height: 400 }] } });
  const entry = parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).removed![0];
  assert.equal(entry.sha, undefined); assert.ok(entry.browserKey);
  assert.equal(await (await f.context.removedCopies!.get(entry.browserKey))!.text(), "original");
});

test("animated old pictures refuse prepared still replacements without a batch", async () => {
  const f = fixture(), path = "images/moving.gif";
  const header = new TextEncoder().encode("GIF89a\x01\0\x01\0\0\0\0");
  const frame = new Uint8Array([44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 44, 44, 0]);
  f.paths.add(path); f.bytes.set(path, new Blob([header, frame, frame, new Uint8Array([59])])); f.versions.set(path, "animated-sha");
  await f.host.load();
  await assert.rejects(f.host.replace({ path, result: { before: 1, after: 1, outputs: [{ blob: new Blob(["new"]), extension: "png", width: 800, height: 400 }] } }), /Animated pictures/);
  assert.equal(f.batches.length, 0); assert.equal(f.history.length, 0);
});
