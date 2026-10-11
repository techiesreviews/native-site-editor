import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import type * as TS from "typescript-eslint-api/node_modules/typescript";

// Reuse the TS 6 parser already installed for lint and the guard tests.
const ts: typeof TS = createRequire(import.meta.url)("typescript-eslint-api");
const root = new URL("../", import.meta.url);
type Entry = { path: string; symbol?: string };

function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`## ${heading}\n`);
  assert.ok(start >= 0, `Code map section missing: ${heading}`);
  const body = markdown.slice(start + `## ${heading}\n`.length);
  const end = body.search(/^## /m);
  return end < 0 ? body : body.slice(0, end);
}

function entries(body: string, defaultPath?: string): Entry[] {
  const found: Entry[] = [];
  for (const line of body.split("\n")) {
    let path = defaultPath;
    for (const match of line.matchAll(/`([^`]+)`/g)) {
      const token = match[1];
      if (token.includes("/")) {
        path = token;
        found.push({ path });
      } else {
        assert.match(token, /^[A-Za-z_$][\w$]*$/, `Expected a declaration name: ${token}`);
        assert.ok(path, `Symbol has no named file: ${token}`);
        found.push({ path, symbol: token });
      }
    }
  }
  assert.ok(found.length > 0, "Code map section has no checked entries");
  return found;
}

function declarations(source: string, path: string): Set<string> {
  const names = new Set<string>();
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  function binding(name: TS.BindingName) {
    if (ts.isIdentifier(name)) names.add(name.text);
    else for (const element of name.elements) if (ts.isBindingElement(element)) binding(element.name);
  }
  function visit(node: TS.Node) {
    if (ts.isVariableDeclaration(node)) binding(node.name);
    else if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)
      || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)
      || ts.isEnumDeclaration(node)) && node.name) names.add(node.name.text);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return names;
}

test("code map paths and symbols still exist in their named files", () => {
  const markdown = readFileSync(new URL("docs/agents/code-map.md", root), "utf8");
  const mapped = [
    ...entries(section(markdown, "Where things live")),
    ...entries(section(markdown, "Main entry points"), "src/main.ts"),
  ];
  const cache = new Map<string, Set<string>>();
  const missing: string[] = [];
  for (const { path, symbol } of mapped) {
    const url = new URL(path, root);
    if (!existsSync(url)) {
      missing.push(`Path: ${path}`);
      continue;
    }
    if (!symbol) continue;
    let names = cache.get(path);
    if (!names) {
      names = declarations(readFileSync(url, "utf8"), path);
      cache.set(path, names);
    }
    if (!names.has(symbol)) missing.push(`Declaration: ${path} — ${symbol}`);
  }
  assert.deepEqual(missing, [], "Stale code map entries");
});

test("map entries pair every symbol with its preceding file on that row", () => {
  assert.deepEqual(entries("| Concern | `src/a.ts` — `first`, `second`; `src/b.ts` — `third` |"), [
    { path: "src/a.ts" }, { path: "src/a.ts", symbol: "first" },
    { path: "src/a.ts", symbol: "second" }, { path: "src/b.ts" },
    { path: "src/b.ts", symbol: "third" },
  ]);
  assert.throws(() => entries("`orphan`"), /Symbol has no named file/);
  assert.throws(() => section("## Other\n", "Where things live"), /section missing/);
});

test("declarations exclude comments, strings, imports and mere symbol uses", () => {
  const names = declarations(`
    import { imported } from "./other";
    // function commentOnly() {}
    const text = "const stringOnly = true";
    missing();
    export function entry() { function nested() {} }
    const { original: renamed } = value;
    interface Contract {}
    type Alias = Contract;
    class Service {}
  `, "fixture.ts");
  assert.deepEqual([...names].sort(), ["Alias", "Contract", "Service", "entry", "nested", "renamed", "text"]);
});
