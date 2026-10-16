import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error The script is plain JavaScript without declarations.
import { colourLiterals, checkColours } from "../scripts/check-colours.mjs";

test("hex colours of every CSS length fail, with their original spelling", () => {
  assert.deepEqual(colourLiterals("a { color: #abc #ABCD #123456 #12345678; }"), [
    { line: 1, match: "#abc" }, { line: 1, match: "#ABCD" },
    { line: 1, match: "#123456" }, { line: 1, match: "#12345678" },
  ]);
  assert.deepEqual(colourLiterals("a { --invalid: #ab #abcde #abcdefghi; }"), []);
});

test("every literal function family fails, case-insensitively", () => {
  for (const name of ["rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch", "color"]) {
    const match = `${name.toUpperCase()}(0 0 0)`;
    assert.deepEqual(colourLiterals(`a { --colour: ${match}; }`), [{ line: 1, match }]);
  }
});

test("named colours fail; properties, hyphenated identifiers and permitted keywords pass", () => {
  assert.deepEqual(colourLiterals("a { white-space: nowrap; red: inherit; --white: currentColor; color: transparent; animation: white-space; --red-ink: var(--white); }"), []);
  for (const match of ["WHITE", "rebeccapurple", "lightgoldenrodyellow", "darkslategrey", "gray", "grey", "aliceblue"]) {
    assert.deepEqual(colourLiterals(`a { color: ${match}; }`), [{ line: 1, match }]);
  }
});

test("selectors, at-rule preludes and nested selectors are skipped; declarations still fail", () => {
  assert.deepEqual(colourLiterals([
    "@supports (color: red) {",
    "  #abc:hover { --custom: #123;",
    "    &:is(#fff, :hover) { color: blue; }",
    "    background: #abcd;",
    "  }",
    "}",
  ].join("\n")), [
    { line: 2, match: "#123" }, { line: 3, match: "blue" }, { line: 4, match: "#abcd" },
  ]);
});

test("comments, escaped strings and quoted/unquoted URLs are ignored", () => {
  assert.deepEqual(colourLiterals(String.raw`/* #fff red rgb(1 2 3) */
a { content: "white; } \" #fff"; --text: 'red';
  background: url(data:image/svg+xml;red{#abc}(blue)) URL("#fff");
  mask: url(red\)blue.svg); color: green;
}`), [{ line: 4, match: "green" }]);
});

test("ignored multiline text and non-BMP characters preserve offsets and line numbers", () => {
  assert.deepEqual(colourLiterals('/* 🎨🎨\nred */\na { content: "#fff\nblue";\n color: #123456;\n background: WHITE; }'), [
    { line: 5, match: "#123456" }, { line: 6, match: "WHITE" },
  ]);
});

test("alpha-only relative functions allow tokens and currentColor with unchanged channels", () => {
  for (const [name, channels] of Object.entries({
    rgb: "r g b", rgba: "r g b", hsl: "h s l", hsla: "h s l", hwb: "h w b",
    lab: "l a b", lch: "l c h", oklab: "l a b", oklch: "l c h", color: "srgb r g b",
  })) {
    for (const source of ["var(--semantic-shadow)", "currentColor", "var(--shadow, var(--fallback))"]) {
      assert.deepEqual(colourLiterals(`a { color: ${name}(from ${source} ${channels} / calc(.45 * .5)); }`), [], `${name}, ${source}`);
    }
  }
  assert.deepEqual(colourLiterals("a { color: OKLCH(from CURRENTCOLOR L C H / 20%); }"), []);
  assert.deepEqual(colourLiterals("a { color: oklch(from var(--shadow) l c h / calc(.45 / 2)); }"), []);
  assert.deepEqual(colourLiterals("a { color: oklch(from var(--shadow)\n l c h / .45); }"), []);
});

test("relative colours that set, reorder or calculate a channel fail", () => {
  for (const match of [
    "oklch(from var(--primary) 0.58 0.12 h)", "oklch(from var(--primary) calc(l * .5) c h / .2)",
    "oklch(from var(--primary) c l h / .2)", "rgb(from currentColor r 0 b / .2)",
    "oklch(from #fff l c h / .2)", "color(from var(--primary) srgb 0 g b / .2)",
  ]) {
    assert.equal(colourLiterals(`a { color: ${match}; }`)[0].match, match);
  }
});

test("color-mix allows tokens but still scans arguments and relative-source fallbacks", () => {
  assert.deepEqual(colourLiterals("a { color: color-mix(in oklch, var(--surface) 7%, transparent); }"), []);
  assert.deepEqual(colourLiterals("a { color: color-mix(in oklch, white 7%, transparent); }"), [{ line: 1, match: "white" }]);
  assert.deepEqual(colourLiterals("a { color: oklch(from var(--surface, red) l c h / .2); }"), [{ line: 1, match: "red" }]);
});

test("allow entries suppress findings only in their file and matching source line", () => {
  const files = [{ file: "src/a.css", text: "a {\n mask: linear-gradient(#000, transparent);\n color: red;\n}" }, { file: "src/b.css", text: "a { color: #000; }" }];
  assert.deepEqual(checkColours(files, [{ file: "src/a.css", match: "mask: linear-gradient(#000", reason: "Only mask alpha is used." }]), [
    { file: "src/a.css", line: 3, match: "red" }, { file: "src/b.css", line: 1, match: "#000" },
  ]);
});

test("stale entries fail even when their text exists on a line without a raw colour", () => {
  for (const files of [[], [{ file: "src/a.css", text: "a { color: var(--text); } /* #000 */" }]]) {
    assert.match(checkColours(files, [{ file: "src/a.css", match: "#000", reason: "Mask alpha." }])[0].match, /stale allow entry/);
  }
});

test("missing or blank reasons and malformed allow lists fail without suppressing colours", () => {
  const files = [{ file: "src/a.css", text: "a { color: red; }" }];
  for (const reason of [undefined, "", "  "]) {
    const result = checkColours(files, [{ file: "src/a.css", match: "red", reason }]);
    assert.match(result[0].match, /requires file, match and reason/);
    assert.deepEqual(result[1], { file: "src/a.css", line: 1, match: "red" });
  }
  assert.match(checkColours(files, {})[0].match, /must be an array/);
});
