import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// Get Started and the setup wizard's "Repository name" field, mounted on a small
// DOM stand-in: Node has no DOM. Stylesheet and raw SVG imports load as empty
// modules (resolve covers older Node; load covers Node 24, where the ?raw
// suffix can reach us already resolved). The onboarding media folder's Vite
// import.meta.glob finds no files here, as in a build without the recording.
register("data:text/javascript," + encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    if (specifier.endsWith(".css") || specifier.includes("?raw")) return { url: "data:text/javascript,export default ''", shortCircuit: true };
    return next(specifier, context);
  }
  export async function load(url, context, next) {
    if (/\\.(css|svg)(\\?|$)/.test(url)) return { format: "module", source: "export default ''", shortCircuit: true };
    const loaded = await next(url, context);
    if (url.includes("/onboarding-media/index.ts")) return { ...loaded, source: String(loaded.source).replace(/import\\.meta\\.glob\\([^)]*\\)/, "({})") };
    return loaded;
  }`));

class FakeEvent {
  defaultPrevented = false; target: FakeElement | undefined;
  constructor(public type: string) {}
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() {}
}
class FakeNode {
  parentElement: FakeElement | null = null;
  childNodes: FakeNode[] = [];
  data = "";
  get textContent(): string { return this.data + this.childNodes.map((child) => child.textContent).join(""); }
  set textContent(text: string) { this.childNodes = []; this.data = text; }
}
class FakeElement extends FakeNode {
  [key: string]: any;
  className = ""; id = ""; hidden = false; disabled = false; value = ""; checked = false; type = ""; name = "";
  attributes = new Map<string, string>();
  listeners = new Map<string, ((event: FakeEvent) => void)[]>();
  style = { setProperty() {} };
  /** A template's content: icons parse their markup into one <svg>. */
  get content() { return { firstElementChild: new FakeElement("svg") }; }
  constructor(public localName: string) { super(); }
  get children() { return this.childNodes.filter((child): child is FakeElement => child instanceof FakeElement); }
  get isConnected(): boolean { return true; }
  get classList() {
    const names = () => this.className.split(/\s+/).filter(Boolean);
    return {
      add: (...more: string[]) => { this.className = [...new Set([...names(), ...more])].join(" "); },
      remove: (...less: string[]) => { this.className = names().filter((name) => !less.includes(name)).join(" "); },
      contains: (name: string) => names().includes(name),
      toggle: (name: string, force?: boolean) => {
        const on = force ?? !names().includes(name);
        this.className = (on ? [...new Set([...names(), name])] : names().filter((each) => each !== name)).join(" ");
        return on;
      },
    };
  }
  get elements() {
    return { namedItem: (name: string) => {
      const items = this.all().filter((el) => el.name === name);
      return { value: items.find((el) => el.checked)?.value ?? "" };
    } };
  }
  append(...nodes: (FakeNode | string)[]) {
    for (const item of nodes) {
      const child = typeof item === "string" ? Object.assign(new FakeNode(), { data: item }) : item;
      child.parentElement = this;
      this.childNodes.push(child);
    }
  }
  prepend(...nodes: (FakeNode | string)[]) { this.append(...nodes); }
  replaceChildren(...nodes: (FakeNode | string)[]) { this.data = ""; this.childNodes = []; this.append(...nodes); }
  remove() { if (this.parentElement) this.parentElement.childNodes = this.parentElement.childNodes.filter((child) => child !== this); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  removeAttribute(name: string) { this.attributes.delete(name); }
  addEventListener(type: string, listener: (event: FakeEvent) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  removeEventListener() {}
  dispatchEvent(event: FakeEvent) {
    event.target ??= this;
    for (let at: FakeElement | null = this; at; at = at.parentElement) for (const listener of at.listeners.get(event.type) ?? []) listener(event);
    return !event.defaultPrevented;
  }
  focus() { (globalThis as any).document.activeElement = this; }
  all(): FakeElement[] { return this.children.flatMap((child) => [child, ...child.all()]); }
  /** Class selectors only (".name"), which is all these components ask for. */
  querySelector(selector: string) { return this.all().find((el) => el.classList.contains(selector.slice(1))) ?? null; }
  querySelectorAll() { return []; }
}
const fakeGlobals = globalThis as Record<string, unknown>;
fakeGlobals.document = {
  activeElement: null,
  createElement: (name: string) => new FakeElement(name),
  createElementNS: (_: string, name: string) => new FakeElement(name),
  createTextNode: (text: string) => Object.assign(new FakeNode(), { data: text }),
  addEventListener() {}, removeEventListener() {},
};
fakeGlobals.window = { addEventListener() {}, removeEventListener() {} };

const { createGetStarted } = await import("../src/components/get-started.ts");
const { createSetupWizard } = await import("../src/components/setup-wizard.ts");

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function fieldOf(root: FakeElement, hintId: string) {
  const hint = root.all().find((el) => el.id === hintId)!;
  const input = root.all().find((el) => el.localName === "input" && el.name === "name")!;
  const owner = root.all().find((el) => el.localName === "select" && el.name === "owner")!;
  const type = (value: string) => { input.value = value; input.dispatchEvent(new FakeEvent("input")); };
  const commit = () => input.dispatchEvent(new FakeEvent("change"));
  const invalid = () => [input.getAttribute("aria-invalid"), hint.classList.contains("is-error")];
  return { hint, input, owner, type, commit, invalid };
}

test("Get Started: the name field previews the repository, flags bad names and tidies a typed name", async () => {
  const owners = [{ login: "lex", type: "User" }, { login: "techies", type: "Organization" }];
  const root = createGetStarted({
    login: "lex", installUrl: null, editor: "https://editor.example", create: async () => ({ ok: true }) as never, reload: () => {},
    loadOwners: async () => owners as never,
  }).root as unknown as FakeElement;
  const field = fieldOf(root, "repository-name-hint");
  const command = () => root.all().filter((el) => el.localName === "code").map((el) => el.textContent).join(" | ");

  // Initial state: valid default name, described by the hint, personal preview until owners load.
  assert.equal(field.input.getAttribute("aria-describedby"), "repository-name-hint");
  assert.equal(field.hint.className, "onboard-field__hint");
  assert.deepEqual(field.invalid(), ["false", false]);
  assert.match(field.hint.textContent, /^github\.com\/lex\/\S+$/);

  await tick();
  field.owner.value = "techies";
  field.owner.dispatchEvent(new FakeEvent("change"));
  field.type("shop");
  assert.equal(field.hint.textContent, "Creates techies/shop");
  assert.deepEqual(field.invalid(), ["false", false]);
  // The agent prompt follows each keystroke.
  assert.match(command(), /techies\/shop/);

  // An empty name is not shown as an error while typing.
  field.type("   ");
  assert.deepEqual(field.invalid(), ["false", false]);
  assert.equal(field.hint.textContent, "Creates techies/…");

  field.type("bad/name");
  assert.deepEqual(field.invalid(), ["true", true]);
  assert.notEqual(field.hint.textContent, "Creates techies/bad/name");

  field.type("My New Site");
  field.commit();
  assert.equal(field.input.value, "My-New-Site");
  assert.deepEqual(field.invalid(), ["false", false]);
  assert.equal(field.hint.textContent, "Creates techies/My-New-Site");
});

test("Get Started: submitting an empty name flags it and returns focus to the field", () => {
  let created = 0;
  const root = createGetStarted({
    login: "lex", installUrl: null, editor: "https://editor.example", create: async () => { created++; return { ok: true } as never; }, reload: () => {},
  }).root as unknown as FakeElement;
  const field = fieldOf(root, "repository-name-hint");
  field.type("");
  root.all().find((el) => el.localName === "form")!.dispatchEvent(new FakeEvent("submit"));
  assert.equal(created, 0);
  assert.deepEqual(field.invalid(), ["true", true]);
  assert.equal(field.hint.textContent, "Enter a name for the repository.");
  assert.equal((globalThis as any).document.activeElement, field.input);
});

test("setup wizard: the name field remembers what is typed, normalises on change and previews the owner", async () => {
  const remembered: unknown[] = [];
  const root = createSetupWizard({
    login: "lex", connected: true, step: "create", memory: { name: "kept-name" } as never, connectUrl: "/auth/install",
    loadOwners: async () => [{ login: "lex", type: "User" }, { login: "techies", type: "Organization" }] as never,
    create: async () => ({ ok: true }) as never, findRepository: async () => undefined, agentPrompt: () => "",
    remember: (change) => void remembered.push(change), finish: () => {}, exit: () => {},
  }).root as unknown as FakeElement;
  await tick();
  const field = fieldOf(root, "wizard-name-hint");
  assert.equal(field.input.value, "kept-name");
  assert.equal(field.input.getAttribute("aria-describedby"), "wizard-name-hint");
  assert.deepEqual(field.invalid(), ["false", false]);
  assert.equal(field.hint.textContent, "github.com/lex/kept-name");

  field.type("bad/name");
  assert.deepEqual(remembered.at(-1), { name: "bad/name" });
  assert.deepEqual(field.invalid(), ["true", true]);

  field.type("");
  assert.deepEqual(field.invalid(), ["false", false]);
  assert.equal(field.hint.textContent, "github.com/lex/…");

  field.owner.value = "techies";
  field.owner.dispatchEvent(new FakeEvent("change"));
  assert.deepEqual(remembered.at(-1), { owner: "techies" });
  field.type("My New Site");
  field.commit();
  assert.equal(field.input.value, "My-New-Site");
  assert.equal(field.hint.textContent, "github.com/techies/My-New-Site");
  assert.deepEqual(field.invalid(), ["false", false]);
});
