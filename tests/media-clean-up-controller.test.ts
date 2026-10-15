import { test } from "node:test";
import assert from "node:assert/strict";
import { createMediaCleanUpController, type MediaCleanUpPorts, type MediaCleanUpState } from "../src/controllers/media-clean-up-controller";
import { mediaUsageRecords } from "../src/page-builder/media-usage";
import { improveImagesPlan } from "../src/page-builder/improve-images";
import { planWithPictureSizes } from "../src/page-builder/improve-images-facts";
import { parseMediaRecords, MEDIA_RECORDS_PATH } from "../shared/media-records";

const unused = (media: string[], pending: string[] = []) => ({
  ...mediaUsageRecords({ media, sources: { "index.html": "<p>Hello</p>" }, pages: ["index.html"] }), pending,
});
function fixture(records?: string) {
  let place = "lex:1:main";
  const stored = new Map<string, string>(), states: MediaCleanUpState[] = [];
  const sources: Record<string, string | undefined> = {};
  let files = ["index.html", ...(records === undefined ? [] : [MEDIA_RECORDS_PATH])];
  let reads = 0;
  const ports: MediaCleanUpPorts = {
    place: () => place, files: () => files, source: path => sources[path],
    read: async path => { reads++; return path === MEDIA_RECORDS_PATH ? records : undefined; },
    storage: () => ({ getItem: key => stored.get(key) ?? null, setItem: (key, value) => { stored.set(key, value); }, removeItem: key => { stored.delete(key); } }),
    changed: state => { states.push(state); },
  };
  return { ports, stored, states, sources, reads: () => reads, setPlace: (value: string) => { place = value; }, setFiles: (value: string[]) => { files = value; } };
}
const badge = (states: MediaCleanUpState[]) => states.at(-1)?.badge;

test("counts what Clean up suggests and leaves Always keep files out", async () => {
  const f = fixture(JSON.stringify({ version: 2, collections: [], files: { "images/kept.png": { alwaysKeep: true } } }));
  const controller = createMediaCleanUpController(f.ports);
  await controller.update(unused(["images/a.png", "images/kept.png", "files/guide.pdf"]));
  assert.deepEqual(badge(f.states), { count: 2, show: true });
  assert.deepEqual(controller.state().suggestions.groups[0].items.map(item => item.main), ["files/guide.pdf", "images/a.png"]);
  assert.equal(f.reads(), 1);
});

test("a held records draft wins over the branch file, and no records file means no marks", async () => {
  const f = fixture(JSON.stringify({ version: 2, collections: [], files: {} }));
  f.sources[MEDIA_RECORDS_PATH] = JSON.stringify({ version: 2, collections: [], files: { "a.png": { alwaysKeep: true } } });
  const controller = createMediaCleanUpController(f.ports);
  await controller.update(unused(["a.png"]));
  assert.deepEqual(badge(f.states), { count: 0, show: false });
  assert.equal(f.reads(), 0);
  const plain = fixture();
  await createMediaCleanUpController(plain.ports).update(unused(["a.png"]));
  assert.deepEqual(badge(plain.states), { count: 1, show: true });
});

test("unreadable or malformed records hide the count", async () => {
  for (const records of ["{", JSON.stringify({ version: 3 })]) {
    const f = fixture(records);
    await createMediaCleanUpController(f.ports).update(unused(["a.png"]));
    assert.equal(f.states.at(-1)?.suggestions.state, "blocked");
    assert.deepEqual(badge(f.states), { count: 0, show: false });
  }
  const failing = fixture("{}");
  failing.ports.read = async () => { throw new Error("offline"); };
  await createMediaCleanUpController(failing.ports).update(unused(["a.png"]));
  assert.equal(failing.states.at(-1)?.suggestions.state, "blocked");
});

test("dismiss hides the count until a new unused file appears, and is remembered", async () => {
  const f = fixture();
  const controller = createMediaCleanUpController(f.ports);
  await controller.update(unused(["a.png", "b.png"]));
  controller.dismiss();
  assert.deepEqual(badge(f.states), { count: 2, show: false });
  await controller.update(unused(["a.png"]));
  assert.deepEqual(badge(f.states), { count: 1, show: false });
  // A later visit reads the dismissal back.
  const again = createMediaCleanUpController(f.ports);
  await again.update(unused(["a.png", "b.png"]));
  assert.deepEqual(badge(f.states), { count: 2, show: false });
  await again.update(unused(["a.png", "b.png", "c.png"]));
  assert.deepEqual(badge(f.states), { count: 3, show: true });
});

