import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { iconButtonClass, iconButtonMarkup } from "../src/ui/icon-button/icon-button-options.ts";
import { TEXT_BUTTON_SIZES, textButtonClass, textButtonSize } from "../src/ui/text-button/text-button-options.ts";
import { copiesInStyles, homes } from "../scripts/agents/copies.mjs";

// The Icon button and Text button parts (slice 3 of docs/agents/parts-plan.md): made from `.icon-button` and
// `.text-button` in src/style.css, each in its own folder with its whole look on the components layer.

const repo = new URL("..", import.meta.url).pathname;
const read = (path: string) => readFileSync(`${repo}${path}`, "utf8");
const glyph = '<svg class="icon" aria-hidden="true"></svg>';

test("icon button: one part class first, a screen's own classes after it", () => {
  assert.equal(iconButtonClass(), "icon-button");
  assert.equal(iconButtonClass("code-editor__undo"), "icon-button code-editor__undo");
  assert.equal(iconButtonClass("  a  b "), "icon-button a b");
});

test("icon button markup: a plain button named by its label, the label as its tooltip unless turned off", () => {
  assert.equal(
    iconButtonMarkup({ label: "Undo", glyph, className: "code-editor__undo" }),
    `<button type="button" class="icon-button code-editor__undo" aria-label="Undo" title="Undo">${glyph}</button>`,
  );
  assert.equal(
    iconButtonMarkup({ label: "Back", glyph, title: false }),
    `<button type="button" class="icon-button" aria-label="Back">${glyph}</button>`,
  );
  assert.equal(
    iconButtonMarkup({ label: "Changes", glyph, title: "Changes on this branch" }),
    `<button type="button" class="icon-button" aria-label="Changes" title="Changes on this branch">${glyph}</button>`,
  );
  assert.equal(
    iconButtonMarkup({ label: `Remove "a" & <b>`, glyph }),
    `<button type="button" class="icon-button" aria-label="Remove &quot;a&quot; &amp; &lt;b&gt;" title="Remove &quot;a&quot; &amp; &lt;b&gt;">${glyph}</button>`,
    "the label is escaped",
  );
});

test("text button: sizes are the set, anything else is the base size", () => {
  assert.deepEqual([...TEXT_BUTTON_SIZES], ["base", "compact"]);
  for (const size of TEXT_BUTTON_SIZES) assert.equal(textButtonSize(size), size);
  assert.equal(textButtonSize(undefined), "base");
  assert.equal(textButtonSize("huge"), "base");
});

test("text button: one part class, the compact size as a modifier, a screen's own classes after", () => {
  assert.equal(textButtonClass(), "text-button");
  assert.equal(textButtonClass({ className: "media-settings__reset" }), "text-button media-settings__reset");
  assert.equal(textButtonClass({ size: "compact" }), "text-button text-button--compact");
  assert.equal(textButtonClass({ size: "compact", className: "component-panel__text-button" }), "text-button text-button--compact component-panel__text-button");
  assert.equal(textButtonClass({ underlined: true }), "text-button text-button--underlined");
  assert.equal(textButtonClass({ underlined: true, className: "media-detail__suggest" }), "text-button text-button--underlined media-detail__suggest");
});

for (const [name, path, cls] of [
  ["icon button", "src/ui/icon-button/icon-button.css", ".icon-button"],
  ["text button", "src/ui/text-button/text-button.css", ".text-button"],
] as const) {
  test(`${name}: its whole look in its own file on the components layer, loaded by the editor and the board`, () => {
    const css = read(path);
    assert.match(css, /@layer tokens, elements, components;/);
    assert.match(css, new RegExp(`@layer components \\{\\s*\\${cls} \\{`), "the look sits inside the components layer");
    assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/, "hover waits for a mouse; touch gets the press");
    assert.ok(homes.buttonLooks.includes(path), "the part's file is its look's home in the copy count");
    const file = path.slice("src/".length);
    assert.match(read("src/ui/parts.css"), new RegExp(`^@import "\\./${path.slice("src/ui/".length)}";$`, "m"), "the editor loads it through src/ui/parts.css");
    assert.match(read("src/catalogue/main.ts"), new RegExp(`^import "\\.\\./${file}";$`, "m"), "the design board loads it");
  });
}

