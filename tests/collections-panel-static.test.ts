import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { deriveNativeRoutes } from "../shared/native-routes.ts";

// The collection panel's ordinary-card branch (src/components/collections-panel.ts),
// mounted on a small DOM stand-in: Node has no DOM, and the panel only needs
// elements, text, attributes, form values and bubbling events. Stylesheet and
// raw SVG imports load as empty modules.
register("data:text/javascript," + encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    if (specifier.endsWith(".css") || specifier.includes("?raw")) return { url: "data:text/javascript,export default ''", shortCircuit: true };
    return next(specifier, context);
  }`));

class FakeEvent { defaultPrevented = false; target: FakeNode | undefined; constructor(public type: string) {} preventDefault() { this.defaultPrevented = true; } }
class FakeNode {
  parentElement: FakeElement | null = null;
  childNodes: FakeNode[] = [];
  data = "";
  get textContent(): string { return this.data + this.childNodes.map((child) => child.textContent).join(""); }
  set textContent(text: string) { this.childNodes = []; this.data = text; }
}
class FakeElement extends FakeNode {
  className = ""; id = ""; hidden = false; disabled = false; value = ""; checked = false; type = ""; placeholder = ""; rows = 0;
  attributes = new Map<string, string>();
  listeners = new Map<string, ((event: FakeEvent) => void)[]>();
  constructor(public localName: string) { super(); }
  get children() { return this.childNodes.filter((child): child is FakeElement => child instanceof FakeElement); }
  get classList() { return { add: (name: string) => { this.className = `${this.className} ${name}`.trim(); } }; }
  private adopt(nodes: (FakeNode | string)[]) {
    return nodes.map((item) => { const child = typeof item === "string" ? Object.assign(new FakeNode(), { data: item }) : item; child.parentElement?.removeChild(child); child.parentElement = this; return child; });
  }
  append(...nodes: (FakeNode | string)[]) { this.childNodes.push(...this.adopt(nodes)); }
  insertBefore(node: FakeNode, before: FakeNode) { const [child] = this.adopt([node]); const at = this.childNodes.indexOf(before); this.childNodes.splice(at < 0 ? this.childNodes.length : at, 0, child); }
  replaceChildren(...nodes: (FakeNode | string)[]) { this.data = ""; for (const child of this.childNodes) child.parentElement = null; this.childNodes = []; this.append(...nodes); }
  removeChild(node: FakeNode) { this.childNodes = this.childNodes.filter((child) => child !== node); node.parentElement = null; }
  remove() { this.parentElement?.removeChild(this); }
  contains(node: unknown): boolean { return node === this || this.children.some((child) => child.contains(node)); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  addEventListener(type: string, listener: (event: FakeEvent) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  dispatchEvent(event: FakeEvent) {
    event.target ??= this;
    for (let at: FakeElement | null = this; at; at = at.parentElement) for (const listener of at.listeners.get(event.type) ?? []) listener(event);
    return !event.defaultPrevented;
  }
  click() { this.dispatchEvent(new FakeEvent("click")); if (this.localName === "button" && this.type === "submit") this.closest("form")?.dispatchEvent(new FakeEvent("submit")); }
  closest(name: string): FakeElement | null { for (let at: FakeElement | null = this; at; at = at.parentElement) if (at.localName === name) return at; return null; }
  all(): FakeElement[] { return this.children.flatMap((child) => [child, ...child.all()]); }
  querySelectorAll(selector: string) { const names = selector.split(",").map((name) => name.trim()); return this.all().filter((el) => names.includes(el.localName)); }
}
class FakeInput extends FakeElement {}
class FakeTextArea extends FakeElement {}
class FakeSelect extends FakeElement {}
const fakeGlobals = globalThis as Record<string, unknown>;
fakeGlobals.HTMLInputElement = FakeInput;
fakeGlobals.HTMLTextAreaElement = FakeTextArea;
fakeGlobals.HTMLSelectElement = FakeSelect;
fakeGlobals.document = {
  activeElement: null,
  createElement: (name: string) => name === "input" ? new FakeInput(name) : name === "textarea" ? new FakeTextArea(name) : name === "select" ? new FakeSelect(name) : new FakeElement(name),
  createTextNode: (text: string) => Object.assign(new FakeNode(), { data: text }),
};

const { mountCollectionsPanel } = await import("../src/components/collections-panel.ts");
const { EDITOR_PAGE_BUILDER_PATH, writePageBuilderDocument } = await import("../src/page-builder/page-builder-document.ts");

interface Site { sources: Record<string, string>; files: string[]; routes: Record<string, string>; identity: { name: string }; revision: string }
function siteOf(sources: Record<string, string>, extraFiles: string[] = [], name = "Larkspur Studio"): Site {
  const files = [...Object.keys(sources), ...extraFiles];
  return { sources, files, routes: deriveNativeRoutes(files), identity: { name }, revision: "r1" };
}
function open(site: Site, options: { files?: boolean; apply?: boolean } = {}) {
  const host = new FakeElement("div");
  const applied: { plan: any; revision: string; label: string }[] = [];
  const grid = { path: "index.html", start: site.sources["index.html"].indexOf('<div class="cards">') };
  const panel = mountCollectionsPanel(host as never, {
    sources: () => site.sources, routes: () => site.routes, identity: () => site.identity, revision: () => site.revision, page: () => "index.html",
    apply: (plan, revision, label) => { applied.push({ plan, revision, label }); return options.apply ?? true; },
    openPage: () => {}, announce: () => {},
    ...(options.files === false ? {} : { files: () => site.files }),
  }, { grid: () => grid });
  const root = host.children[0];
  const find = (name: string, text?: string) => root.all().find((el) => el.localName === name && (text === undefined || el.textContent === text));
  const checks = () => root.all().filter((el) => el instanceof FakeInput && el.type === "checkbox");
  const status = () => root.all().filter((el) => el.getAttribute("role") === "status").map((el) => el.textContent).join(" | ");
  const change = () => find("form")!.dispatchEvent(new FakeEvent("change"));
  const convert = async () => { find("button", "Convert")!.click(); await new Promise((resolve) => setTimeout(resolve, 0)); };
  return { panel, root, find, checks, status, change, convert, applied };
}

const STARTER = "public/native-static-starter/v6a9ca44";
function starter(): Site {
  const manifest = JSON.parse(readFileSync(`${STARTER}/manifest.json`, "utf8")) as { files: { path: string }[]; inline: { path: string; content: string }[] };
  const sources: Record<string, string> = {}, binary: string[] = [];
  for (const { path } of manifest.files) {
    if (path.endsWith(".png")) binary.push(path);
    else sources[path] = readFileSync(`${STARTER}/files/${path}.asset`, "utf8");
  }
  for (const { path, content } of manifest.inline) sources[path] = content;
  return siteOf(sources, binary);
}
const card = (href: string, title: string, note = "Note") =>
  `        <article class="card-project">\n          <p class="card-note">${note}</p>\n          <h3>${title}</h3>\n          <p class="actions"><a href="${href}">Read about ${title}</a></p>\n        </article>`;
const page = (title: string, main = "") => `<!doctype html>\n<html lang="en-GB">\n<head>\n  <meta charset="utf-8">\n  <title>${title} · Larkspur Studio</title>\n  <meta name="description" content="About ${title}.">\n  <link rel="stylesheet" href="/styles/site.css">\n</head>\n<body>\n  <main>\n${main}  </main>\n</body>\n</html>\n`;
function mixed(cards: string[], sidecar?: string): Site {
  const sources: Record<string, string> = {
    "index.html": page("Home", `    <section>\n      <div class="cards">\n${cards.join("\n")}\n      </div>\n    </section>\n`),
    "styles/site.css": ".card-project { padding: 1rem; }\n",
  };
  for (const [folder, name] of [["work", "Alpha"], ["services", "Beta"], ["portfolio", "Gamma"], ["articles", "Delta"], ["videos", "Epsilon"]])
    sources[`${folder}/${name.toLowerCase()}/index.html`] = page(name, `    <h1>${name}</h1>\n`);
  if (sidecar !== undefined) sources[EDITOR_PAGE_BUILDER_PATH] = sidecar;
  return siteOf(sources);
}
// In route order (routes are sorted by path), so converting keeps their order.
const twoCards = [card("/services/beta/", "Beta", "Two"), card("/work/alpha/", "Alpha", "One")];

test("the starter's three article cards open in the ordinary-card form and convert as one exact change", async () => {
  const site = starter();
  const view = open(site);
  assert.equal(view.find("h2")!.textContent, "Choose pages for this grid");
  assert.deepEqual(view.checks().filter((input) => input.checked).map((input) => input.value), ["/work/"]);
  assert.match(view.status(), /3 pages will show, including all 3 current cards exactly as they are/);
  assert.ok(view.root.all().some((el) => el.localName === "li" && /card-note text/.test(el.textContent)));
  await view.convert();
  assert.equal(view.applied.length, 1);
  const { plan, revision } = view.applied[0];
  assert.equal(revision, "r1");
  assert.deepEqual([...plan.edits.keys()], ["index.html"]);
  assert.deepEqual(plan.creates.map((item: { path: string }) => item.path), [EDITOR_PAGE_BUILDER_PATH]);
  // The page keeps every card byte for byte and stays plain HTML.
  const after = plan.edits.get("index.html") as string;
  for (const article of site.sources["index.html"].match(/<article class="card-project">[\s\S]*?<\/article>/g)!) assert.ok(after.includes(article));
  assert.doesNotMatch(after, /data-if|data-each|<template|\{[a-z]/);
  // Every page the plan read is pinned; the JSON is pinned as absent.
  for (const path of Object.keys(site.sources).filter((path) => path.endsWith(".html"))) assert.equal(plan.expectedSources.get(path), site.sources[path], path);
  assert.ok(plan.expectedSources.has(EDITOR_PAGE_BUILDER_PATH));
  assert.equal(plan.expectedSources.get(EDITOR_PAGE_BUILDER_PATH), undefined);
});

test("cards from mixed folders select every current folder; other local folders can be added", async () => {
  const site = mixed(twoCards);
  const view = open(site);
  const checked = () => view.checks().filter((input) => input.checked).map((input) => input.value).sort();
  assert.deepEqual(checked(), ["/services/", "/work/"]);
  assert.deepEqual(view.checks().map((input) => input.value).sort(), ["/articles/", "/portfolio/", "/services/", "/videos/", "/work/"]);
  assert.match(view.status(), /^2 pages will show/);
  // A folder that is not on the site is refused inline; a real one is added and checked.
  const typed = view.root.all().find((el) => el.getAttribute("aria-label") === "Add a folder")!;
  typed.value = "/nope/"; view.find("button", "Add folder")!.click();
  assert.match(view.root.textContent, /\/nope\/ has no pages on this site/);
  typed.value = "/videos"; view.find("button", "Add folder")!.click();
  assert.deepEqual(checked(), ["/services/", "/videos/", "/work/"]);
  assert.match(view.status(), /^3 pages will show, including all 2 current cards/);
  // Unchecking a current card's folder would drop it: refused, and Convert is off.
  view.checks().find((input) => input.value === "/services/")!.checked = false;
  view.change();
  assert.match(view.status(), /leave out \/services\/beta\/.*Nothing will change/);
  assert.equal(view.find("button", "Convert")!.disabled, true);
  view.checks().find((input) => input.value === "/services/")!.checked = true;
  view.change();
  await view.convert();
  assert.equal(view.applied.length, 1);
  assert.equal(view.applied[0].plan.expectedSources.get("videos/epsilon/index.html"), site.sources["videos/epsilon/index.html"]);
});

test("an existing page data file is edited, not created", async () => {
  const sidecar = writePageBuilderDocument({ version: 1, pages: {}, collections: {} } as never);
  const view = open(mixed(twoCards, sidecar));
  await view.convert();
  const { plan } = view.applied[0];
  assert.deepEqual(plan.creates, []);
  assert.deepEqual([...plan.edits.keys()].sort(), [EDITOR_PAGE_BUILDER_PATH, "index.html"]);
  assert.equal(plan.expectedSources.get(EDITOR_PAGE_BUILDER_PATH), sidecar);
});

test("rich or ambiguous cards, and a missing file list, are refused with nothing to apply", () => {
  const rich = open(mixed([card("/services/beta/", "Beta", "<em>Two</em> more"), twoCards[1]]));
  assert.match(rich.root.textContent, /can't be turned into a page list yet.*mixes text with other markup/s);
  assert.equal(rich.find("button", "Convert"), undefined);
  const varied = open(mixed([twoCards[0], twoCards[1].replace('class="card-note"', 'class="card-note wide"')]));
  assert.match(varied.root.textContent, /differ in more than their text/);
  const blind = open(mixed(twoCards), { files: false });
  assert.match(blind.root.textContent, /complete file list/);
  for (const view of [rich, varied, blind]) assert.equal(view.applied.length, 0);
});

const changes: [string, (site: Site) => void][] = [
  ["a page's text", (site) => { site.sources = { ...site.sources, "videos/epsilon/index.html": site.sources["videos/epsilon/index.html"].replace("Epsilon ·", "Zeta ·") }; }],
  ["the routes", (site) => { site.routes = { ...site.routes, "/work/new/": "work/new/index.html" }; }],
  ["the site name", (site) => { site.identity = { name: "Other" }; }],
  ["the file list", (site) => { site.files = [...site.files, "images/new.png"]; }],
  ["the revision", (site) => { site.revision = "r2"; }],
];
for (const [what, mutate] of changes)
  test(`a change to ${what} while the panel is open refuses Convert without writing`, async () => {
    const site = mixed(twoCards);
    const view = open(site);
    assert.equal(view.find("button", "Convert")!.disabled, false);
    mutate(site);
    await view.convert();
    assert.equal(view.applied.length, 0);
    assert.match(view.root.textContent, /The page or repository changed/);
  });

test("Cancel closes the form without applying anything", () => {
  const view = open(mixed(twoCards));
  view.find("button", "Cancel")!.click();
  assert.equal(view.applied.length, 0);
});
