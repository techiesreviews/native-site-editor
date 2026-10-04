import assert from "node:assert/strict";
import { test } from "node:test";
import { EDITOR_PAGE_BUILDER_PATH } from "../src/page-builder/page-builder-document";
import { sectionMasterPath, type StaticSectionOperation } from "../src/page-builder/static-sections";
import { readNativeSectionLinks } from "../src/page-builder/native-section-links";
import { createNativeSectionMasterController, type MasterSelection } from "../src/page-builder/native-section-master-controller";

// Contract tests with an in-memory host: it applies an operation only when every expected
// source and the file graph still match (as the editor's atomic operation does), and counts
// writes. They check the controller's decisions, not the browser.
const intro = { id: "intro", label: "Intro", rootClass: "intro", stylesheetPath: "styles/sections.css", html: `<section class="intro"><h2>Hello</h2></section>`, css: "" };
const json = JSON.stringify({ version: 1, pages: {}, collections: {}, future: { kept: true }, reusableSections: { version: 1, records: { intro } } }, null, 2) + "\n";
const page = (body: string) => `<!doctype html><html><head><title>T</title></head><body><main>${body}</main></body></html>`;
const masterPath = sectionMasterPath("intro");

function makeHost(files: Record<string, string>) {
  const state = { files: { ...files }, revision: "r1", applied: 0, opened: [] as string[], selected: [] as string[], said: [] as string[], openDelay: undefined as undefined | (() => void), afterApply: undefined as undefined | (() => void), beforeCommit: undefined as undefined | (() => void), currentPath: "index.html", selection: undefined as MasterSelection | undefined };
  const host = {
    snapshot: () => ({ revision: state.revision, files: Object.keys(state.files).sort(), source: (path: string) => state.files[path], currentPath: state.currentPath, selection: state.selection }),
    async open(path: string, revision: string) { if (revision !== state.revision) return false; state.opened.push(path); state.openDelay?.(); return state.revision === revision; },
    select(path: string, range: { start: number; end: number }) { state.selected.push(`${path}@${range.start}`); },
    // As the editor's transaction: awaits (here one tick, plus a hook to change things meanwhile),
    // then re-checks `current()` and every pin before the final write.
    async apply(operation: StaticSectionOperation, expectedFiles: readonly string[] | undefined, current: () => boolean) {
      if (!current()) return false;
      await Promise.resolve();
      state.beforeCommit?.();
      await Promise.resolve();
      if (!current()) return false;
      if (expectedFiles && JSON.stringify([...expectedFiles].sort()) !== JSON.stringify(Object.keys(state.files).sort())) return false;
      for (const [path, expected] of operation.expectedSources) if (state.files[path] !== expected) return false;
      for (const [path, text] of operation.edits) state.files[path] = text;
      for (const create of operation.creates ?? []) state.files[create.path] = create.content;
      state.applied++;
      state.afterApply?.();
      return true;
    },
    announce(message: string) { state.said.push(message); },
  };
  return { state, host, controller: createNativeSectionMasterController(host) };
}
function select(files: Record<string, string>, path: string, html: string, state?: { selection?: MasterSelection; currentPath: string }): MasterSelection {
  const source = files[path];
  const start = source.indexOf(html);
  const selection = { path, node: [1, 0, start], range: { start, end: start + html.length }, paintedSource: source };
  if (state) { state.selection = selection; state.currentPath = path; }
  return selection;
}