test("with nothing left the dismissal is forgotten, so a returning file counts as new", async () => {
  const f = fixture();
  const controller = createMediaCleanUpController(f.ports);
  await controller.update(unused(["a.png"]));
  controller.dismiss();
  assert.equal(f.stored.size, 1);
  await controller.update(unused([]));
  assert.equal(f.stored.size, 0);
  await controller.update(unused(["a.png"]));
  assert.deepEqual(badge(f.states), { count: 1, show: true });
});

test("a check running again keeps the badge's count but offers nothing unchecked; another place starts empty with its own dismissal", async () => {
  const f = fixture();
  const controller = createMediaCleanUpController(f.ports);
  await controller.update(unused(["a.png"]));
  for (const usage of [unused(["a.png"], ["notes.txt"]), undefined]) {
    await controller.update(usage);
    assert.deepEqual(badge(f.states), { count: 1, show: true });
    assert.equal(controller.state().suggestions.state, "not-checked");
    assert.deepEqual(controller.state().suggestions.groups, []);
    assert.deepEqual(controller.item(), { label: "Clean up", disabled: "Still checking which files are used." });
    controller.dismiss();
    assert.deepEqual(badge(f.states), { count: 1, show: true });
  }
  await controller.update(unused(["a.png"]));
  assert.deepEqual(controller.item(), { label: "Clean up (1)" });
  controller.dismiss();
  f.setPlace("lex:1:dev");
  await controller.update(undefined);
  assert.deepEqual(badge(f.states), { count: 0, show: false });
  await controller.update(unused(["a.png"]));
  assert.deepEqual(badge(f.states), { count: 1, show: true });
});

test("an update overtaken by a newer one, or by a place change, does not publish", async () => {
  const f = fixture("{}");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  f.ports.read = async () => { await gate; return "{}"; };
  const controller = createMediaCleanUpController(f.ports);
  const first = controller.update(unused(["old.png"]));
  const second = controller.update(unused(["new.png"]));
  release(); await Promise.all([first, second]);
  assert.deepEqual(f.states.map(state => state.suggestions.groups[0]?.items[0].main), ["new.png"]);
  const moved = fixture("{}");
  let open!: () => void;
  const wait = new Promise<void>(resolve => { open = resolve; });
  moved.ports.read = async () => { await wait; return "{}"; };
  const other = createMediaCleanUpController(moved.ports);
  const pending = other.update(unused(["a.png"]));
  moved.setPlace("lex:2:main"); open(); await pending;
  assert.equal(moved.states.length, 0);
});

test("dismiss does nothing while the badge is hidden, and storage that refuses still dismisses for the visit", async () => {
  const f = fixture();
  const controller = createMediaCleanUpController(f.ports);
  controller.dismiss();
  assert.equal(f.states.length, 0);
  f.ports.storage = () => { throw new Error("denied"); };
  await controller.update(unused(["a.png"]));
  controller.dismiss();
  assert.deepEqual(badge(f.states), { count: 1, show: false });
  assert.equal(f.stored.size, 0);
});

test("a draft change invalidates a records read in flight, so its old answer neither publishes nor forgets a dismissal", async () => {
  const f = fixture("{}");
  const controller = createMediaCleanUpController(f.ports);
  await controller.update(unused(["a.png"]));
  controller.dismiss();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  f.ports.read = async () => { await gate; return "{}"; };
  const before = f.states.length;
  // The old read would find a.png used (nothing to suggest) and clear the dismissal.
  const stale = controller.update(unused([]));
  controller.invalidate();
  release(); await stale;
  assert.equal(f.states.length, before);
  assert.equal(f.stored.size, 1);
  await controller.update(unused(["a.png"]));
  assert.deepEqual(badge(f.states), { count: 1, show: false });
});

test("pages with pictures to improve join the count; read widths sharpen it; dismiss covers them", async () => {
  const f = fixture();
  f.setFiles(["index.html", "about/index.html", "images/wide.png"]);
  f.sources["index.html"] = '<img src="https://mobbin.com/og.png" width="10" height="10" loading="lazy">';
  f.sources["about/index.html"] = '<img src="/images/wide.png" width="10" height="10" loading="lazy">';
  const ports = { ...f.ports, pages: () => ["index.html", "about/index.html"], components: () => ({}), url: () => "https://own.example/", size: () => 1000 } satisfies MediaCleanUpPorts;
  const controller = createMediaCleanUpController(ports);
  const usage = () => mediaUsageRecords({ media: ["images/wide.png"], sources: { "index.html": f.sources["index.html"]!, "about/index.html": f.sources["about/index.html"]! }, pages: ["index.html", "about/index.html"] });
  await controller.update(usage());
  assert.deepEqual(controller.state().improve, ["index.html"]);
  assert.deepEqual(badge(f.states), { count: 1, show: true, improve: 1 });
  assert.deepEqual(controller.improveItem(), { label: "Improve images (1)" });
  // The screen read the picture: wider than any screen needs, so it gets copies.
  controller.known({ "images/wide.png": { width: 4000, height: 3000 } });
  await controller.update(usage());
  assert.deepEqual(controller.state().improve?.sort(), ["about/index.html", "index.html"]);
  controller.dismiss();
  assert.equal(badge(f.states)?.show, false);
  // Another repository forgets the read widths.
  f.setPlace("lex:2:main");
  await controller.update(usage());
  assert.deepEqual(controller.state().improve, ["index.html"]);
});


