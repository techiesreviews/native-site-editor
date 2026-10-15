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
    // The count stays the badge's (slice 121); only opening waits for the check.
    assert.deepEqual(controller.item(), { label: "Clean up (1)", disabled: "Still checking which files are used." });
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
  // Clean up's suggestions, then the settled counts: both from the newer update only.
  assert.deepEqual([...new Set(f.states.map(state => state.suggestions.groups[0]?.items[0].main))], ["new.png"]);
  assert.deepEqual(f.states.at(-1)?.counted?.groups[0]?.items[0].main, "new.png");
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

test("a width read while the bytes are replaced is never kept under the old version", async t => {
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
  let reads = 0, version = "sha-wide", release!: () => void;
  let gate = new Promise<void>(resolve => { release = resolve; });
  const controller = createMediaCleanUpController({ ...f.ports, pages: () => ["index.html"], components: () => ({}), size: () => 1000,
    version: () => version, blob: async () => { reads++; await gate; return new Blob(["picture"]); } });
  const usage = () => mediaUsageRecords({ media: ["images/wide.png"], sources: { "index.html": f.sources["index.html"]! }, pages: ["index.html"] });
  // The read starts on the wide bytes; they are replaced by small ones before it decodes.
  const pending = controller.update(usage());
  await new Promise(resolve => setImmediate(resolve));
  width = 10; version = "sha-small";
  release(); await pending;
  gate = Promise.resolve();
  // Undo brings the wide bytes back: their width is read afresh, not taken from the replaced read.
  width = 4000; version = "sha-wide";
  await controller.update(usage());
  assert.equal(reads, 2);
  assert.deepEqual(controller.state().improve, ["index.html"]);
  assert.deepEqual(controller.improveItem(), { label: "Improve images (1)" });
});

// Slice 121: the badge said 10 (Clean up alone) on one screen and 15 (Clean up + Improve images)
// on the next. The badge and More's two counts now come from one settled check.
test("the badge and More's counts come from one settled check: never Clean up alone, always adding up", async t => {
  const image = Object.getOwnPropertyDescriptor(globalThis, "Image");
  Object.defineProperty(globalThis, "Image", { configurable: true, value: class { src = ""; naturalWidth = 4000; naturalHeight = 3000; async decode() {} } });
  t.after(() => { if (image) Object.defineProperty(globalThis, "Image", image); else Reflect.deleteProperty(globalThis, "Image"); });
  const f = fixture();
  f.sources["index.html"] = '<img src="/images/wide.png" width="10" height="10" loading="lazy">';
  f.setFiles(["index.html", "images/wide.png"]);
  let release!: () => void, gate = new Promise<void>(resolve => { release = resolve; });
  let pagesFail = false;
  const ports = { ...f.ports, components: () => ({}), size: () => 1000,
    pages: () => { if (pagesFail) throw new Error("offline"); return ["index.html"]; },
    blob: async () => { await gate; return new Blob(["picture"]); } } satisfies MediaCleanUpPorts;
  const controller = createMediaCleanUpController(ports);
  const usage = (media: string[]) => mediaUsageRecords({ media, sources: { "index.html": f.sources["index.html"]! }, pages: ["index.html"] });
  const sum = () => {
    const clean = Number(/\((\d+)\)/.exec(controller.item().label)?.[1] ?? 0), improve = Number(/\((\d+)\)/.exec(controller.improveItem().label)?.[1] ?? 0);
    return clean + improve;
  };
  // First check: Clean up opens at once, but no count shows until Improve images' rows are in.
  const first = controller.update(usage(["images/wide.png", "a.png", "b.png"]));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(controller.state().suggestions.count, 2);
  assert.equal(controller.item().label, "Clean up");
  assert.equal(controller.item().disabled, undefined);
  assert.ok(f.states.every(state => !state.badge.show), "no badge from half a check");
  release(); await first;
  assert.deepEqual(badge(f.states), { count: 3, show: true, improve: 1 });
  assert.deepEqual([controller.item().label, controller.improveItem().label], ["Clean up (2)", "Improve images (1)"]);
  assert.equal(sum(), badge(f.states)?.count);
  // A recheck (a file removed): the last pair stands until the new one has both counts.
  gate = new Promise<void>(resolve => { release = resolve; });
  const seen = f.states.length;
  const second = controller.update(usage(["images/wide.png", "a.png"]));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(controller.state().suggestions.count, 1);
  assert.ok(f.states.slice(seen).every(state => state.badge.count === 3), "the badge holds while rows are read");
  assert.equal(sum(), 3);
  release(); await second;
  assert.deepEqual(badge(f.states), { count: 2, show: true, improve: 1 });
  assert.equal(sum(), 2);
  // Clean up dropping to nothing while rows are read (review): More still adds up to the badge.
  gate = new Promise<void>(resolve => { release = resolve; });
  const third = controller.update(usage(["images/wide.png"]));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(controller.state().suggestions.count, 0);
  assert.equal(controller.item().disabled, "Nothing to clean up: every file is used or marked Always keep.");
  assert.equal(sum(), badge(f.states)?.count);
  release(); await third;
  assert.deepEqual(badge(f.states), { count: 1, show: true, improve: 1 });
  assert.equal(sum(), 1);
  await controller.update(usage(["images/wide.png", "a.png"]));
  // Rows that cannot be read keep the last ones rather than dropping to Clean up alone.
  pagesFail = true;
  await controller.update(usage(["images/wide.png", "a.png", "c.png"]));
  assert.deepEqual(badge(f.states), { count: 3, show: true, improve: 1 });
  assert.equal(sum(), 3);
});
