import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";

// A minimal DOM port exercises the real copy action and image-choice values without a browser.
async function controls(file: string, symbol: string) {
  const result = await build({ entryPoints: [file], bundle: true, write: false, format: "esm", platform: "node", loader: { ".css": "empty", ".svg": "text" },
    plugins: [{ name: "controls-dom", setup(plugin) {
      plugin.onLoad({ filter: /(?:media-library-details|site-settings)\.ts$/ }, args => ({ contents: readFileSync(args.path, "utf8") + `\nexport { ${symbol} };`, loader: "ts" }));
      plugin.onResolve({ filter: /\/ui\/dom$/ }, () => ({ path: "dom", namespace: "test" }));
      plugin.onResolve({ filter: /\/icons$/ }, () => ({ path: "icons", namespace: "test" }));
      plugin.onLoad({ filter: /^icons$/, namespace: "test" }, () => ({ contents: "export const icon = () => ({}); export const setIcon = () => {};" }));
      plugin.onLoad({ filter: /^dom$/, namespace: "test" }, () => ({ contents: `
        class Element {
          children = []; dataset = {}; classList = { add() {} };
          append(...children) { this.children.push(...children); }
          querySelector() { return undefined; }
          addEventListener() {}
          setAttribute(name, value) { this[name] = value; }
        }
        export const node = (tag, className) => Object.assign(new Element(), { className });
        export const button = (label, click) => Object.assign(new Element(), { label, click });
      ` }));
    } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text + "\n//# sourceURL=media-address-controls-bundle.mjs").toString("base64")}`);
}

test("media details Copy path copies the encoded site address under the current library prefix", async () => {
  const { fileActions } = await controls("src/page-builder/media-library-details.ts", "fileActions");
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator"), copied: string[] = [];
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async (text: string) => { copied.push(text); } } } });
  try {
    for (const prefix of ["", "/my-site"]) {
      let entries: { label: string; run: () => Promise<void> }[] = [];
      const menu = (_opener: unknown, items: typeof entries) => { entries = items; };
      const actions = fileActions({ library: () => ({ prefix }), task: (work: () => Promise<void>) => work(), tell() {}, done() {}, cache: {}, menu }, "media/a b.webp", { url: "blob:picture" });
      // Copy path leads the file's ⋯ menu, then Download, then Remove… (slices 108, 123).
      actions.children.find((button: Record<string, string>) => button["aria-label"] === "More for this file").click();
      assert.deepEqual(entries.map(entry => entry.label), ["Copy path", "Download", "Remove…"]);
      await entries[0].run();
      assert.equal(copied.at(-1), `${prefix}/media/a%20b.webp`);
    }
  } finally {
    descriptor ? Object.defineProperty(globalThis, "navigator", descriptor) : Reflect.deleteProperty(globalThis, "navigator");
  }
});

test("settings image choices show and submit encoded prefixed addresses", async () => {
  const { addImageChoices } = await controls("src/components/site-settings.ts", "addImageChoices");
  for (const prefix of ["", "/my-site"]) {
    let list: { children: { value: string }[] } | undefined;
    addImageChoices({ setAttribute() {}, parentElement: { append(value: typeof list) { list = value; } } }, ["media/a b.webp"], prefix);
    assert.deepEqual(list?.children.map(choice => choice.value), [`${prefix}/media/a%20b.webp`]);
  }
});
