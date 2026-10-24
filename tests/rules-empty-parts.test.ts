import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { emptyParts, isContent } from "../src/page-builder/rules/empty-parts.ts";
import { domView, type DomLikeNode } from "../src/page-builder/rules/tree.ts";
import { decodeEntities, parseSource, readInstance, slotStates, sourceView, type SourceElement, type SourceNode } from "../src/page-builder/component-model.ts";
import { isSectionTemplate, startTagAttribute } from "../shared/html-source.ts";

// Empty optional parts behave exactly as the site's own loader hides them
// (ticket 05 item 5). The parity cases run the starter loader's `hideEmpty`
// (fixtures/actual-starter/components/components.js, the site's code as
// shipped) on a small shadow DOM built from each fixture component and a
// page instance, and check that the rule marks the same elements, read the
// runtime's way (domView over that DOM) and the editor's way (sourceView
// over the template, slotStates over the page).

const loaderPath = "fixtures/actual-starter/components/components.js";
const loader = readFileSync(loaderPath, "utf8");

/** A function's source in the loader, from `function name(` to its closing brace at the line start. */
function functionSource(source: string, name: string) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `no ${name} in ${loaderPath}`);
  return source.slice(start, source.indexOf("\n}\n", start) + 2);
}
const isContentSource = /^const isContent = .*$/m.exec(loader)?.[0];
assert.ok(isContentSource, `no isContent in ${loaderPath}`);

type Loader = { hideEmpty: (root: Fake, section: boolean) => void; isSection: (fragment: Fake) => boolean };
const loaderFrom = (hideEmpty: string): Loader =>
  new Function(`${isContentSource}\n${hideEmpty}\n${functionSource(loader, "isSection")}\nreturn { hideEmpty, isSection };`)() as Loader;
const site = loaderFrom(functionSource(loader, "hideEmpty"));

// ---- A shadow DOM as small as hideEmpty needs ----

class Fake implements DomLikeNode {
  childNodes: Fake[] = [];
  parentElement: Fake | null = null;
  attributes = new Map<string, string>();
  assigned: Fake[] = [];
  host?: Fake;
  constructor(readonly nodeType: number, readonly localName?: string, readonly data?: string, readonly source?: SourceNode) {}
  get textContent(): string {
    return this.nodeType === 3 ? this.data ?? "" : this.childNodes.map((node) => node.textContent).join("");
  }
  querySelectorAll(selector: "*" | "slot"): Fake[] {
    return this.childNodes.flatMap((node) => node.nodeType !== 1 ? [] : [...(selector === "*" || node.localName === selector ? [node] : []), ...node.querySelectorAll(selector)]);
  }
  assignedNodes(options?: { flatten?: boolean }): Fake[] {
    return options?.flatten && !this.assigned.length ? this.childNodes : this.assigned;
  }
  toggleAttribute(name: string, force: boolean) {
    if (force) this.attributes.set(name, "");
    else this.attributes.delete(name);
  }
}

/** The DOM of `nodes` parsed from `html` (a template's content has none, as in the browser). */
function build(html: string, nodes: readonly SourceNode[], parent: Fake | null): Fake[] {
  const view = sourceView(html);
  return nodes.map((node) => {
    const fake = node.type === "text" ? new Fake(3, undefined, view.text(node), node) : new Fake(1, node.name, undefined, node);
    fake.parentElement = parent;
    if (node.type === "element") {
      for (const name of ["name", "slot"]) {
        const value = startTagAttribute(html, node.tag, name)?.value;
        if (value !== undefined) fake.attributes.set(name, decodeEntities(value));
      }
      fake.childNodes = build(html, view.children(node), fake);
    }
    return fake;
  });
}

/** A rendered instance: the page's `<tag>…</tag>` as its host, the template in its shadow root, slots assigned. */
function render(template: string, page: string) {
  const root = new Fake(11);
  const tree = parseSource(template);
  root.childNodes = build(template, tree, null);
  const pageTree = parseSource(page);
  const hostSource = pageTree[0] as SourceElement;
  const host = new Fake(1, hostSource.name);
  host.childNodes = build(page, hostSource.children, host);
  root.host = host;
  const slots = root.querySelectorAll("slot");
  for (const node of host.childNodes) {
    if (node.nodeType !== 1 && node.nodeType !== 3) continue;
    const name = node.nodeType === 1 ? node.attributes.get("slot") ?? "" : "";
    slots.find((slot) => (slot.attributes.get("name") ?? "") === name)?.assigned.push(node);
  }
  return { root, host, tree, hostSource };
}