test("More reads widths before the screen opens, matching its rows after Fix and Undo", async t => {
  const image = Object.getOwnPropertyDescriptor(globalThis, "Image");
  let width = 4000;
  Object.defineProperty(globalThis, "Image", { configurable: true, value: class {
    src = "";
    naturalWidth = width;
    naturalHeight = 3000;
    async decode() {}
  } });
  t.after(() => { if (image) Object.defineProperty(globalThis, "Image", image); else Reflect.deleteProperty(globalThis, "Image"); });
  const f = fixture();
  const original = '<img src="/images/wide.png" width="10" height="10" loading="lazy">';
  f.sources["index.html"] = original;
  f.setFiles(["index.html", "images/wide.png"]);
  let release!: () => void;
  let gate = new Promise<void>(resolve => { release = resolve; });
  const ports = { ...f.ports, pages: () => ["index.html"], components: () => ({}), size: () => 1000,
    blob: async () => { await gate; return new Blob(["picture"]); } } satisfies MediaCleanUpPorts;
  const controller = createMediaCleanUpController(ports);
  const usage = () => mediaUsageRecords({ media: ["images/wide.png", "unused.png"], sources: { "index.html": f.sources["index.html"]! }, pages: ["index.html"] });
  const pending = controller.update(usage());
  // Clean up publishes without waiting for picture bytes.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(controller.state().suggestions.count, 1);
  assert.equal(controller.state().improve, undefined);
  release(); await pending;
  gate = Promise.resolve();
  const agree = async () => {
    const plan = await planWithPictureSizes({ plan: async known => improveImagesPlan({ sources: f.sources,
      pages: ["index.html"], components: {}, files: { "images/wide.png": { size: 1000, ...known["images/wide.png"] } }, records: parseMediaRecords(undefined) }) }, {}, async () => ({ width, height: 3000 }));
    assert.deepEqual(controller.state().improve, plan.rows.filter(row => row.count).map(row => row.file));
  };
  await agree();
  assert.deepEqual(controller.improveItem(), { label: "Improve images (1)" });
  // Fixed bytes at the same path, then Undo: widths must be read afresh in both directions.
  width = 10;
  await controller.update(usage()); await agree();
  assert.deepEqual(controller.state().improve, []);
  width = 4000;
  await controller.update(usage()); await agree();
  assert.deepEqual(controller.state().improve, ["index.html"]);
});

test("a picture's width is read once per version of its bytes", async t => {
  const image = Object.getOwnPropertyDescriptor(globalThis, "Image");
  let width = 4000;
  Object.defineProperty(globalThis, "Image", { configurable: true, value: class {
    src = "";
    naturalWidth = width;
    naturalHeight = 3000;
    async decode() {}
  } });
  t.after(() => { if (image) Object.defineProperty(globalThis, "Image", image); else Reflect.deleteProperty(globalThis, "Image"); });
  const f = fixture();
  f.sources["index.html"] = '<img src="/images/wide.png" width="10" height="10" loading="lazy">';
  f.setFiles(["index.html", "images/wide.png"]);
  let reads = 0, version = "sha-1";
  const controller = createMediaCleanUpController({ ...f.ports, pages: () => ["index.html"], components: () => ({}), size: () => 1000,
    version: () => version, blob: async () => { reads++; return new Blob(["picture"]); } });
  const usage = () => mediaUsageRecords({ media: ["images/wide.png"], sources: { "index.html": f.sources["index.html"]! }, pages: ["index.html"] });
  await controller.update(usage());
  await controller.update(usage());
  assert.equal(reads, 1);
  assert.deepEqual(controller.state().improve, ["index.html"]);
  // New bytes at the same path are read again.
  width = 10; version = "sha-2";
  await controller.update(usage());
  assert.equal(reads, 2);
  assert.deepEqual(controller.state().improve, []);
});
