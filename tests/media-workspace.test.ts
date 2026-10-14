import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMediaWorkspaceBatch, createMediaWorkspace, type MediaWorkspaceBatch, type MediaWorkspaceContext } from "../src/page-builder/media-workspace";
import { MEDIA_RECORDS_PATH, parseMediaRecords } from "../shared/media-records";

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
    key: "owner/repo:main", scope: { account: "owner", repoId: 1, repo: "owner/repo", branch: "main" },
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
  assert.deepEqual(f.batches[0].uploads.map((item) => item.path), ["images/a.webp", "images/a-480w.webp", "images/a-2.webp"]);
  assert.ok(f.text.get("index.html")!.includes("/images/a.webp"));
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/a.webp"].description?.text, "Default");
  f.history.pop()!();
  assert.equal(f.bytes.has("images/a.webp"), false); assert.equal(f.paths.has("images/a-480w.webp"), false);
  assert.equal(await f.bytes.get("images/a.png")!.text(), "original");
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
  await f.host.load(); await assert.rejects(f.host.rename("images/a.png", "garden.png"), /already exists/);
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
  const original = '<img src="/images/a.png" alt="Default"><img src="/images/a.png" alt=""><img src="/images/a.png"><img src="/images/a.png" alt="Own words">';
  f.text.set("index.html", original);
  const css = f.text.get("styles/site.css");
  await f.host.metadata({ "images/a.png": { alt: "New description" } });
  assert.equal(f.batches.length, 1);
  assert.equal(f.batches[0].expectedSources.get("index.html"), original);
  assert.equal(f.batches[0].edits.size, 2);
  assert.equal((f.text.get("index.html")!.match(/alt="New description"/g) ?? []).length, 3);
  assert.ok(f.text.get("index.html")!.includes('alt="Own words"'));
  assert.equal(f.text.get("styles/site.css"), css);
  f.history.pop()!();
  assert.equal(f.text.get("index.html"), original);
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/a.png"].description?.text, "Default");
  await f.host.metadata({ "images/a.png": { decorative: true } });
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/a.png"].decorative, true);
  assert.equal(parseMediaRecords(f.text.get(MEDIA_RECORDS_PATH)).files["images/a.png"].description, undefined);
  assert.equal((f.text.get("index.html")!.match(/alt=""/g) ?? []).length, 3);
  const decorated = f.text.get("index.html");
  await f.host.metadata({ "images/a.png": { decorative: false } });
  assert.equal(f.text.get("index.html"), decorated);
});

test("library load and Delete unused read scripts, notes and SVG text, while rename stays HTML/CSS", async () => {
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
  assert.equal(f.text.get("app.js"), 'const image = "/images/unused.png"');
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