const dom = domView<Fake>(() => false);
const filledInDom = (slot: Fake) => slot.assignedNodes().length > 0 && slot.assignedNodes({ flatten: true }).some((node) => isContent(node, dom));

/** The template elements each reading marks empty, by their place in the template's source. */
function readings(template: string, page: string, hideEmpty = site.hideEmpty) {
  const { root, host, tree, hostSource } = render(template, page);
  const section = site.isSection(root);
  assert.equal(isSectionTemplate(template), section, "the editor reads a section component as the loader does");
  hideEmpty(root, section);
  const elements = root.querySelectorAll("*");
  const where = (el: Fake) => `<${el.localName}> at ${el.source!.start}`;
  const loaderMarks = elements.filter((el) => el.attributes.has("data-empty")).map(where);

  const hostHasContent = host.childNodes.some((node) => isContent(node, dom));
  const runtime = emptyParts(dom, { section, hostHasContent, filled: filledInDom });
  const runtimeMarks = elements.filter(runtime.empty).map(where);

  // The editor's reading: what the page fills, by slot name, goes to the first slot of that name.
  const instance = readInstance(page, { tag: hostSource.tag, start: hostSource.start, end: hostSource.end, close: hostSource.close });
  const view = sourceView(template);
  const firstSlots = new Map<string, SourceNode>();
  for (const el of elements) if (el.localName === "slot" && !firstSlots.has(el.attributes.get("name") ?? "")) firstSlots.set(el.attributes.get("name") ?? "", el.source!);
  const nameOf = (slot: SourceNode) => elements.find((el) => el.source === slot)?.attributes.get("name") ?? "";
  const editor = emptyParts(view, {
    section: isSectionTemplate(template),
    hostHasContent: instance.children.length > 0,
    filled: (slot) => firstSlots.get(nameOf(slot)) === slot && instance.fills.has(nameOf(slot)),
  });
  const editorMarks = elements.filter((el) => editor.empty(el.source!)).map(where);

  // What the properties list says each slot shows: the loader's first slot of the name, unless it or an element round it is hidden.
  const loaderShown = new Map<string, boolean>();
  for (const [name, slot] of firstSlots) {
    const fake = elements.find((el) => el.source === slot)!;
    let hidden = false;
    for (let at: Fake | null = fake; at; at = at.parentElement) hidden ||= at.attributes.has("data-empty");
    const shows = filledInDom(fake) || fake.childNodes.some((node) => isContent(node, dom));
    loaderShown.set(name, !hidden && shows);
  }
  const editorShown = new Map([...slotStates(template, instance)].map(([name, state]) => [name, state.shown]));
  return { loaderMarks, runtimeMarks, editorMarks, loaderShown, editorShown, tree };
}

// ---- Every fixture component, bare and filled ----

const fixtureComponents = ["fixtures/native-starter/components", "fixtures/actual-starter/components"].flatMap((folder) =>
  readdirSync(folder, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => ({
    tag: entry.name,
    template: readFileSync(`${folder}/${entry.name}/${entry.name}.html`, "utf8"),
    folder,
  })));

/** Pages that use `tag`: bare, each slot filled alone, all filled, white space only, and content for no slot. */
function pagesFor(tag: string, template: string) {
  const names = [...new Set(parseSource(template).flatMap(function slots(node): string[] {
    if (node.type !== "element") return [];
    const own = node.name === "slot" ? [decodeEntities(startTagAttribute(template, node.tag, "name")?.value ?? "")] : [];
    return [...own, ...node.children.flatMap(slots)];
  }))];
  const fill = (name: string) => (name ? `<span slot="${name}">Ours</span>` : "Ours");
  return [
    `<${tag}></${tag}>`,
    ...names.map((name) => `<${tag}>\n  ${fill(name)}\n</${tag}>`),
    `<${tag}>${names.map(fill).join("\n  ")}</${tag}>`,
    `<${tag}>\n  \n</${tag}>`,
    `<${tag}><span slot="no-such-slot">Ours</span></${tag}>`,
    ...names.filter(Boolean).map((name) => `<${tag}><span slot="${name}"> </span></${tag}>`),
  ];
}