test("Edit on an exact copy makes the master and links the copy in one operation; pages and CSS stay", async () => {
  const home = page(intro.html);
  const { state, controller } = makeHost({ "index.html": home, [EDITOR_PAGE_BUILDER_PATH]: json, "styles/sections.css": "" });
  const identity = controller.identity(select(state.files, "index.html", intro.html, state))!;
  assert.deepEqual({ ...identity, onEdit: undefined }, { recordId: "intro", label: "Intro", master: false, linked: false, onEdit: undefined });
  await identity.onEdit();
  assert.equal(state.applied, 1);
  assert.equal(state.files[masterPath], intro.html);
  assert.equal(state.files["index.html"], home);
  assert.equal(state.files["styles/sections.css"], "");
  const raw = JSON.parse(state.files[EDITOR_PAGE_BUILDER_PATH]);
  assert.equal(raw.reusableSections.records.intro.htmlPath, masterPath);
  assert.equal(Object.hasOwn(raw.reusableSections.records.intro, "html"), false);
  assert.deepEqual(raw.future, { kept: true });
  assert.equal(readNativeSectionLinks(state.files[EDITOR_PAGE_BUILDER_PATH])["index.html"]["intro-1"].basis, intro.html);
  assert.deepEqual(state.opened, [masterPath]);
  assert.equal(controller.context()?.htmlPath, masterPath);
  // A child of the section has no identity.
  assert.equal(controller.identity(select(state.files, "index.html", "<h2>Hello</h2>", state)), undefined);
});

test("Edit on a customised copy makes the master but leaves the copy unlinked", async () => {
  const mine = `<section class="intro"><h2>My words</h2></section>`;
  const { state, controller } = makeHost({ "index.html": page(mine), [EDITOR_PAGE_BUILDER_PATH]: json });
  await controller.edit(select(state.files, "index.html", mine, state));
  assert.equal(state.applied, 1);
  assert.deepEqual(readNativeSectionLinks(state.files[EDITOR_PAGE_BUILDER_PATH]), {});
  assert.equal(state.files[masterPath], intro.html);
});

test("Edit refuses a taken master path, a stale painted page and a repository change across the open", async () => {
  const home = page(intro.html);
  const taken = makeHost({ "index.html": home, [EDITOR_PAGE_BUILDER_PATH]: json, [masterPath]: "<p>someone else's</p>" });
  await taken.controller.edit(select(taken.state.files, "index.html", intro.html, taken.state));
  assert.equal(taken.state.applied, 0);
  assert.equal(taken.state.files[masterPath], "<p>someone else's</p>");
  assert.deepEqual(taken.state.opened, []);
  // Painted bytes no longer the page's source: no identity, no writes.
  const stale = makeHost({ "index.html": home, [EDITOR_PAGE_BUILDER_PATH]: json });
  const selection = select(stale.state.files, "index.html", intro.html, stale.state);
  stale.state.files["index.html"] = page(`<p>x</p>${intro.html}`);
  assert.equal(stale.controller.identity(selection), undefined);
  await stale.controller.edit(selection);
  assert.equal(stale.state.applied, 0);
  // Same bytes, different revision while the master opens: the session ends.
  const moved = makeHost({ "index.html": home, [EDITOR_PAGE_BUILDER_PATH]: json });
  moved.state.openDelay = () => { moved.state.revision = "r2"; };
  await moved.controller.edit(select(moved.state.files, "index.html", intro.html, moved.state));
  assert.equal(moved.controller.context(), undefined);
  assert.match(moved.state.said.at(-1)!, /repository changed/);
});

test("typing in the master never changes pages; Done returns without writes and re-selects only unchanged bytes", async () => {
  const home = page(intro.html);
  const { state, controller } = makeHost({ "index.html": home, [EDITOR_PAGE_BUILDER_PATH]: json });
  const selection = select(state.files, "index.html", intro.html, state);
  await controller.edit(selection);
  const applied = state.applied;
  state.files[masterPath] = `<section class="intro"><h2>Typed</h2></section>\n`;
  assert.equal(state.files["index.html"], home);
  await controller.done();
  assert.equal(state.applied, applied);
  assert.deepEqual(state.opened, [masterPath, "index.html"]);
  assert.deepEqual(state.selected, [`index.html@${selection.range.start}`]);
  assert.equal(controller.context(), undefined);
  // An invalid master can still be left with Done; the page changed meanwhile: no re-select.
  await controller.edit(select(state.files, "index.html", intro.html, state));
  state.files[masterPath] = "<div>broken</div>";
  assert.match(controller.context()!.masterError!, /section/);
  state.files["index.html"] = page(`<p>new</p>${intro.html}`);
  await controller.done();
  assert.equal(state.selected.length, 1);
  assert.match(state.said.at(-1)!, /Select the section again/);
  // A repository change: Done opens nothing.
  await controller.edit(select(state.files, "index.html", intro.html, state));
  state.revision = "r3";
  const opened = state.opened.length;
  await controller.done();
  assert.equal(state.opened.length, opened);
});

