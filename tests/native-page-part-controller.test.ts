import assert from "node:assert/strict";
import { test } from "node:test";
import { createNativePagePartController } from "../src/page-builder/native-page-part-controller";
import { composeNativePagePartEdit } from "../src/components/native-page-part-preview";
import type { MasterControllerHost, MasterSelection } from "../src/page-builder/native-section-master-controller";

function fixture(onOpen?: (data: Record<string, string | undefined>, path: string) => void) {
  const part = '<header class="site-header"><a href="/">Home</a></header>';
  const page = `<html><head><link rel="stylesheet" href="/site.css"></head><body><div>${part}</div><main>Keep</main></body></html>`;
  const data: Record<string, string | undefined> = { "index.html": page, "site.css": ".site-header { color: red; }" };
  const files = Object.keys(data);
  let currentPath = "index.html", revision = "r1", applies = 0;
  const range = { start: page.indexOf(part), end: page.indexOf(part) + part.length };
  const selection: MasterSelection = { path: currentPath, node: [0, 0], range, paintedSource: page };
  const selections: unknown[] = [];
  const host: MasterControllerHost = {
    snapshot: () => ({ files, revision, currentPath, selection, source: path => data[path] }),
    open: async (path, expected) => { if (revision !== expected) return false; currentPath = path; onOpen?.(data, path); return true; },
    select: (path, range) => { selections.push({ path, range }); },
    announce: () => {}, locateCopy: (_source, range) => ({ node: [0, 0], range }),
    apply: async (operation, expectedFiles, current) => {
      if (!current() || JSON.stringify([...files].sort()) !== JSON.stringify(expectedFiles)
        || [...operation.expectedSources].some(([path, source]) => data[path] !== source)) return false;
      applies++;
      for (const [path, source] of operation.edits) data[path] = source;
      for (const item of operation.creates ?? []) { files.push(item.path); data[item.path] = item.content; }
      return true;
    },
  };
  return { part, page, data, files, selection, selections, controller: createNativePagePartController(host),
    setPath: (path: string) => { currentPath = path; }, setRevision: () => { revision = "r2"; }, applies: () => applies };
}

test("explicit save/edit/update/done preserves roots and writes one atomic page update", async () => {
  const f = fixture();
  assert.equal(f.controller.identity(f.selection), undefined, "same tag does not infer ownership");
  assert.equal(await f.controller.save(f.selection, { id: "site-header", label: "Header", rootClass: "site-header", stylesheetPath: "site.css" }), true);
  assert.equal(f.data["index.html"], f.page);
  assert.equal(f.applies(), 1);
  await f.controller.identity(f.selection)!.onEdit();
  const input = f.controller.previewInput()!;
  assert.deepEqual(input.node, [0, 0]);
  const master = input.masterPath;
  f.data[master] = f.part.replace("Home", "Welcome");
  const updated = f.controller.previewInput()!;
  const composition = composeNativePagePartEdit(updated, { sources: f.data as Record<string, string>, pagePath: "index.html", session: updated.session });
  assert.ok(!("error" in composition));
  assert.deepEqual(composition.masterNode, [0]);
  assert.equal(composition.pageBody, `<div>${f.data[master]}</div><main>Keep</main>`);
  assert.deepEqual(await f.controller.updateCopies(), { changed: 1, skipped: 0 });
  assert.equal(f.applies(), 2);
  assert.equal(f.data["site.css"], ".site-header { color: red; }");
  await f.controller.done();
  assert.equal(f.applies(), 2, "Done never writes");
  assert.equal(f.selections.length, 1);
  assert.equal(f.controller.previewInput(), undefined);
});

test("foreign file, graph, revision, changed page and custom copies refuse or skip", async () => {
  for (const change of ["path", "graph", "revision", "page"] as const) {
    const f = fixture();
    await f.controller.save(f.selection, { id: "site-header", label: "Header", rootClass: "site-header", stylesheetPath: "site.css" });
    await f.controller.edit(f.selection);
    if (change === "path") f.setPath("site.css");
    if (change === "graph") f.files.push("other.html");
    if (change === "revision") f.setRevision();
    if (change === "page") f.data["index.html"] = f.page.replace("Home", "Custom");
    assert.equal(f.controller.previewInput(), undefined, change);
    if (change !== "page") assert.ok("error" in await f.controller.updateCopies(), change);
    else {
      f.data[".editor/page-parts/site-header.html"] = f.part.replace("Home", "New");
      assert.deepEqual(await f.controller.updateCopies(), { changed: 0, skipped: 1 });
      await f.controller.done();
      assert.equal(f.selections.length, 0, "changed page never restores stale range");
    }
    assert.equal(f.applies(), 1);
  }
});

test("composer rejects old sessions, foreign pages, changed masters and wrong depth/root", () => {
  const f = fixture();
  const input = { session: "new", pagePath: "index.html", pageSource: f.page, node: [0, 0], basis: f.part,
    masterPath: ".editor/page-parts/site-header.html", masterSource: f.part };
  const sources = { "index.html": f.page, [input.masterPath]: f.part };
  for (const [raw, current] of [
    [input, { sources, pagePath: "index.html", session: "old" }],
    [input, { sources, pagePath: "other.html" }],
    [input, { sources: { ...sources, [input.masterPath]: f.part + " " }, pagePath: "index.html" }],
    [{ ...input, node: [0] }, { sources, pagePath: "index.html" }],
    [{ ...input, masterSource: '<footer class="site-header">Footer</footer>' }, { sources: { "index.html": f.page }, pagePath: "index.html" }],
  ] as const) assert.ok("error" in composeNativePagePartEdit(raw, current));
});

test("opening await cannot adopt a changed page; invalid master and Undo source guard refuse preview", async () => {
  const changed = fixture((data, path) => { if (path.startsWith(".editor/")) data["index.html"] += "<!-- changed -->"; });
  await changed.controller.save(changed.selection, { id: "site-header", label: "Header", rootClass: "site-header", stylesheetPath: "site.css" });
  await changed.controller.edit(changed.selection);
  assert.equal(changed.controller.context(), undefined);
  const f = fixture();
  await f.controller.save(f.selection, { id: "site-header", label: "Header", rootClass: "site-header", stylesheetPath: "site.css" });
  await f.controller.edit(f.selection);
  const input = f.controller.previewInput()!;
  f.data[input.masterPath] = "<footer>Invalid changed root</footer>";
  assert.equal(f.controller.previewInput(), undefined);
  assert.ok("error" in await f.controller.updateCopies());
  f.data[input.masterPath] = input.masterSource;
  assert.ok(f.controller.previewInput(), "fresh resize reads remain valid with identical sources");
  await f.controller.done();
  f.data["index.html"] = f.page; // Undo changes sources, never recreates an ended controller session.
  assert.equal(f.controller.previewInput(), undefined);
  assert.equal(f.applies(), 1);
});
