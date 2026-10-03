import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMediaWorkspaceBatch, createMediaWorkspace, type MediaWorkspaceBatch, type MediaWorkspaceContext } from "../src/page-builder/media-workspace";
import { MEDIA_METADATA_PATH } from "../src/page-builder/media-metadata";

function fixture() {
  const text = new Map<string, string>([
    ["index.html", '<head></head><body><img src="/images/a.png" alt="Keep this alt"></body>'],
    ["styles/site.css", '.hero { background:url(/images/a.png); }'],
    [MEDIA_METADATA_PATH, '{"images/a.png":{"alt":"Default","tags":["hero"]}}'],
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
  const context: MediaWorkspaceContext = {
    key: "owner/repo:main", scope: { account: "owner", repoId: 1, repo: "owner/repo", branch: "main" },
    drafts: { get() { return undefined; }, save() { throw new Error("Legacy draft mutation"); }, remove() { throw new Error("Legacy draft mutation"); } },
    get paths() { return [...paths]; },
    get items() { return [...bytes.keys()].map((path) => ({ path })); },
    pages: ["index.html"], components: {},
    assertLive() { if (!live) throw new Error("Repository scope changed"); },
    async read(path) { const value = text.get(path); if (path === MEDIA_METADATA_PATH) afterRead?.(); return value; },
    async blob(path) { return bytes.get(path)!; },
    assetVersion(path) { return versions.get(path); },
    async write() { throw new Error("Legacy write"); }, changed() { throw new Error("Legacy refresh"); },
    async rename() { throw new Error("Legacy rename"); }, async remove() { throw new Error("Legacy remove"); }, async openPage() {},
    async applyBatch(batch) {
      batches.push(batch);
      await applyMediaWorkspaceBatch(batch, {
        assertLive: context.assertLive, paths: () => [...paths], source: (path) => text.get(path), assetVersion: (path) => versions.get(path),
        async snapshot() { return { text: new Map(text), paths: new Set(paths), bytes: new Map(bytes), versions: new Map(versions), committed: false, owned: [] as string[] }; },
        async stage(batch, state) {
          for (const upload of batch.uploads) { if (!bytes.has(upload.path)) state.owned.push(upload.path); bytes.set(upload.path, upload.blob); if (failStage) throw new Error("Byte storage failed"); }
          afterStage?.();
        },
        commit(batch, state) {
          state.committed = true;
          for (const move of batch.moves) { bytes.set(move.to, bytes.get(move.from)!); bytes.delete(move.from); paths.delete(move.from); paths.add(move.to); versions.set(move.to, versions.get(move.from)!); versions.delete(move.from); }
          for (const path of batch.deletes) { bytes.delete(path); paths.delete(path); versions.delete(path); }
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
  f.text.set(MEDIA_METADATA_PATH, '{"images/a.png":{"alt":"Default","tags":["hero"],"credit":"Artist"}}');
  await f.host.rename("images/a.png", "garden.png");
  assert.equal(f.batches.length, 1);
  assert.deepEqual(f.batches[0].moves, [{ from: "images/a.png", to: "images/garden.png" }]);
  assert.ok(f.text.get("index.html")!.includes('/images/garden.png" alt="Keep this alt"'));
  assert.ok(f.text.get("styles/site.css")!.includes("/images/garden.png"));
  assert.equal(JSON.parse(f.text.get(MEDIA_METADATA_PATH)!)["images/garden.png"].alt, "Default");
  assert.equal(JSON.parse(f.text.get(MEDIA_METADATA_PATH)!)["images/garden.png"].credit, "Artist");
  assert.equal(f.history.length, 1);
  f.history.pop()!();
  assert.equal(f.paths.has("images/garden.png"), false);
  assert.equal(await f.bytes.get("images/a.png")!.text(), "original");
  assert.ok(f.text.get("index.html")!.includes("/images/a.png"));
});
test("delete removes binary and metadata together; one Undo restores both", async () => {
  const f = fixture(); await f.host.load(); await f.host.remove(["images/a.png"]);
  assert.equal(f.batches.length, 1); assert.equal(f.bytes.has("images/a.png"), false);
  assert.equal(JSON.parse(f.text.get(MEDIA_METADATA_PATH)!)["images/a.png"], undefined);
  f.history.pop()!(); assert.equal(f.bytes.has("images/a.png"), true);
  assert.ok(JSON.parse(f.text.get(MEDIA_METADATA_PATH)!)["images/a.png"]);
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
  await f.host.import!([
    { file: new File(["original"], "images/a.png"), result: { outputs: [output("primary"), output("small", 480)], before: 8, after: 7 }, folder: "images", replaceFrom: "images/a.png", expectedAssetVersion: "a-v1", metadata: { alt: "Default", tags: ["hero"] } },
    { file: new File(["second"], "a.png"), result: { outputs: [output("second")], before: 6, after: 6 }, folder: "images" },
  ]);
  assert.equal(f.batches.length, 1); assert.equal(f.history.length, 1);
  assert.deepEqual(f.batches[0].uploads.map((item) => item.path), ["images/a.webp", "images/a-480w.webp", "images/a-2.webp"]);
  assert.ok(f.text.get("index.html")!.includes("/images/a.webp"));
  assert.equal(JSON.parse(f.text.get(MEDIA_METADATA_PATH)!)["images/a.webp"].alt, "Default");
  f.history.pop()!();
  assert.equal(f.bytes.has("images/a.webp"), false); assert.equal(f.paths.has("images/a-480w.webp"), false);
  assert.equal(await f.bytes.get("images/a.png")!.text(), "original");
});
test("staging failure and commit failure restore owned bytes, paths and drafts without partial uploads", async () => {
  for (const failStage of [true, false]) {
    const f = fixture(); await f.host.load(); failStage ? f.failStage() : f.failCommit();
    await assert.rejects(f.host.upload(new File(["bytes"], "new.png"), { outputs: [{ blob: new Blob(["new"]), extension: "png" }], before: 5, after: 3 }, "images"), /storage failed/);
    assert.equal(f.bytes.has("images/new.png"), false); assert.equal(f.paths.has("images/new.png"), false);
    assert.equal(f.history.length, 0); assert.equal(await f.bytes.get("images/a.png")!.text(), "original");
  }
});
test("last guard after byte staging preserves an intervening source edit and removes owned bytes", async () => {
  const f = fixture(); await f.host.load(); f.afterStage(() => f.text.set(MEDIA_METADATA_PATH, '{"other.png":{"alt":"User edit"}}'));
  await assert.rejects(f.host.upload(new File(["bytes"], "new.png"), { outputs: [{ blob: new Blob(["new"]), extension: "png" }], before: 5, after: 3 }, "images"), /changed while preparing/);
  assert.equal(f.bytes.has("images/new.png"), false); assert.equal(f.paths.has("images/new.png"), false);
  assert.equal(f.text.get(MEDIA_METADATA_PATH), '{"other.png":{"alt":"User edit"}}');
});
test("used images cannot pass Delete unused and unread sources cannot be called unused", async () => {
  const f = fixture(); await f.host.load(); await assert.rejects(f.host.remove(["images/a.png"], true), /now referenced/);
  f.text.delete("styles/site.css");
  await assert.rejects(f.host.remove(["images/unused.png"], true), /usage is incomplete/);
  assert.equal(f.batches.length, 0);
});
test("Delete unused refuses image-set strings and escaped url references", async () => {
  for (const css of ['.x{background:image-set("/images/unused.png" 1x)}', '.x{background:u\\72l(/images/unused.png)}']) {
    const f = fixture(); f.text.set("styles/site.css", css); await f.host.load();
    await assert.rejects(f.host.remove(["images/unused.png"], true), /now referenced/);
    assert.equal(f.batches.length, 0); assert.equal(f.paths.has("images/unused.png"), true);
  }
});
test("missing atomic host fails closed and scope changes reject before mutation", async () => {
  const f = fixture(); await f.host.load(); f.context.applyBatch = undefined;
  await assert.rejects(f.host.metadata({ "images/a.png": { alt: "Changed" } }), /Atomic image changes are unavailable/);
  f.setLive(false); await assert.rejects(f.host.rename("images/a.png", "garden.png"), /scope changed/);
  assert.equal(f.batches.length, 0);
});
test("encoded old bytes cannot replace a newer image; missing preview receipts fail closed", async () => {
  for (const receipt of [undefined, "a-v1"]) {
    const f = fixture(); await f.host.load();
    f.bytes.set("images/a.png", new Blob(["newer bytes B"])); f.versions.set("images/a.png", "a-v2");
    await assert.rejects(f.host.import!([{ file: new File(["original bytes A"], "images/a.png"), result: { outputs: [{ blob: new Blob(["encoded A"]), extension: "webp" }], before: 16, after: 9 }, folder: "images", replaceFrom: "images/a.png", expectedAssetVersion: receipt }]), /revision was not captured|changed since its optimisation preview/);
    assert.equal(f.batches.length, 0); assert.equal(f.paths.has("images/a.webp"), false);
    assert.equal(await f.bytes.get("images/a.png")!.text(), "newer bytes B");
    assert.ok(f.text.get("index.html")!.includes("/images/a.png"));
  }
});
test("preview revision stays in the final batch even when a read races later", async () => {
  const f = fixture(); const library = await f.host.load();
  assert.equal(library.items.find((item) => item.path === "images/a.png")?.version, "a-v1");
  f.afterStage(() => f.versions.set("images/a.png", "a-v2"));
  await assert.rejects(f.host.import!([{ file: new File(["original"], "images/a.png"), result: { outputs: [{ blob: new Blob(["encoded"]), extension: "webp" }], before: 8, after: 7 }, folder: "images", replaceFrom: "images/a.png", expectedAssetVersion: "a-v1" }]), /changed while preparing/);
  assert.equal(f.batches[0].expectedAssets.get("images/a.png"), "a-v1");
  assert.equal(f.paths.has("images/a.webp"), false); assert.equal(f.bytes.has("images/a.webp"), false);
});
