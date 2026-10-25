import test from "node:test";
import assert from "node:assert/strict";
import { createMediaUsageController, type MediaUsageCheckPorts } from "../src/controllers/media-usage-controller";
import type { MediaUsageRecords } from "../src/page-builder/media-usage";

const turn = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function fixture() {
  let key = "repo:main:commit";
  const files = ["index.html", "images/a.png", ...Array.from({ length: 14 }, (_, i) => `note${i}.txt`)];
  const sources: Record<string, string> = { "index.html": "<p>Home</p>" };
  const updates: (MediaUsageRecords | undefined)[] = [];
  const gate = deferred<void>();
  const ports = {
    key: () => key, files: () => files, pages: () => ["index.html"], components: () => ({}),
    source: (path: string) => sources[path], read: async () => "a.png", url: () => "https://native.example",
    settled: () => gate.promise, changed: (value: MediaUsageRecords | undefined) => { updates.push(value); },
  } satisfies MediaUsageCheckPorts;
  return { ports, updates, sources, gate, setKey: (value: string) => { key = value; } };
}
test("opening waits for the existing index, then publishes shrinking pending and checked completion", async () => {
  const f = fixture(), controller = createMediaUsageController(f.ports);
  controller.refresh(); await turn();
  assert.equal(f.updates.length, 0);
  f.gate.resolve(); await turn();
  assert.deepEqual(f.updates.filter(Boolean).map(value => value!.pending.length), [14, 2, 0]);
  assert.equal(controller.usageRecords()?.families[0].checked, true);
  assert.equal(controller.usageRecords()?.families[0].otherUses.length, 14);
  controller.dispose();
});
test("repository changes drop held old reads and publish only the new scope", async () => {
  const f = fixture(), old = deferred<string>();
  let reads = 0;
  f.ports.read = async () => { reads++; return old.promise; };
  const controller = createMediaUsageController(f.ports);
  f.gate.resolve(); controller.refresh(); await turn();
  assert.equal(reads, 12);
  f.setKey("other:branch:commit");
  f.ports.read = async () => "unused";
  controller.refresh(); await turn();
  const before = f.updates.length;
  assert.equal(controller.usageRecords()?.families[0].otherUses.length, 0);
  old.resolve("a.png"); await turn();
  assert.equal(f.updates.length, before);
  assert.equal(controller.usageRecords()?.families[0].checked, true);
  controller.dispose();
});
test("draft refreshes coalesce and retain uses while an unreadable source blocks all families", async () => {
  const f = fixture();
  f.ports.read = async () => { throw new Error("unreadable"); };
  const controller = createMediaUsageController(f.ports);
  f.gate.resolve(); controller.refresh(); controller.refresh(); await turn();
  assert.equal(controller.usageRecords()?.unreadable.length, 14);
  f.sources["index.html"] = '<img src="/images/a.png">';
  controller.refresh(); await turn();
  assert.deepEqual(controller.usageRecords()?.families[0].pages, ["index.html"]);
  assert.equal(controller.usageRecords()?.families[0].checked, false);
  controller.dispose();
});

test("disposing a queued check cancels reads and publications", async () => {
  const f = fixture();
  const controller = createMediaUsageController(f.ports);
  f.gate.resolve(); controller.refresh(); controller.dispose();
  const count = f.updates.length;
  await turn();
  assert.equal(f.updates.length, count);
  assert.equal(controller.usageRecords(), undefined);
});

test("an edit during a read stops that check from publishing a stale result", async () => {
  const f = fixture(), held = deferred<string>();
  f.ports.read = async () => held.promise;
  const controller = createMediaUsageController(f.ports);
  f.gate.resolve(); controller.refresh(); await turn();
  const before = f.updates.length;
  f.sources["index.html"] = '<img src="/images/a.png">';
  controller.invalidate();
  held.resolve("nothing"); await turn();
  assert.equal(f.updates.length, before);
  assert.notEqual(controller.usageRecords()?.families[0].checked, true);
  controller.refresh(); await turn(); await turn();
  assert.deepEqual(controller.usageRecords()?.families[0].pages, ["index.html"]);
  assert.equal(controller.usageRecords()?.families[0].checked, true);
  controller.dispose();
});

test("a file with no held source is read again on every check, so a replacement is judged by its new bytes", async () => {
  const f = fixture();
  let text = '<svg><image href="/images/a.png"/></svg>';
  f.ports.read = async (path: string) => path === "note0.txt" ? text : "";
  const controller = createMediaUsageController(f.ports);
  f.gate.resolve(); controller.refresh(); await turn(); await turn();
  assert.deepEqual(controller.usageRecords()?.families[0].otherUses.map(use => use.file), ["note0.txt"]);
  text = "nothing here";
  controller.refresh(); await turn(); await turn();
  assert.deepEqual(controller.usageRecords()?.families[0].otherUses, []);
  assert.equal(controller.usageRecords()?.families[0].checked, true);
  controller.dispose();
});

test("usage controller reads the live site address for prefixed references", async () => {
  const f = fixture();
  f.sources["index.html"] = '<img src="/my-site/images/a.png">';
  f.ports.url = () => "https://user.github.io/my-site/";
  const controller = createMediaUsageController(f.ports);
  f.gate.resolve();
  controller.refresh();
  for (let i = 0; i < 10 && !f.updates.some(records => records?.families[0]?.pages.length); i++) await turn();
  assert.deepEqual(f.updates.at(-1)?.families[0].pages, ["index.html"]);
  controller.dispose();
});

test("another site's same-named file is read for its own text, and the first site's again on return (ticket 38)", async () => {
  const f = fixture();
  f.ports.read = async () => "no pictures";
  const controller = createMediaUsageController(f.ports);
  const pages = () => controller.usageRecords()?.families.find(family => family.main === "images/a.png")?.pages;
  f.gate.resolve();
  f.sources["index.html"] = '<img src="/images/a.png">';
  controller.refresh(); await turn();
  assert.deepEqual(pages(), ["index.html"]);
  // Another site whose index.html shows no picture.
  f.setKey("other:main:commit");
  f.sources["index.html"] = "<p>No picture here</p>";
  controller.refresh(); await turn();
  assert.deepEqual(pages(), []);
  // Back to the first site and its picture.
  f.setKey("repo:main:commit");
  f.sources["index.html"] = '<img src="/images/a.png">';
  controller.refresh(); await turn();
  assert.deepEqual(pages(), ["index.html"]);
  // The same site, its text edited: the edit is read.
  f.sources["index.html"] = "<p>Picture removed</p>";
  controller.refresh(); await turn();
  assert.deepEqual(pages(), []);
  controller.dispose();
});
