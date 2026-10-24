import type { TestContext } from "node:test";
import { readSource, type SourceNode } from "../../src/page-builder/source-tree.ts";

/**
 * Just enough `document` for pageOutline (src/agent-site.ts) in Node: a template whose content is the
 * source adapter's element tree. For balanced fixtures without browser repairs, headings or slots.
 */
export function installOutlineDocument(t: TestContext) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "document", original);
    else Reflect.deleteProperty(globalThis, "document");
  });
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    createElement: () => {
      let content: unknown;
      return {
        set innerHTML(markup: string) {
          const tree = readSource(markup);
          class OutlineElement {
            children: OutlineElement[];
            constructor(readonly node?: SourceNode, readonly parentElement: OutlineElement | null = null) {
              this.children = tree.children(node).map(child => new OutlineElement(child, node ? this : null));
            }
            get localName() { return this.node?.type === "element" ? this.node.name : ""; }
            get textContent() { return tree.text(this.node); }
            getAttribute(name: string) { return this.node ? tree.attribute(this.node, name)?.value ?? null : null; }
            matches() { return false; }
            querySelectorAll(selector: string): OutlineElement[] {
              const all = this.children.flatMap(child => [child, ...child.querySelectorAll("*")]);
              return selector === "*" ? all : all.filter(child => child.localName === selector);
            }
            querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
          }
          content = new OutlineElement();
        },
        get content() { return content; },
      };
    },
  } });
}
