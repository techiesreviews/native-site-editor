// Setup in the Inbox (src/inbox/inbox-setup.ts): Name your site's form keeps what was typed and why a save was
// refused, but only for the site it was opened on; a save that ends after a switch to another site changes nothing.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { signal } from "@preact/signals-core";
import type { SetupRow } from "../src/setup-checklist.ts";

// Just enough DOM for the setup rows: elements with children, attributes, a dataset and listeners.
class FakeElement {
  children: FakeElement[] = [];
  attributes = new Map<string, string>();
  listeners = new Map<string, (event?: unknown) => unknown>();
  dataset: Record<string, string> = {};
  className = ""; textContent = ""; id = ""; type = ""; value = ""; htmlFor = ""; autocomplete = ""; noValidate = false;
  content = { firstElementChild: this };
  set innerHTML(_markup: string) { /* An icon: drawn as itself. */ }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  removeAttribute(name: string) { this.attributes.delete(name); }
  append(...children: FakeElement[]) { this.children.push(...children); }
  addEventListener(type: string, listener: (event?: unknown) => unknown) { this.listeners.set(type, listener); }
  all(): FakeElement[] { return this.children.flatMap(child => [child, ...child.all()]); }
}
const saved = Object.getOwnPropertyDescriptor(globalThis, "document");
Object.assign(globalThis, { document: { createElement: () => new FakeElement(), querySelector: () => null } });
after(() => {
  if (saved) Object.defineProperty(globalThis, "document", saved);
  else Reflect.deleteProperty(globalThis, "document");
});
// src/ui/dom.ts draws icons: their stylesheet and SVG imports load as empty modules here.
registerHooks({ load: (url, context, next) => (/\.css$|\?raw$/.test(url) ? { format: "module", source: "export default '';", shortCircuit: true } : next(url, context)) });
const { createInboxSetup } = await import("../src/inbox/inbox-setup.ts");

const flush = () => new Promise<void>(resolve => setImmediate(resolve));
// The one place a fake element stands in for the DOM's.
// eslint-disable-next-line no-restricted-syntax -- FakeElement implements only the members the setup rows touch.
const fake = (element: HTMLElement) => element as unknown as FakeElement;

function fixture() {
  let site = "lex/bakery/main", answer!: (problem: string | undefined) => void;
  const errors: unknown[] = [];
  const setup = {
    items: signal<readonly SetupRow[]>(["name"]),
    siteName: () => site.split("/")[1],
    saveName: () => new Promise<string | undefined>(resolve => { answer = resolve; }),
    connectAgent: async () => {},
    scope: () => site,
  };
  let drawn: FakeElement[] = [];
  const view = createInboxSetup(setup, { hide() {}, redraw() { drawn = view.rows().map(fake); }, error(error) { errors.push(error); } });
  const redraw = () => { drawn = view.rows().map(fake); };
  const find = (match: (element: FakeElement) => boolean) => drawn.flatMap(row => row.all()).find(match);
  return {
    errors, redraw,
    switchTo(next: string) { site = next; },
    answer: (problem: string | undefined) => answer(problem),
    toggle: () => find(element => element.dataset.act === "go")!.listeners.get("click")!(),
    input: () => find(element => element.dataset.act === "name"),
    save: () => find(element => element.dataset.act === "save"),
    refused: () => find(element => element.className === "inbox__refused")?.textContent,
    type(text: string) { const input = this.input()!; input.value = text; input.listeners.get("input")!(); },
    submit: () => find(element => element.className === "inbox__form")!.listeners.get("submit")!({ preventDefault() {} }),
  };
}

test("a refused name keeps the form open with what was typed, Save name ready again, and the reason under it", async () => {
  const f = fixture();
  f.redraw();
  f.toggle();
  f.type("Bakery");
  f.submit();
  assert.equal(f.save()!.textContent, "Saving…");
  f.answer("That name is too long.");
  await flush();
  assert.equal(f.input()!.value, "Bakery");
  assert.equal(f.save()!.textContent, "Save name");
  assert.equal(f.save()!.getAttribute("aria-busy"), null);
  assert.equal(f.refused(), "That name is too long.");
  assert.deepEqual(f.errors, []);
});

test("on another site the form starts closed and empty, and a save that ends after the switch changes nothing", async () => {
  const f = fixture();
  f.redraw();
  f.toggle();
  f.type("Typed on bakery");
  f.submit();
  f.switchTo("lex/florist/main");
  f.redraw();
  assert.equal(f.input(), undefined, "the form starts closed on the other site");
  f.answer("The repository changed meanwhile. Try again.");
  await flush();
  f.redraw();
  assert.equal(f.input(), undefined);
  f.toggle();
  assert.equal(f.input()!.value, "florist");
  assert.equal(f.save()!.textContent, "Save name");
  assert.equal(f.refused(), undefined);
});