test("Update copies rewrites only unchanged copies, keeps customised ones, in one operation pinned to the master", async () => {
  const home = page(intro.html);
  const mine = `<section class="intro" id="mine"><h2>Mine</h2></section>`;
  const { state, controller } = makeHost({ "index.html": home, "about/index.html": page(mine), [EDITOR_PAGE_BUILDER_PATH]: json });
  await controller.edit(select(state.files, "index.html", intro.html, state));
  // Link the customised copy too (by hand, as an earlier link would be).
  const raw = JSON.parse(state.files[EDITOR_PAGE_BUILDER_PATH]);
  raw.pages["about/index.html"] = { sections: { "intro-1": { kind: "native-section", recordId: "intro", basis: intro.html, target: { authoredId: "mine", path: [1, 0, 0], tag: "section", openingTagFingerprint: `<section class="intro" id="mine">` } } } };
  state.files[EDITOR_PAGE_BUILDER_PATH] = JSON.stringify(raw);
  const newer = `\n<section class="intro"><h2>Newer</h2></section>\n`;
  state.files[masterPath] = newer;
  const before = state.applied;
  const result = await controller.updateCopies();
  assert.deepEqual(result, { changed: 1, skipped: 1 });
  assert.equal(state.applied, before + 1);
  assert.equal(state.files["index.html"], page(`<section class="intro"><h2>Newer</h2></section>`));
  assert.equal(state.files["about/index.html"], page(mine));
  assert.equal(state.files[masterPath], newer);
  // An invalid master, or a link to a page that isn't loaded, refuses with no writes.
  state.files[masterPath] = "<div></div>";
  const count = state.applied;
  assert.ok("error" in await controller.updateCopies());
  state.files[masterPath] = newer;
  const linked = JSON.parse(state.files[EDITOR_PAGE_BUILDER_PATH]);
  linked.pages["gone/index.html"] = { sections: { x: { kind: "native-section", recordId: "intro", basis: intro.html, target: { path: [1], tag: "section", openingTagFingerprint: `<section class="intro">` } } } };
  state.files[EDITOR_PAGE_BUILDER_PATH] = JSON.stringify(linked);
  assert.ok("error" in await controller.updateCopies());
  assert.equal(state.applied, count);
});

test("an existing master opens from its loaded draft; a missing one refuses without writes", async () => {
  const master = JSON.stringify({ version: 1, pages: {}, collections: {}, reusableSections: { version: 2, records: { intro: { ...intro, html: undefined, htmlPath: masterPath } } } });
  const home = page(intro.html);
  const ok = makeHost({ "index.html": home, [EDITOR_PAGE_BUILDER_PATH]: master, [masterPath]: `${intro.html}\n` });
  await ok.controller.edit(select(ok.state.files, "index.html", intro.html, ok.state));
  assert.equal(ok.state.applied, 0);
  assert.deepEqual(ok.state.opened, [masterPath]);
  assert.equal(ok.controller.context()?.masterError, undefined);
  const missing = makeHost({ "index.html": home, [EDITOR_PAGE_BUILDER_PATH]: master });
  await missing.controller.edit(select(missing.state.files, "index.html", intro.html, missing.state));
  assert.equal(missing.state.applied, 0);
  assert.deepEqual(missing.state.opened, []);
});

