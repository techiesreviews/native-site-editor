import { after, test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// src/ui/dom.ts draws icons: their stylesheet and SVG imports load as empty modules here.
registerHooks({ load: (url, context, next) => (/\.css$|\?raw$/.test(url) ? { format: "module", source: "export default '';", shortCircuit: true } : next(url, context)) });
const saved = Object.getOwnPropertyDescriptor(globalThis, "document");
(globalThis as Record<string, unknown>).document = { createElement: (tag: string) => ({ tag, className: "", textContent: "", value: "" }) };
after(() => { if (saved) Object.defineProperty(globalThis, "document", saved); else Reflect.deleteProperty(globalThis, "document"); });
const { options } = await import("../src/ui/select-options.ts");

test("a select's options are replaced by the values given, in order", () => {
  let children: { tag: string; value: string; textContent: string }[] = [{ tag: "option", value: "old", textContent: "Old" }];
  const select = { replaceChildren: (...given: typeof children) => { children = given; } };
  options(select as unknown as HTMLSelectElement, [{ value: "1", label: "o/site" }, { value: "2", label: "o/blog" }]); // eslint-disable-line no-restricted-syntax -- only replaceChildren is used.
  assert.deepEqual(children.map(({ tag, value, textContent }) => [tag, value, textContent]), [["option", "1", "o/site"], ["option", "2", "o/blog"]]);
});
