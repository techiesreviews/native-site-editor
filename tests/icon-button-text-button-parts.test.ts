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
    assert.match(read("src/main.ts"), new RegExp(`^import "\\./${file}";$`, "m"), "the editor loads it");
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
