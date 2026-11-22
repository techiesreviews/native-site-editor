import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { PARTS, isPart } from "../src/catalogue/parts.ts";
import { splitSelectors } from "../src/catalogue/tweak.ts";

// The editor's CSS on the Techies Framework layers (docs/wayfinder/atomic-catalogue/css-layers-plan.md): tokens,
// elements, components, then the editor's own unlayered screen CSS. The Button is the first component in a file of
// its own, after the Framework's .btn shape: its look comes from --btn-* custom properties with defaults.

const repo = new URL("..", import.meta.url).pathname;
const read = (path: string) => readFileSync(join(repo, path), "utf8");
const BUTTON = "src/ui/button/button.css";
const ORDER = "@layer tokens, elements, components;";
const COMPONENTS = [
  { id: "button", path: "src/ui/button/button.css", prefix: "btn", board: true, hooks: ["min-block-size", "radius", "padding-block", "padding-inline", "background", "text-color", "font-size", "font-weight"] },
  { id: "icon-button", path: "src/ui/icon-button/icon-button.css", prefix: "icon-btn", board: true, hooks: ["size", "radius", "background", "text-color", "hover-background", "hover-text-color"] },
  { id: "text-button", path: "src/ui/text-button/text-button.css", prefix: "text-btn", board: true, hooks: ["min-block-size", "padding-block", "padding-inline", "radius", "text-color", "font-size", "hover-background"] },
  { id: "badge", path: "src/ui/badge/badge.css", prefix: "badge", board: true, hooks: ["gap", "padding-inline", "radius", "font-size", "font-weight", "background", "text-color"] },
  { id: "key", path: "src/ui/key/key.css", prefix: "key", board: true, hooks: ["padding-inline", "radius", "border-color", "background", "font-size", "font-weight", "gap"] },
  { id: "spinner", path: "src/ui/spinner/spinner.css", prefix: "spinner", board: true, hooks: ["size", "thickness", "track-color", "color", "duration", "overlay-z-index"] },
  { id: "progress", path: "src/ui/progress/progress.css", prefix: "progress", board: true, hooks: ["height", "radius", "track-background", "fill-background", "duration", "slide-duration"] },
  { id: "section-heading", path: "src/ui/section-heading/section-heading.css", prefix: "section-heading", board: true, hooks: ["gap", "end-gap", "text-color", "font-size", "font-weight", "line-height"] },
  { id: "inline-field", path: "src/ui/inline-field/inline-field.css", prefix: "inline-field", board: true, hooks: ["background", "hover-background", "line-color", "focus-line-color", "invalid-line-color", "caret-color", "duration"] },
  { id: "row-menu", path: "src/ui/row-menu/row-menu.css", prefix: "row-menu", board: true, hooks: ["gap", "padding", "radius", "background", "text-color", "font-size", "shadow", "z-index", "hover-background"] },
  { id: "dropdown", path: "src/ui/dropdown/dropdown.css", prefix: "dropdown", board: false, hooks: ["padding", "radius", "background", "text-color", "shadow", "max-height", "offset"] },
  { id: "flyout", path: "src/ui/flyout/flyout.css", prefix: "flyout", board: false, hooks: ["width", "max-height", "padding", "radius", "background", "text-color", "shadow", "font-size", "hover-background"] },
  { id: "share-row", path: "src/ui/share-row/share-row.css", prefix: "share-row", board: true, hooks: ["gap", "radius", "min-block-size", "surface", "hover-background", "muted-color", "action-duration"] },
  { id: "confirm-dialog", path: "src/ui/confirm-dialog/confirm-dialog.css", prefix: "confirm-dialog", board: true, hooks: ["width", "radius", "border-color", "background", "text-color", "shadow", "backdrop", "padding", "gap"] },
] as const;
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** The text inside the block that opens at the first `{` after `from`. */
function block(css: string, from: number): string {
  const open = css.indexOf("{", from);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error("unclosed block");
}