// An Edit callback built for one selection must not run once the user selected something else,
// opened another page, or the repository changed while the operation applied.
test("a stale Edit after selecting another section or page writes and opens nothing", async () => {
  const outro = { ...intro, id: "outro", label: "Outro", rootClass: "outro", html: `<section class="outro"><p>Bye</p></section>` };
  const both = JSON.stringify({ version: 1, pages: {}, collections: {}, reusableSections: { version: 1, records: { intro, outro } } });
  const home = page(intro.html + outro.html);
  const { state, controller } = makeHost({ "index.html": home, "about/index.html": home, [EDITOR_PAGE_BUILDER_PATH]: both });
  const stale = controller.identity(select(state.files, "index.html", intro.html, state))!;
  // Another section on the same page.
  select(state.files, "index.html", outro.html, state);
  await stale.onEdit();
  assert.equal(state.applied, 0);
  assert.deepEqual(state.opened, []);
  // Another page with the same bytes.
  select(state.files, "about/index.html", intro.html, state);
  await stale.onEdit();
  assert.equal(state.applied, 0);
  assert.deepEqual(state.opened, []);
  assert.equal(state.files[sectionMasterPath("intro")], undefined);
  // The selection changes while the operation applies: committed, but the master is not opened.
  const fresh = controller.identity(select(state.files, "index.html", intro.html, state))!;
  state.afterApply = () => { select(state.files, "index.html", outro.html, state); };
  await fresh.onEdit();
  assert.equal(state.applied, 1);
  assert.deepEqual(state.opened, []);
  assert.equal(controller.context(), undefined);
  // A new repository while applying: no open either.
  const other = makeHost({ "index.html": page(intro.html), [EDITOR_PAGE_BUILDER_PATH]: json });
  const edit = other.controller.identity(select(other.state.files, "index.html", intro.html, other.state))!;
  other.state.afterApply = () => { other.state.revision = "r9"; };
  await edit.onEdit();
  assert.deepEqual(other.state.opened, []);
});

test("an unresolvable link elsewhere does not claim this section is unlinked", () => {
  const home = page(intro.html);
  const broken = JSON.parse(json);
  broken.pages["gone/index.html"] = { sections: { x: { kind: "native-section", recordId: "intro", basis: intro.html, target: { path: [1], tag: "section", openingTagFingerprint: `<section class="intro">` } } } };
  const { state, controller } = makeHost({ "index.html": home, [EDITOR_PAGE_BUILDER_PATH]: JSON.stringify(broken) });
  assert.equal(controller.identity(select(state.files, "index.html", intro.html, state)), undefined);
});

// The editor applies operations asynchronously. Nothing may count as done, or open, before the
// transaction ends, and a change while it waits refuses it through `current()`.
test("an Edit waits for its operation; a change before the commit writes and opens nothing", async () => {
  const home = page(intro.html);
  for (const change of ["selection", "revision", "source", "graph"] as const) {
    const outro = `<section class="outro"><p>Bye</p></section>`;
    const { state, controller } = makeHost({ "index.html": page(intro.html + outro), [EDITOR_PAGE_BUILDER_PATH]: json });
    const identity = controller.identity(select(state.files, "index.html", intro.html, state))!;
    state.beforeCommit = () => {
      if (change === "selection") select(state.files, "index.html", outro, state);
      if (change === "revision") state.revision = "r2";
      if (change === "source") state.files[EDITOR_PAGE_BUILDER_PATH] = json.replace('"Intro"', '"Intro!"');
      if (change === "graph") state.files["new.html"] = "<p></p>";
    };
    await identity.onEdit();
    assert.equal(state.applied, 0, change);
    assert.equal(state.files[masterPath], undefined, change);
    assert.deepEqual(state.opened, [], change);
    assert.equal(controller.context(), undefined, change);
  }
  // Success: the master is opened only after the operation has committed, from the new graph.
  const { state, controller } = makeHost({ "index.html": home, [EDITOR_PAGE_BUILDER_PATH]: json });
  let committedWhenOpened = false;
  state.openDelay = () => { committedWhenOpened = state.applied === 1 && state.files[masterPath] === intro.html; };
  await controller.identity(select(state.files, "index.html", intro.html, state))!.onEdit();
  assert.equal(committedWhenOpened, true);
});

