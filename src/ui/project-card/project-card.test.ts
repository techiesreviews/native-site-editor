import { after, test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({ load: (url, context, next) => /\.css$|\?raw$/.test(url)
  ? { format: "module", source: "export default '';", shortCircuit: true } : next(url, context) });
class Element {
  className = ""; textContent = ""; type = ""; title = "";
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  children: Element[] = [];
  listeners: (() => void)[] = [];
  constructor(readonly tag: string) {}
  get content() { return { firstElementChild: new Element("svg") }; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  append(...children: Element[]) { this.children.push(...children); }
  addEventListener(name: string, listener: () => void) { if (name === "click") this.listeners.push(listener); }
}
const saved = Object.getOwnPropertyDescriptor(globalThis, "document");
Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: (tag: string) => new Element(tag) } });
after(() => { if (saved) Object.defineProperty(globalThis, "document", saved); else Reflect.deleteProperty(globalThis, "document"); });
const { projectCard } = await import("./project-card.ts");
// eslint-disable-next-line no-restricted-syntax -- the renderer receives the partial document above.
const fake = (element: HTMLElement) => element as unknown as Element;
const all = (element: Element): Element[] => [element, ...element.children.flatMap(all)];

test("every project card has separate open and options actions with a closed, named menu", () => {
  const project = { repo: { id: 1, name: "<img onerror=alert(1)>", full_name: "lex/site", default_branch: "main", private: true,
    owner: { login: "lex", type: "User" } }, branch: "draft", opened: 1 };
  for (const mode of ["featured", "row", "grid"] as const) {
    let opened = 0, menuAnchor: HTMLElement | undefined;
    const card = fake(projectCard(project, { mode, unsaved: false, open: () => { opened++; }, more: anchor => { menuAnchor = anchor; } }));
    const buttons = all(card).filter(element => element.tag === "button");
    const more = buttons.find(element => element.attributes.has("aria-haspopup"))!;
    assert.equal(more.attributes.get("aria-expanded"), "false");
    assert.equal(more.attributes.get("aria-label"), `Options for ${project.repo.name}`);
    more.listeners[0]();
    assert.equal(opened, 0, "opening the options must not open the project");
    assert.equal(fake(menuAnchor!), more);
    buttons.find(element => element.dataset.open === "1")!.listeners[0]();
    assert.equal(opened, 1);
    assert.ok(all(card).some(element => element.textContent === project.repo.name), "repository names remain literal text");
  }
});