function cssFiles(dir: string): string[] {
  return readdirSync(join(repo, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? cssFiles(join(dir, entry.name)) : entry.name.endsWith(".css") ? [relative(repo, join(repo, dir, entry.name))] : []);
}

test("each component file sets the layers' order, then keeps everything on the components layer", () => {
  for (const { path } of COMPONENTS) {
    const css = withoutComments(read(path)).trim();
    assert.ok(css.startsWith(ORDER), `${path}: the order statement comes first, so the file works wherever it loads`);
    const rest = css.slice(ORDER.length).trim();
    assert.ok(rest.startsWith("@layer components {"), `${path}: one components layer block`);
    assert.equal(rest, `@layer components {${block(rest, 0)}}`, `${path}: nothing outside the components layer`);
  }
});

test("each component's look comes from its --<name>-* defaults, each one used", () => {
  for (const { path, prefix, hooks } of COMPONENTS) {
    const css = withoutComments(read(path));
    for (const name of hooks) {
      const hook = `--${prefix}-${name}`;
      assert.match(css, new RegExp(`var\\(${hook}[,)]`), `${path}: ${hook} is used`);
      assert.ok(
        new RegExp(`${hook}:`).test(css) || new RegExp(`var\\(${hook},\\s*[^)]+\\)`).test(css),
        `${path}: ${hook} has a default`,
      );
    }
  }
  const css = withoutComments(read(BUTTON));
  const button = block(css, css.indexOf(".button {"));
  // Disabled (both :disabled and aria-disabled="true") is plain and has hooks of its own: a screen that sets
  // --btn-background never takes the plain disabled look away, and hover/active ignore both.
  assert.match(button, /&:active:not\(:disabled, \[aria-disabled="true"\]\)/);
  assert.match(button, /&:hover:not\(:disabled, \[aria-disabled="true"\]\)/);
  const disabled = block(button, button.indexOf('&:is(:disabled, [aria-disabled="true"]) {'));
  assert.doesNotMatch(disabled, /--btn-[\w-]+\s*:/, "the disabled state sets no hook");
  assert.match(disabled, /background: var\(--btn-disabled-background, var\(--surface-subtle\)\);/);
  assert.match(disabled, /color: var\(--btn-disabled-text-color, var\(--muted\)\);/);
  // A tone changes only the custom properties, as the Framework's variants do.
  const secondary = block(css, css.indexOf(".secondary {"));
  assert.deepEqual([...secondary.matchAll(/([\w-]+)\s*:/g)].map((match) => match[1]).filter((name) => !name.startsWith("--btn-")), []);
});

test("the two screen copies of the Button's plain disabled look are gone, .text-link lives in text-button.css, and hover stays mouse-only", () => {
  assert.doesNotMatch(withoutComments(read("src/page-builder/media-picker.css")), /\.media-library\s+:is\(\.primary,\s*\.secondary,\s*\.button\):is\(:disabled,\s*\[aria-disabled="true"\]\)/);
  assert.doesNotMatch(withoutComments(read("src/catalogue/board.css")), /\.cat-tweak__actions\s+\.button\[aria-disabled="true"\]/);
  assert.match(withoutComments(read("src/inbox/inbox.css")), /\.inbox__done\.button\[aria-disabled="true"\]\s*\{\s*--btn-disabled-text-color:\s*var\(--success-fg\);\s*\}/);
  const style = withoutComments(read("src/style.css"));
  assert.doesNotMatch(style, /(?:^|})\s*\.text-link(?::(?:hover|active))?\s*\{/m, "no standalone .text-link look left in src/style.css");
  const textButton = withoutComments(read("src/ui/text-button/text-button.css"));
  assert.match(textButton, /\.text-link\s*\{[^}]*color:\s*var\(--text-btn-text-color,\s*var\(--link\)\);/);
  for (const { path } of COMPONENTS) {
    const css = withoutComments(read(path));
    // Every :hover in a component file sits inside @media (hover: hover) and (pointer: fine), never bare.
    const withoutMouseMedia = css.replace(/@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, "");
    assert.doesNotMatch(withoutMouseMedia, /:hover\b/, `${path}: :hover sits inside @media (hover: hover) and (pointer: fine)`);
  }
});

test("no other editor stylesheet holds the Button's own rules", () => {
  // A selector that is only a Button class and its states, alone or in a list. A screen's own rule that places a
  // Button (`.empty-message .button`) is the editor's unlayered CSS and stays where it is.
  const own = /^(?:(?:button)?(?:\.(?:button|primary|secondary))+|:is\((?:\.(?:primary|secondary|button)(?:,\s*)?)+\))(?::[\w-]+(?:\([^()]*\))?)*$/;
  for (const file of cssFiles("src")) {
    if (file === BUTTON) continue;
    for (const match of withoutComments(read(file)).matchAll(/(?:^|[{};])\s*([^{};@]+?)\s*\{/g)) {
      for (const selector of splitSelectors(match[1])) {
        assert.doesNotMatch(selector, own, `${file}: ${selector} is a rule of the Button's own`);
      }
    }
  }
});

test("the live-share guest page colours its Join button itself, as it does not load the Button", () => {
  const guest = read("src/live-guest.ts");
  assert.doesNotMatch(guest, /style\.css|button\.css/);
  const css = withoutComments(read("src/live-guest.css"));
  const submit = block(css, css.indexOf(".live-guest__submit {"));
  assert.match(submit, /background: var\(--primary\);/);
  assert.match(submit, /color: var\(--on-primary\);/);
});

test("the editor's theme tokens sit on the tokens layer, after the layer order statement", () => {
  const css = withoutComments(read("src/theme.css")).trim();
  assert.ok(css.startsWith(ORDER), "src/theme.css sets the layers' order before anything else");
  let rest = css.slice(ORDER.length).trim();
  assert.ok(rest.length > 0, "src/theme.css has token blocks");
  while (rest.length > 0) {
    assert.ok(rest.startsWith("@layer tokens {"), `everything in src/theme.css sits on @layer tokens, found: ${rest.slice(0, 40)}`);
    const body = block(rest, 0);
    rest = rest.slice(`@layer tokens {${body}}`.length).trim();
  }
});

test("the editor's bare element rules and reset sit on the elements layer in src/elements.css, below every component", () => {
  assert.equal(existsSync(join(repo, "src/utilities.css")), false, "src/utilities.css is folded into src/elements.css");
  const elementsFile = withoutComments(read("src/elements.css")).trim();
  assert.ok(elementsFile.startsWith(ORDER), "src/elements.css sets the layers' order before anything else");
  const rest = elementsFile.slice(ORDER.length).trim();
  assert.ok(rest.startsWith("@layer elements {"), "src/elements.css holds one elements layer block");
  const elements = block(rest, 0);
  assert.equal(rest, `@layer elements {${elements}}`, "nothing in src/elements.css sits outside the elements layer");
  assert.match(elements, /\*,\s*\*::before,\s*\*::after\s*\{\s*box-sizing: border-box;/);
  assert.match(elements, /body\s*\{[^}]*margin: 0;/);
  assert.match(elements, /button,\s*a,\s*select\s*\{[^}]*font: inherit;[^}]*color: inherit;/);
  assert.match(elements, /button:disabled:where\(:not\(\.button\)\),\s*select:disabled\s*\{/);
  assert.match(elements, /button:focus-visible,\s*a:focus-visible,\s*select:focus-visible/);
  assert.match(elements, /(?:^|\n)\s*select\s*\{[^}]*height: var\(--size-control\);/);
  // No classes on the elements layer (bare HTML only; :not(.button) is an exclusion on the bare button element).
  for (const match of elements.matchAll(/(?:^|[{};])\s*([^{};@]+?)\s*\{/g)) {
    for (const selector of splitSelectors(match[1])) {
      assert.doesNotMatch(selector.replace(/:where\(:not\(\.button\)\)/g, ""), /\./, `elements layer selector has no classes: ${selector}`);
    }
  }
  const style = withoutComments(read("src/style.css"));
  assert.ok(style.trimStart().startsWith(ORDER), "src/style.css sets the layers' order before anything else");
  assert.match(style, /^@import "\.\/elements\.css";$/m, "src/style.css imports src/elements.css");
  assert.doesNotMatch(style, /@layer elements\b/, "bare element rules moved out of src/style.css");
  assert.doesNotMatch(style, /(?:^|})\s*(?:button|a|select)(?::[\w-]+(?:\([^)]*\))?)*(?:,\s*(?:a|select|summary|pre)(?::[\w-]+)*)*\s*\{/m, "no unlayered bare button/a/select rules left in src/style.css");
  assert.doesNotMatch(read("src/main.ts"), /utilities\.css/);
  assert.doesNotMatch(read("src/catalogue/main.ts"), /utilities\.css/);
});

test("the editor loads used component files through parts.css; the board loads each as a style of its own", () => {
  // Through src/ui/parts.css, which loads the parts' files in one line of src/main.ts (its line ceiling).
  assert.match(read("src/main.ts"), /^import "\.\/ui\/parts\.css";$/m);
  assert.match(read("src/live-guest.ts"), /^import "\.\/ui\/inline-field\/inline-field\.css";$/m, "guest edit bar gets Inline field");
  assert.match(read("src/live-guest.ts"), /^import "\.\/ui\/row-menu\/row-menu\.css";$/m, "guest Media picker gets its Filter row menu");
  const partsCss = withoutComments(read("src/ui/parts.css"));
  const styleCss = withoutComments(read("src/style.css"));
  const catalogueMain = withoutComments(read("src/catalogue/main.ts"));
  const bootComponents = new Set(["button", "icon-button", "text-button", "inline-field", "row-menu", "dropdown", "flyout"]);
  for (const { id, path } of COMPONENTS) {
    const rel = path.replace(/^src\/ui\//, "./");
    if (bootComponents.has(id)) {
      assert.match(partsCss, new RegExp(`^@import "${rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}";$`, "m"), `parts.css imports ${path}`);
    } else {
      assert.doesNotMatch(partsCss, new RegExp(`/${id}\\.css`), `lazy or unused-at-boot ${id}.css stays out of parts.css`);
    }
    // Not through style.css or the part's own TS module: the board adds each itself, so a live cell can leave it out.
    assert.doesNotMatch(styleCss, new RegExp(`/${id}\\.css`), `style.css does not import ${id}.css`);
    assert.doesNotMatch(catalogueMain, new RegExp(`/${id}\\.css`), `catalogue/main.ts does not plain-import ${id}.css`);
    for (const tsPath of [`src/ui/${id}/${id}.ts`, `src/components/${id}.ts`]) {
      if (existsSync(join(repo, tsPath))) {
        assert.doesNotMatch(withoutComments(read(tsPath)), new RegExp(`import\\s+["'][^"']*(?:${id}|create-dialog)\\.css["']`), `${tsPath} does not import its own CSS`);
      }
    }
  }
  assert.match(read("src/shares-later.ts"), /^import "\.\/ui\/share-row\/share-row\.css";$/m, "lazy share chunk loads share-row.css");
  assert.match(read("src/lazy-loaders.ts"), /import\("\.\/ui\/confirm-dialog\/confirm-dialog\.css"\)/, "lazy confirm dialog loader loads confirm-dialog.css");
  assert.match(read("src/setup-actions.ts"), /^import "\.\/ui\/confirm-dialog\/confirm-dialog\.css";$/m);
  assert.match(read("src/page-builder/media-preparation-confirm.ts"), /^import "\.\.\/ui\/confirm-dialog\/confirm-dialog\.css";$/m);
  assert.match(read("src/components/create-dialog.css"), /^@import "\.\.\/ui\/confirm-dialog\/confirm-dialog\.css";$/m);
  for (const old of ["row-menu.css", "dropdown.css", "flyout.css", "share-row.css"]) {
    assert.equal(existsSync(join(repo, `src/components/${old}`)), false, `src/components/${old} moved into src/ui/`);
  }
  assert.match(catalogueMain, /^loadComponentStyles\(\);$/m);
});

test("the design board shows each migrated component's own CSS file", () => {
  for (const { id, path, board } of COMPONENTS) {
    if (!board) continue;
    const part = PARTS.find((item) => item.id === id);
    assert.ok(part && isPart(part), `${id} is on the design board`);
    assert.equal(part.css, path, `${id}.css is ${path}`);
    assert.ok(part.files.includes(path), `${id} lists ${path}`);
    assert.ok(!part.files.includes("src/style.css"), `${id} does not list src/style.css`);
  }
  for (const part of PARTS) {
    if (!isPart(part) || !part.css) continue;
    assert.ok(part.files.includes(part.css), `${part.id} lists its CSS file`);
    // The board reads these files as text (component-css.ts) and edits them on the live cell (shadow root or frame).
    assert.match(part.css, /^src\/ui\/([\w-]+)\/\1\.css$/, `${part.id}: its CSS file is a component file`);
  }
});


test("the editor entry only orders layers and imports its unlayered screens", () => {
  const css = withoutComments(read("src/style.css")).trim();
  const screens = ["topbar", "workspace", "welcome", "notices", "explorer"];
  for (const name of screens) {
    assert.match(css, new RegExp(`@import "\\./screens/${name}\\.css";`));
    assert.doesNotMatch(withoutComments(read(`src/screens/${name}.css`)), /@layer\b/, `${name} stays above the component layers`);
  }
  assert.equal(css.replace(ORDER, "").replace(/@import "[^";]+";/g, "").trim(), "", "screen rules never return to the entry file");
});