test("Update copies awaits its operation and reports nothing changed when it is refused", async () => {
  const home = page(intro.html);
  const { state, controller } = makeHost({ "index.html": home, [EDITOR_PAGE_BUILDER_PATH]: json });
  await controller.edit(select(state.files, "index.html", intro.html, state));
  state.files[masterPath] = `<section class="intro"><h2>Newer</h2></section>`;
  const applied = state.applied;
  state.beforeCommit = () => { state.files["index.html"] = page(`<p>typed</p>${intro.html}`); };
  const refused = await controller.updateCopies();
  assert.ok("error" in refused);
  assert.equal(state.applied, applied);
  state.beforeCommit = undefined;
  state.files["index.html"] = home;
  const done = await controller.updateCopies();
  assert.deepEqual(done, { changed: 1, skipped: 0 });
  assert.equal(state.files["index.html"], page(`<section class="intro"><h2>Newer</h2></section>`));
});

// --- The master preview input: exact, read-only, and following only the session's own update. ---
const copyA = `<section class="intro" id="a"><h2>Hello</h2></section>`;
const copyB = `<section class="intro" id="b"><h2>Hello</h2></section>`;
const masterJson = (links: Record<string, unknown>) => JSON.stringify({
  version: 1, pages: { "index.html": { sections: links } }, collections: {},
  reusableSections: { version: 2, records: { intro: { id: "intro", label: "Intro", rootClass: "intro", stylesheetPath: "styles/sections.css", css: "", htmlPath: masterPath } } },
});
const linkTo = (id: string, basis: string) => ({ kind: "native-section", recordId: "intro", basis, target: { authoredId: id, path: [1], tag: "section", openingTagFingerprint: `<section class="intro" id="${id}">` } });
// After Edit, Code shows the master (as the editor does when it opens it).
async function openMaster(files: Record<string, string>, html: string) {
  const made = makeHost(files);
  const host = made.host as unknown as { open: (path: string, revision: string) => Promise<boolean> };
  const open = host.open.bind(made.host);
  host.open = async (path, revision) => { const ok = await open(path, revision); if (ok) made.state.currentPath = path; return ok; };
  await made.controller.edit(select(made.state.files, "index.html", html, made.state));
  return made;
}

test("previewInput: one token for the session, exact page bytes and body node, fresh objects; master typing keeps the token", async () => {
  const master = `<section class="intro"><h2>Hello</h2></section>`;
  const home = page(copyA + copyB);
  const { state, controller } = await openMaster({ "index.html": home, [EDITOR_PAGE_BUILDER_PATH]: masterJson({ a: linkTo("a", master), b: linkTo("b", master) }), [masterPath]: master }, copyB);
  const input = controller.previewInput()!;
  assert.equal(input.pagePath, "index.html");
  assert.equal(input.pageSource, home);
  assert.deepEqual(input.node, [0, 1]);
  assert.equal(input.basis, copyB);
  assert.equal(input.masterPath, masterPath);
  assert.equal(input.masterSource, master);
  input.node.push(9);
  assert.deepEqual(controller.previewInput()!.node, [0, 1]);
  state.files[masterPath] = `<section class="intro"><h2>Typed</h2></section>`;
  const typed = controller.previewInput()!;
  assert.equal(typed.session, input.session);
  assert.equal(typed.masterSource, state.files[masterPath]);
  // Not on the master, an invalid master, another revision: nothing.
  state.currentPath = "index.html";
  assert.equal(controller.previewInput(), undefined);
  state.currentPath = masterPath;
  state.files[masterPath] = "<div>no</div>";
  assert.equal(controller.previewInput(), undefined);
  state.files[masterPath] = master;
  assert.ok(controller.previewInput());
  state.revision = "r2";
  assert.equal(controller.previewInput(), undefined);
});