const cases = fixtureComponents.flatMap(({ tag, template, folder }) => pagesFor(tag, template).map((page) => ({ tag, folder, template, page })));

test("every fixture component has parity cases", () => {
  assert.ok(fixtureComponents.length >= 10);
  assert.ok(cases.length > fixtureComponents.length * 2);
});

test("the rule hides what the site's loader hides, on every fixture component", () => {
  for (const { folder, tag, template, page } of cases) {
    const result = readings(template, page);
    const label = `${folder}/${tag} with ${JSON.stringify(page)}`;
    assert.deepEqual(result.runtimeMarks, result.loaderMarks, `runtime: ${label}`);
    assert.deepEqual(result.editorMarks, result.loaderMarks, `editor rule: ${label}`);
    assert.deepEqual(result.editorShown, result.loaderShown, `slot states: ${label}`);
  }
});

test("the fixtures hide something: section slots and empty wrappers", () => {
  const marked = cases.filter(({ template, page }) => readings(template, page).loaderMarks.length > 0);
  assert.ok(marked.some(({ tag }) => tag.startsWith("section-")), "a filled section hides its unfilled slots");
  assert.ok(marked.some(({ tag }) => tag === "project-card"), "an empty actions wrapper hides");
});

test("a changed copy of the loader's rule fails the parity cases", () => {
  const original = functionSource(loader, "hideEmpty");
  const changes = [
    // Unfilled slots hide in every component, not just sections.
    original.replace("Boolean(section) &&", ""),
    // A bare tag hides its unfilled slots too.
    original.replace("[...root.host.childNodes].some(isContent) &&", ""),
    // A wrapper hides even when one of its slots shows its fallback.
    original.replace("![...inner].some(showsSomething)", "![...inner].some(filled)"),
  ];
  for (const changed of changes) {
    assert.notEqual(changed, original, "the change applies");
    const copy = loaderFrom(changed);
    const drifted = cases.some(({ template, page }) => {
      const result = readings(template, page, copy.hideEmpty);
      return JSON.stringify(result.runtimeMarks) !== JSON.stringify(result.loaderMarks);
    });
    assert.ok(drifted, `the parity cases catch: ${changed.slice(0, 80)}…`);
  }
});

// ---- The rule's own cases ----

test("a later slot of a taken name is never filled: it hides in a filled section", () => {
  const template = `<section><slot name="a"><p>First</p></slot><div><slot name="a"><p>Again</p></slot></div></section>`;
  const result = readings(template, `<x-s><b slot="a">Ours</b></x-s>`);
  assert.deepEqual(result.loaderMarks, ["<div> at 43", "<slot> at 48"]);
  assert.deepEqual(result.runtimeMarks, result.loaderMarks);
  assert.deepEqual(result.editorMarks, result.loaderMarks);
});

test("blank text is the loader's: U+00A0 is blank, so a wrapper holding only it hides", () => {
  const template = `<p class="actions">&nbsp;<slot name="link"></slot></p>`;
  const result = readings(template, `<x-c></x-c>`);
  assert.deepEqual(result.loaderMarks, ["<p> at 0"]);
  assert.deepEqual(result.runtimeMarks, result.loaderMarks);
  assert.deepEqual(result.editorMarks, result.loaderMarks);
});

test("an element's own text keeps it, and styles and links are never parts", () => {
  const template = `<p>Call <slot name="phone"></slot></p><div><style>p{}</style><link rel="stylesheet" href="/x.css"><slot name="y"></slot></div>`;
  const result = readings(template, `<x-c></x-c>`);
  // <div>'s style text is its own text, as the loader reads it.
  assert.deepEqual(result.loaderMarks, []);
  assert.deepEqual(result.runtimeMarks, []);
  assert.deepEqual(result.editorMarks, []);
});
