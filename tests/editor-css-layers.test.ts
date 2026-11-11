import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { PARTS, isPart } from "../src/catalogue/parts.ts";

// The editor's CSS on the Techies Framework layers (docs/wayfinder/atomic-catalogue/css-layers-plan.md): tokens,
// elements, components, then the editor's own unlayered screen CSS. The Button is the first component in a file of
// its own, after the Framework's .btn shape: its look comes from --btn-* custom properties with defaults.

const repo = new URL("..", import.meta.url).pathname;
const read = (path: string) => readFileSync(join(repo, path), "utf8");
const BUTTON = "src/ui/parts/button.css";
const ORDER = "@layer tokens, elements, components;";
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

test("the Button's file sets the layers' order, then keeps everything on the components layer", () => {
  const css = withoutComments(read(BUTTON)).trim();
  assert.ok(css.startsWith(ORDER), "the order statement comes first, so the file works wherever it loads");
  const rest = css.slice(ORDER.length).trim();
  assert.ok(rest.startsWith("@layer components {"), "one components layer block");
  assert.equal(rest, `@layer components {${block(rest, 0)}}`, "nothing outside the components layer");
});

test("the Button's look comes from its --btn-* defaults, each one used", () => {
  const css = withoutComments(read(BUTTON));
  const button = block(css, css.indexOf(".button {"));
  for (const name of ["min-block-size", "radius", "padding-block", "padding-inline", "background", "text-color", "font-size", "font-weight"]) {
    assert.match(button, new RegExp(`--btn-${name}:`), `--btn-${name} has a default on .button`);
    assert.match(css, new RegExp(`var\\(--btn-${name}\\)`), `--btn-${name} is used`);
  }
  // A tone changes only the custom properties, as the Framework's variants do.
  const secondary = block(css, css.indexOf(".secondary {"));
  assert.deepEqual([...secondary.matchAll(/([\w-]+)\s*:/g)].map((match) => match[1]).filter((name) => !name.startsWith("--btn-")), []);
});

test("no other editor stylesheet holds the Button's own rules", () => {
  const own = /(?:^|[{};])\s*(?:\.button|\.primary|\.secondary|:is\(\.primary, \.secondary, \.button\):disabled)\s*\{/m;
  for (const file of cssFiles("src")) {
    if (file === BUTTON) continue;
    assert.doesNotMatch(withoutComments(read(file)), own, `${file} has a rule of the Button's own`);
  }
});

test("the editor's bare element rules sit on the elements layer, below every component", () => {
  const css = withoutComments(read("src/style.css"));
  assert.ok(css.trimStart().startsWith(ORDER), "src/style.css sets the layers' order before anything else");
  assert.match(css, /@import "\.\/ui\/parts\/button\.css";/);
  const at = css.indexOf("@layer elements {");
  assert.ok(at >= 0, "an elements layer");
  const elements = block(css, at);
  assert.match(elements, /button,\s*a,\s*select\s*\{[^}]*font: inherit;[^}]*color: inherit;/);
  const outside = css.slice(0, at) + css.slice(at + elements.length);
  assert.doesNotMatch(outside, /(?:^|})\s*(?:button|a)(?:,\s*(?:a|select))*\s*\{[^}]*(?:font|color): inherit/m, "no unlayered copy left");
});

test("the design board shows the Button's own CSS file", () => {
  const button = PARTS.find((part) => part.id === "button");
  assert.ok(button && isPart(button));
  assert.equal(button.css, BUTTON);
  assert.ok(button.files.includes(BUTTON));
  assert.ok(!button.files.includes("src/style.css"));
  for (const part of PARTS) if (isPart(part) && part.css) assert.ok(part.files.includes(part.css), `${part.id} lists its CSS file`);
});
