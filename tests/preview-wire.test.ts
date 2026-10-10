import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { FRESHNESS, type FrameMessage, type HostMessage } from "../src/components/preview-protocol";

const FRAME_TYPES = FRESHNESS satisfies Record<FrameMessage["type"], unknown>;
const HOST_TYPES = {
  update: true, "drop-probe": true, "patch-text": true, "finish-typing": true,
  inspect: true, theme: true, "component-focus": true, "edit-component": true,
  viewing: true, "scroll-by": true, pins: true, "show-pin": true, assets: true,
  "canvas-crumb": true, "canvas-avoid": true, "canvas-hint": true, "canvas-code-select": true,
  "clear-selection": true, "select-node": true, "select-parent": true, "item-grid-track": true,
} satisfies Record<HostMessage["type"], true>;

const runtime = readFileSync(new URL("../src/components/native-preview-runtime.js", import.meta.url), "utf8");

function emittedTypes(source: string) {
  // Remove only the function declaration: every call must name its type literally.
  const calls = source.replace(/\bfunction\s+emit\s*\([^)]*\)/g, "");
  const literals = [...calls.matchAll(/\bemit\s*\(\s*(["'])([^"']+)\1\s*[,)]/g)];
  assert.equal([...calls.matchAll(/\bemit\s*\(/g)].length, literals.length, "emit calls must have a literal type");
  const direct = [...calls.matchAll(/\bparent\.postMessage\s*\(\s*\{\s*source:\s*FRAME_SOURCE,\s*type:\s*(["'])([^"']+)\1/g)];
  // Besides `emit`'s own post, every post must be in the one shape read above.
  assert.equal([...calls.matchAll(/\bpostMessage\s*\(/g)].length, direct.length + 1, "posts must go through emit or name their type first");
  return new Set([...literals, ...direct].map(match => match[2]));
}

function handledTypes(source: string) {
  // Every read of a host message's type must be a comparison with a literal, so none escapes the guard.
  const reads = [...source.matchAll(/\bmsg\.type\b/g)].length;
  const compared = [...source.matchAll(/\bmsg\.type\s*(?:===|!==)\s*(["'])([^"']+)\1/g)].length;
  assert.equal(reads, compared, "msg.type is read only in comparisons with a literal");
  assert.doesNotMatch(source, /\bswitch\s*\(\s*msg\b/, "no switch over host messages");
  return new Set([...source.matchAll(/\bmsg\.type\s*(?:===|!==)\s*(["'])([^"']+)\1/g)].map(match => match[2]));
}

function unknownTypes(types: Set<string>, valid: object) {
  return [...types].filter(type => !Object.hasOwn(valid, type));
}

function assertTypes(types: Set<string>, valid: object) {
  assert.deepEqual(unknownTypes(types, valid), [], "unknown wire message types");
  assert.deepEqual([...types].sort(), Object.keys(valid).sort(), "every protocol type must appear in the runtime");
}

test("runtime emits every frame type and handles every host type, with no unknown types", () => {
  assertTypes(emittedTypes(runtime), FRAME_TYPES);
  assertTypes(handledTypes(runtime), HOST_TYPES);
  assert.doesNotMatch(runtime, /canvas-spacing|canvasSpacing|canvasDrawSpacing|canvasPlace|data-native-spacing/);
});

test("wire extractor rejects unknown and non-literal emit types", () => {
  const emit = 'function emit(type) { parent.postMessage({ source: FRAME_SOURCE, type }, "*"); } ';
  assert.deepEqual(unknownTypes(emittedTypes(emit + 'emit("bogus");'), FRAME_TYPES), ["bogus"]);
  assert.throws(() => assertTypes(emittedTypes(emit + 'emit("bogus");'), FRAME_TYPES), /unknown wire message types/);
  assert.throws(() => emittedTypes(emit + "emit(variable);"), /literal type/);
  assert.deepEqual(unknownTypes(handledTypes('if (msg.type !== "bogus") return;'), HOST_TYPES), ["bogus"]);
  assert.throws(() => handledTypes('var kind = msg.type; if (kind === "bogus") return;'), /only in comparisons/);
  assert.throws(() => handledTypes('switch (msg.type) { case "bogus": }'), /only in comparisons/);
  assert.throws(() => emittedTypes(emit + 'parent.postMessage({ type: "bogus", source: FRAME_SOURCE }, "*");'), /name their type first/);
});

test("runtime shares wire sources and receives host messages through one listener", () => {
  assert.equal([...runtime.matchAll(/\baddEventListener\s*\(\s*["']message["']/g)].length, 1);
  assert.match(runtime, /import\s*\{\s*FRAME_SOURCE,\s*HOST_SOURCE\s*\}\s*from\s*"\.\/preview-wire\.ts"/);
  assert.match(runtime, /if\s*\(msg\.source\s*!==\s*HOST_SOURCE\)\s*return/);
  assert.match(runtime, /var base = \{ source: FRAME_SOURCE, type: type \}/);
  assert.match(runtime, /parent\.postMessage\(\{ source: FRAME_SOURCE, type: "ready"/);
  assert.doesNotMatch(runtime, /astro-native-preview/);
  for (const path of ["../src/page-builder/palette.ts", "../src/components/refusal-note.ts"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\baddEventListener\s*\(\s*["']message["']|\.native-preview-frame/);
  }
});