test("after its own Update the session follows the selected copy by its link; Done selects its new range; Undo is not adopted", async () => {
  const old = `<section class="intro"><h2>Hello</h2></section>`;
  const a = `<section class="intro" id="a"><h2>Hello</h2></section>`;
  const b = `<section class="intro" id="b"><h2>Mine</h2></section>`;
  const home = page(a + b);
  const { state, controller } = await openMaster({ "index.html": home, [EDITOR_PAGE_BUILDER_PATH]: masterJson({ a: linkTo("a", a), b: linkTo("b", old) }), [masterPath]: old }, b);
  // The master grows; copy a (unchanged) follows and gets longer; copy b (customised) stays.
  state.files[masterPath] = `<section class="intro" id="a"><h2>Hello, a much longer heading</h2></section>`;
  const before = controller.previewInput()!;
  assert.deepEqual(await controller.updateCopies(), { changed: 1, skipped: 1 });
  const after = controller.previewInput()!;
  assert.equal(after.session, before.session);
  assert.notEqual(after.pageSource, home);
  assert.equal(after.basis, b);
  assert.deepEqual(after.node, [0, 1]);
  const start = after.pageSource.indexOf(b);
  await controller.done();
  assert.deepEqual(state.selected.at(-1), `index.html@${start}`);
  // Undo of that update elsewhere: the bytes the session knew are gone; nothing is adopted.
  const again = await openMaster({ "index.html": home, [EDITOR_PAGE_BUILDER_PATH]: masterJson({ a: linkTo("a", a), b: linkTo("b", old) }), [masterPath]: old }, b);
  again.state.files[masterPath] = `<section class="intro" id="a"><h2>Longer</h2></section>`;
  await again.controller.updateCopies();
  assert.ok(again.controller.previewInput());
  again.state.files["index.html"] = home;
  assert.equal(again.controller.previewInput(), undefined);
});

test("an unlinked selected copy is not followed once the page changes; Done still exits", async () => {
  const master = `<section class="intro"><h2>Hello</h2></section>`;
  const a = `<section class="intro" id="a"><h2>Hello</h2></section>`;
  const mine = `<section class="intro" id="mine"><h2>Mine</h2></section>`;
  const home = page(a + mine);
  const { state, controller } = await openMaster({ "index.html": home, [EDITOR_PAGE_BUILDER_PATH]: masterJson({ a: linkTo("a", a) }), [masterPath]: master }, mine);
  assert.ok(controller.previewInput());
  state.files[masterPath] = `<section class="intro" id="a"><h2>Hello, longer</h2></section>`;
  assert.deepEqual(await controller.updateCopies(), { changed: 1, skipped: 0 });
  assert.equal(controller.previewInput(), undefined);
  await controller.done();
  assert.deepEqual(state.selected, []);
  assert.match(state.said.at(-1)!, /Select the section again/);
});

test("an Update the host reports applied but with other bytes does not move the session", async () => {
  const a = `<section class="intro" id="a"><h2>Hello</h2></section>`;
  const home = page(a);
  const { state, controller } = await openMaster({ "index.html": home, [EDITOR_PAGE_BUILDER_PATH]: masterJson({ a: linkTo("a", a) }), [masterPath]: a }, a);
  state.files[masterPath] = `<section class="intro" id="a"><h2>New</h2></section>`;
  // The page ends up with someone else's bytes right after the write.
  state.afterApply = () => { state.files["index.html"] = page(`<section class="intro" id="a"><h2>Foreign</h2></section>`); };
  await controller.updateCopies();
  assert.equal(controller.previewInput(), undefined);
});

test("Done after the session's own Update re-selects the linked copy at its moved range", async () => {
  const a = `<section class="intro" id="a"><h2>Hello</h2></section>`;
  const b = `<section class="intro" id="b"><h2>Hello</h2></section>`;
  const home = page(a + b);
  const { state, controller } = await openMaster({ "index.html": home, [EDITOR_PAGE_BUILDER_PATH]: masterJson({ a: linkTo("a", a), b: linkTo("b", `<section class="intro"><h2>Old</h2></section>`) }), [masterPath]: a }, b);
  state.files[masterPath] = `<section class="intro" id="a"><h2>Hello, now longer</h2></section>`;
  assert.deepEqual(await controller.updateCopies(), { changed: 1, skipped: 1 });
  await controller.done();
  assert.deepEqual(state.selected, [`index.html@${state.files["index.html"].indexOf(b)}`]);
});