test("each part's look comes from its own defaults, and the compact size changes only those", () => {
  const icon = read("src/ui/icon-button/icon-button.css"), text = read("src/ui/text-button/text-button.css");
  for (const hook of ["size", "radius", "background", "text-color", "hover-background", "hover-text-color"]) {
    assert.match(icon, new RegExp(`--icon-btn-${hook}:`), `--icon-btn-${hook} has a default`);
    assert.match(icon, new RegExp(`var\\(--icon-btn-${hook}\\)`), `--icon-btn-${hook} is used`);
  }
  assert.match(icon, /var\(--icon-btn-pressed-background, var\(--pressed\)\)/, "the pressed state has a hook of its own");
  const compact = /\.text-button--compact \{([^}]*)\}/.exec(text)?.[1] ?? "";
  const declared = [...compact.matchAll(/^\s*([\w-]+)\s*:/gm)].map((match) => match[1]);
  assert.ok(declared.length > 0);
  assert.deepEqual(declared.filter((name) => !name.startsWith("--text-btn-")), [], "compact sets only the part's hooks");
  for (const name of declared) assert.match(text, new RegExp(`var\\(${name}\\)`), `${name} is used`);
});

test("a disabled text button neither underlines nor fills on hover or press, as a disabled icon button", () => {
  const text = read("src/ui/text-button/text-button.css");
  assert.match(text, /&:active:not\(:disabled\) \{/);
  assert.match(text, /&:hover:not\(:disabled\) \{/);
  assert.doesNotMatch(text, /&:(active|hover) \{/);
});

test("the underlined text button changes only the part's hooks, and its words stay underlined at rest", () => {
  const text = read("src/ui/text-button/text-button.css");
  assert.match(text, /--text-btn-decoration: none;/, "the base size is not underlined at rest");
  assert.match(text, /text-decoration: var\(--text-btn-decoration\);/);
  const underlined = /\.text-button--underlined \{([^}]*)\}/.exec(text)?.[1] ?? "";
  const declared = [...underlined.matchAll(/^\s*([\w-]+)\s*:/gm)].map((match) => match[1]);
  assert.deepEqual(declared, ["--text-btn-decoration"]);
  assert.match(underlined, /--text-btn-decoration: underline;/);
});

test("Media's Download original and suggested name use the underlined text button and give it no look of their own", () => {
  const css = read("src/page-builder/media-detail.css");
  for (const cls of ["media-detail__original", "media-detail__suggest"]) {
    const rules = [...css.matchAll(new RegExp(`[^}]*\\.${cls}\\b[^{]*\\{([^}]*)\\}`, "g"))].map((match) => match[1]).join(";");
    assert.ok(rules.length > 0, `${cls} still places itself`);
    assert.doesNotMatch(rules, /(^|[;\s])(border|background|color|text-decoration)\s*:/, `${cls} gives the button no border, background, colour or underline`);
  }
  const ts = read("src/page-builder/media-library-details.ts");
  for (const cls of ["media-detail__original", "media-detail__suggest"])
    assert.match(ts, new RegExp(`\\{(?=[^}]*\\bunderlined: true\\b)[^}]*className: "${cls}"[^}]*\\}`), `${cls} asks for the underlined Text button`);
});

test("the old copies are gone: no screen styles the icon button's or the text button's look", () => {
  const looks = copiesInStyles(read("src/style.css")).filter(({ kind }) => kind === "buttonLooks").map(({ text }) => text);
  assert.ok(!looks.some((text) => /\.(icon|text)-button\b/.test(text)), looks.join("\n"));
  for (const [path, cls] of [["src/components/flyout.css", "flyout__icon-button"], ["src/page-builder/components.css", "component-panel__"], ["src/components/repository-menu.css", "repository-menu__heading-button"]])
    assert.deepEqual(copiesInStyles(read(path)).filter(({ text }) => text.includes(cls)), [], `${path} sizes its icon and text buttons but gives them no look`);
});

test("the top bar sizes only its own icon buttons, never those in the menus that open inside it", () => {
  const css = read("src/style.css");
  assert.doesNotMatch(css, /\.topbar \.icon-button\b/, "the project menu opens inside .topbar, so this would grow its Reload and Refresh buttons");
  assert.equal([...css.matchAll(/^\s*\.topbar-actions \.icon-button \{/gm)].length, 2, "the bar's own size, and its phone size");
});

test("the editor loads the button parts' files in one line, in their order, after its own base styles", () => {
  const main = read("src/main.ts");
  assert.match(main, /^import "\.\/theme\.css";\nimport "\.\/ui\/parts\.css";$/m);
  assert.doesNotMatch(main, /icon-button\.css|text-button\.css|parts\/button\.css/, "only through src/ui/parts.css");
  const imports = [...read("src/ui/parts.css").matchAll(/^@import "([^"]+)";$/gm)].map((match) => match[1]);
  assert.deepEqual(imports, ["./parts/button.css", "./icon-button/icon-button.css", "./text-button/text-button.css"]);
});

test("Page structure's icon actions are Icon buttons; its own CSS sizes them and keeps a look only for the Show toggle and Open", () => {
  const ts = read("src/components/page-structure.ts");
  assert.match(ts, /iconButton\(label, mark\(icon, 14\), \{ action, className: "page-structure__action" \}\)/);
  assert.match(ts, /const more = iconButton\(`Actions for /);
  const css = read("src/components/page-structure.css");
  const base = /^\.page-structure__action \{([^}]*)\}/m.exec(css)?.[1] ?? "";
  assert.ok(base.length > 0);
  assert.doesNotMatch(base, /(^|[;\s])(border|border-radius|background|color)\s*:/, "the shared rule only places and sizes");
  for (const rule of css.matchAll(/^([^{}\n]*\.page-structure__action\b[^{}\n]*)\{([^}]*)\}/gm))
    if (/(^|[;\s])(background|color|border-radius)\s*:/.test(rule[2]))
      assert.match(rule[1], /:where\(:not\(\.icon-button\)\)|--open|slot-toggle/, `${rule[1].trim()} gives the Icon button no look`);
});

test("the Files tree and History build their icon and text buttons from the parts and give them no look", () => {
  const files = read("src/controllers/files-tree-controller.ts");
  assert.match(files, /node\("button", iconButtonClass\("file-add"\)\)/);
  assert.match(files, /textButtonClass\(\{ size: "compact", className: "file-restore" \}\)/);
  assert.match(read("src/components/file-row-actions.ts"), /const more = iconButton\(`Actions for \$\{target\.path\}`/);
  const history = read("src/components/commit-history.ts");
  assert.match(history, /const reload = iconButton\("Refresh history"/);
  assert.match(history, /const actions = iconButton\(`Actions for /);
  for (const [path, classes] of [
    ["src/components/file-row-actions.css", ["file-more", "file-restore"]],
    ["src/components/create-dialog.css", ["file-add"]],
    ["src/components/commit-history.css", ["commit-history__refresh", "commit-history__more"]],
  ] as const) {
    const css = read(path);
    for (const cls of classes) {
      const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(new RegExp(`[^{}]*\\.${cls}\\b[^{}]*\\{([^}]*)\\}`, "g"))].map((match) => match[1]).join(";");
      assert.ok(rules.length > 0, `${cls} is still placed and sized`);
      assert.doesNotMatch(rules, /(^|[;\s])(border|border-radius|background|color|font-size|font-weight)\s*:/, `${path}: ${cls} gives the part no look`);
    }
  }
  assert.match(read("src/components/commit-history.css"), /\.commit-history__more\[aria-expanded="true"\] \{\s*--icon-btn-background: var\(--hover\);\s*--icon-btn-text-color: var\(--text\);\s*\}/, "an open menu keeps its fill through the part's hooks");
});

test("a hidden slot's eye stays muted on hover: the Page structure guard adds no weight", () => {
  const css = read("src/components/page-structure.css");
  assert.doesNotMatch(css, /\.page-structure__action:not\(\.icon-button\)/);
  assert.equal([...css.matchAll(/\.page-structure__action:where\(:not\(\.icon-button\)\)/g)].length, 3);
});

test("the icon button's code makes its button element: it is the part's home in the copy count", () => {
  assert.ok(homes.buttons.includes("src/ui/icon-button/icon-button.ts"));
});

test("the parts list names both parts with their files", () => {
  const parts = JSON.parse(read("docs/agents/parts.json")).parts as { id: string; group: string; files: string[] }[];
  const iconButton = parts.find((part) => part.id === "icon-button");
  const textButton = parts.find((part) => part.id === "text-button");
  assert.deepEqual(iconButton?.files, ["src/ui/icon-button/icon-button.ts", "src/ui/icon-button/icon-button-options.ts", "src/ui/icon-button/icon-button.css"]);
  assert.deepEqual(textButton?.files, ["src/ui/text-button/text-button.ts", "src/ui/text-button/text-button-options.ts", "src/ui/text-button/text-button.css"]);
  assert.equal(iconButton?.group, "part");
  assert.equal(textButton?.group, "part");
});
