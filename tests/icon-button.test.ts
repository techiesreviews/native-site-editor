import { after, test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// The elements iconButton() and textButton() build (src/ui/icon-button/, src/ui/text-button/), on a fake document as
// in tests/select-options.test.ts: the label, the tooltip, the glyph and the action each part wires itself.
registerHooks({ load: (url, context, next) => (/\.css$|\?raw$/.test(url) ? { format: "module", source: "export default '';", shortCircuit: true } : next(url, context)) });

class FakeElement {
  type = ""; className = ""; textContent = ""; title = "";
  readonly attributes = new Map<string, string>();
  readonly children: unknown[] = [];
  readonly clicks: ((event?: unknown) => unknown)[] = [];
  constructor(readonly tag: string) {}
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  append(...children: unknown[]) { this.children.push(...children); }
  addEventListener(name: string, listener: (event?: unknown) => unknown) { if (name === "click") this.clicks.push(listener); }
}
const saved = Object.getOwnPropertyDescriptor(globalThis, "document");
(globalThis as Record<string, unknown>).document = { createElement: (tag: string) => new FakeElement(tag) };
after(() => { if (saved) Object.defineProperty(globalThis, "document", saved); else Reflect.deleteProperty(globalThis, "document"); });
const { iconButton } = await import("../src/ui/icon-button/icon-button.ts");
const { textButton } = await import("../src/ui/text-button/text-button.ts");
const { setErrorReporter } = await import("../src/ui/report-failure.ts");
// eslint-disable-next-line no-restricted-syntax -- the parts return the fake document's elements, typed as the real ones.
const fake = (element: HTMLElement) => element as unknown as FakeElement;

test("an icon button without a tooltip or a glyph yet: a plain button named by its label, with nothing inside", () => {
  let pressed = 0;
  const button = fake(iconButton("Actions for c1", null, { title: false, action: () => { pressed++; } }));
  assert.equal(button.tag, "button");
  assert.equal(button.type, "button");
  assert.equal(button.className, "icon-button");
  assert.equal(button.attributes.get("aria-label"), "Actions for c1");
  assert.equal(button.title, "");
  assert.deepEqual(button.children, []);
  assert.equal(button.clicks.length, 1);
  button.clicks[0]();
  assert.equal(pressed, 1);
});

test("an icon button keeps its label and a tooltip of its own, holds its glyph, and wires no click without an action", () => {
  const glyph = { glyph: true };
  // eslint-disable-next-line no-restricted-syntax -- the part only appends its glyph, so any object stands in for a Node.
  const button = fake(iconButton("Actions for a.md", glyph as unknown as Node, { title: "Rename, duplicate, delete…", className: "file-more" }));
  assert.equal(button.className, "icon-button file-more");
  assert.equal(button.attributes.get("aria-label"), "Actions for a.md");
  assert.equal(button.title, "Rename, duplicate, delete…");
  assert.deepEqual(button.children, [glyph]);
  assert.equal(button.clicks.length, 0);
  assert.equal(fake(iconButton("Refresh history", null)).title, "Refresh history", "the label is the tooltip unless told otherwise");
});

test("an icon button's action that fails reaches the error reporter", async () => {
  const reported: unknown[] = [];
  setErrorReporter((error) => { reported.push(error); });
  const failure = new Error("offline");
  const button = fake(iconButton("Refresh history", null, { action: async () => { throw failure; } }));
  await button.clicks[0]();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(reported, [failure]);
});

test("a text button reads its words, takes the part's classes, and runs its action on a click", () => {
  let pressed = 0;
  const button = fake(textButton("Restore", () => { pressed++; }, { size: "compact", underlined: true, className: "file-restore" }));
  assert.equal(button.tag, "button");
  assert.equal(button.className, "text-button text-button--compact text-button--underlined file-restore");
  assert.equal(button.textContent, "Restore");
  for (const click of button.clicks) click();
  assert.equal(pressed, 1);
});
