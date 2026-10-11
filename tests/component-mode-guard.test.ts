import assert from "node:assert/strict";
import { test } from "node:test";
import { ts, walk, strip, member, finding, analyse, declarationOf, bindingKey, inType, reference, initializer, symbolAt, named, importedFrom, unallowed, staleEntries, sourceFiles, readSource, type TS, type Finding, type AllowlistEntry } from "./support/source-guard.ts";

type Rule = "chain" | "ports" | "mode-json" | "mutable-state";

const HOME = "src/page-builder/component-mode.ts";
const TOOLS = "src/page-builder/components.ts";
const allowlist: AllowlistEntry[] = [];

// No imports or lib are loaded. Symbols distinguish local aliases and shadowing; annotations
// retain imported type names even when their checker type is any. Alias walks are cycle bounded.
function detect(source: string, file: string): Finding[] {
  const { tree, checker } = analyse(source, file);
  const hits: Finding[] = [];
  const add = (node: TS.Node, rule: Rule) => hits.push(finding(tree, node, rule));
  const declaration = (node: TS.Node) => declarationOf(checker, node);
  const valueOf = (node: TS.Node) => initializer(checker, node);
  const namedValue = (node: TS.Node, names: Set<string>) => named(checker, node, names);
  function typeNamed(node: TS.Node | undefined, names: Set<string>, depth = 0): boolean {
    if (!node || depth > 12) return false;
    if (ts.isTypeReferenceNode(node)) {
      const name = node.typeName.getText(tree).split(".").at(-1)!;
      if (names.has(name)) return true;
      const decl = declaration(node.typeName);
      if (decl && ts.isImportSpecifier(decl) && names.has((decl.propertyName ?? decl.name).text)) return true;
      if (decl && ts.isTypeAliasDeclaration(decl) && typeNamed(decl.type, names, depth + 1)) return true;
      if (decl && ts.isInterfaceDeclaration(decl) && typeNamed(decl, names, depth + 1)) return true;
    }
    // Containers/unions and object fields hold the protected type too. A function that merely
    // accepts/returns Stamp is not storage of a Stamp, so do not descend into function types.
    if (ts.isFunctionTypeNode(node) || ts.isConstructorTypeNode(node)) return false;
    let found = false;
    ts.forEachChild(node, child => { if (typeNamed(child, names, depth + 1)) found = true; });
    return found;
  }
  function receiverType(node: TS.Node, names: Set<string>, depth = 0): boolean {
    node = strip(node);
    if (depth > 12) return false;
    const decl = declaration(node);
    if (decl && "type" in decl && typeNamed(decl.type as TS.TypeNode | undefined, names)) return true;
    const type = checker.getTypeAtLocation(node);
    if (names.has(type.aliasSymbol?.name ?? "") || names.has(type.getSymbol()?.name ?? "")) return true;
    const value = valueOf(node);
    return !!value && receiverType(value, names, depth + 1);
  }
  function preview(node: TS.Node, depth = 0): boolean {
    node = strip(node);
    if (depth > 12) return false;
    if (receiverType(node, new Set(["NativePreview"]))) return true;
    // ComponentDeps.preview's imported return type need not be resolved.
    if (ts.isCallExpression(node)) {
      const access = member(node.expression);
      if (access?.name === "preview" && receiverType(access.receiver, new Set(["ComponentDeps"]))) return true;
      if (namedValue(node.expression, new Set(["createNativePreview"]))) return true;
    }
    const decl = declaration(node);
    if (decl && "type" in decl && decl.type) {
      const text = (decl.type as TS.TypeNode).getText(tree);
      if (/\bReturnType\s*<\s*typeof\s+createNativePreview\s*>/.test(text)) return true;
    }
    const value = valueOf(node);
    return !!value && preview(value, depth + 1);
  }
  function port(node: TS.Node, depth = 0): boolean {
    node = strip(node);
    if (depth > 12) return false;
    const access = member(node);
    if (access && ["call", "apply"].includes(access.name)) return port(access.receiver, depth + 1);
    if (access?.name === "shareHistory") return receiverType(access.receiver, new Set(["ComponentDeps"]));
    if (access?.name === "editComponent") {
      if (preview(access.receiver)) return true;
      // A locally declared preview (method or arrow property) keeps the frame parameter's
      // annotation in its call signature even if EditComponentFrameMode is an unresolved import.
      if (checker.getTypeAtLocation(node).getCallSignatures().some(signature =>
        signature.getDeclaration()?.parameters.some(param => typeNamed(param.type, new Set(["EditComponentFrameMode"]))))) return true;
      const symbol = checker.getTypeAtLocation(access.receiver).getProperty(access.name);
      const decl = declaration(ts.isPropertyAccessExpression(node) ? node.name : node)
        ?? symbol?.valueDeclaration ?? symbol?.declarations?.[0];
      if (decl && (ts.isMethodSignature(decl) || ts.isMethodDeclaration(decl)))
        return decl.parameters.some(param => typeNamed(param.type, new Set(["EditComponentFrameMode"])));
      if (decl && ts.isPropertySignature(decl) && decl.type && ts.isFunctionTypeNode(decl.type))
        return decl.type.parameters.some(param => typeNamed(param.type, new Set(["EditComponentFrameMode"])));
      if (decl && ts.isPropertyAssignment(decl) && ts.isArrowFunction(decl.initializer))
        return decl.initializer.parameters.some(param => typeNamed(param.type, new Set(["EditComponentFrameMode"])));
    }
    if (ts.isCallExpression(node) && member(node.expression)?.name === "bind") return port(member(node.expression)!.receiver, depth + 1);
    const value = ts.isIdentifier(node) ? valueOf(node) : undefined;
    return !!value && port(value, depth + 1);
  }
  // The module's createComponentMode: imported (renamed, namespaced or aliased), or unresolved in
  // a fixture; a local function of that name is not it.
  const creator = (node: TS.Node) => importedFrom(checker, node, "createComponentMode",
    specifier => /(^|\/)component-mode(\.[cm]?[jt]s)?$/.test(specifier));
  function adapter(node: TS.Node): boolean {
    for (let parent: TS.Node | undefined = node.parent; parent; parent = parent.parent) {
      if (!ts.isObjectLiteralExpression(parent)) continue;
      let argument: TS.Node = parent;
      while (argument.parent && strip(argument.parent) === parent) argument = argument.parent;
      const call = argument.parent;
      if (call && ts.isCallExpression(call) && call.arguments.includes(argument as TS.Expression)
        && creator(call.expression)) return true;
    }
    return false;
  }
  function modeReceiver(node: TS.Node, depth = 0): boolean {
    node = strip(node);
    if (depth > 12) return false;
    if (member(node)?.name === "mode" || receiverType(node, new Set(["ComponentMode"]))) return true;
    if (ts.isCallExpression(node) && namedValue(node.expression, new Set(["createComponentMode"]))) return true;
    const value = valueOf(node);
    if (value) return modeReceiver(value, depth + 1);
    return ts.isIdentifier(node) && /^(mode|editMode)$/.test(node.text);
  }
  function modeRead(node: TS.Node, depth = 0): boolean {
    node = strip(node);
    if (depth > 12) return false;
    if (ts.isCallExpression(node)) {
      if (modeReader(node.expression)) return true;
    }
    const value = ts.isIdentifier(node) ? valueOf(node) : undefined;
    return !!value && modeRead(value, depth + 1);
  }
  function modeReader(node: TS.Node, depth = 0): boolean {
    node = strip(node);
    if (depth > 12) return false;
    const access = member(node);
    if (access && ["now", "active"].includes(access.name) && modeReceiver(access.receiver)) return true;
    if (ts.isCallExpression(node) && member(node.expression)?.name === "bind") return modeReader(member(node.expression)!.receiver, depth + 1);
    const value = ts.isIdentifier(node) ? valueOf(node) : undefined;
    return !!value && modeReader(value, depth + 1);
  }
  function modeJson(node: TS.Node, depth = 0): boolean {
    node = strip(node);
    if (depth > 12) return false;
    if (ts.isCallExpression(node)) {
      const access = member(node.expression);
      if (access?.name === "stringify" && ts.isIdentifier(strip(access.receiver))
        && strip(access.receiver).getText(tree) === "JSON" && !declaration(strip(access.receiver)))
        return !!node.arguments[0] && modeRead(node.arguments[0]);
    }
    const value = ts.isIdentifier(node) ? valueOf(node) : undefined;
    return !!value && modeJson(value, depth + 1);
  }
  // Opening is the private { template, stamp } type; Entry holds a pending opening's share.
  // Recognise imported aliases, local type aliases, nested object/container types, stamp()
  // initialisers, and objects containing them. A named zero-argument void callback counts as
  // a share release when named release/releases, or containing share/letGo (case-insensitive).
  // Other disposal callbacks, e.g. releaseNativeTextIndex, are not shares. This deliberately
  // does not guess cross-file factory return types, later assignments or arbitrary wrapper calls.
  const storedTypes = new Set(["Stamp", "Opening", "Entry"]);
  function shareName(name: string) { return /share|unshare|letGo|^(?:release|releases)$/i.test(name); }
  function shareType(node: TS.Node | undefined, name: string, depth = 0): boolean {
    if (!node || depth > 12) return false;
    if (ts.isFunctionTypeNode(node)) return shareName(name) && node.parameters.length === 0 && node.type.kind === ts.SyntaxKind.VoidKeyword;
    if (ts.isTypeReferenceNode(node)) {
      const decl = declaration(node.typeName);
      if (decl && ts.isTypeAliasDeclaration(decl) && shareType(decl.type, name, depth + 1)) return true;
      if (decl && ts.isInterfaceDeclaration(decl) && shareType(decl, name, depth + 1)) return true;
    }
    let found = false;
    ts.forEachChild(node, child => {
      const childName = ts.isPropertySignature(child) ? child.name.getText(tree) : name;
      if (shareType(child, childName, depth + 1)) found = true;
    });
    return found;
  }
  function stores(node: TS.Node, depth = 0): boolean {
    if (depth > 12) return false;
    if ((ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node))
      && typeNamed(node.type, storedTypes)) return true;
    node = strip(node);
    if (ts.isCallExpression(node)) {
      const access = member(node.expression);
      if (access && ["stamp", "shareHistory"].includes(access.name)) return true;
      if (namedValue(node.expression, new Set(["stamp", "shareHistory"]))) return true;
      // Same-file stamp factories retain their annotated return type without resolving imports.
      const decl = declaration(node.expression);
      if (decl && ts.isFunctionLike(decl) && typeNamed(decl.type, storedTypes)) return true;
      if (checker.getTypeAtLocation(node.expression).getCallSignatures().some(signature =>
        typeNamed(signature.getDeclaration()?.type, storedTypes))) return true;
    }
    // A field read off a typed holder (`holder.stamp`, `held["release"]`): the field's declared type.
    const access = member(node);
    if (access) {
      // Every declaration of the field: each member of a union, a written value, a shorthand.
      const receiverType = checker.getTypeAtLocation(access.receiver);
      const field = ts.isPropertyAccessExpression(node) ? checker.getSymbolAtLocation(node.name) : checker.getTypeAtLocation(access.receiver).getProperty(access.name);
      const fields = field ? [...(field.declarations ?? []), ...(receiverType.isUnion()
        ? receiverType.types.flatMap(type => type.getProperty(access.name)?.declarations ?? []) : [])] : [];
      for (const decl of fields) {
        if ("type" in decl && (typeNamed(decl.type as TS.TypeNode | undefined, storedTypes) || shareType(decl.type as TS.TypeNode | undefined, access.name))) return true;
        if (ts.isPropertyAssignment(decl) && stores(decl.initializer, depth + 1)) return true;
        if (ts.isShorthandPropertyAssignment(decl) && stores(decl.name, depth + 1)) return true;
      }
    }
    if (ts.isIdentifier(node)) {
      const decl = declaration(node);
      if (decl && "type" in decl && typeNamed(decl.type as TS.TypeNode | undefined, storedTypes)) return true;
      const value = valueOf(node);
      return !!value && stores(value, depth + 1);
    }
    if (ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node) || ts.isConditionalExpression(node)
      || ts.isBinaryExpression(node) || ts.isNewExpression(node)) {
      let found = false;
      ts.forEachChild(node, child => { if (stores(child, depth + 1)) found = true; });
      return found;
    }
    if (ts.isPropertyAssignment(node)) return stores(node.initializer, depth + 1);
    if (ts.isSpreadAssignment(node)) return stores(node.expression, depth + 1);
    if (ts.isShorthandPropertyAssignment(node)) return stores(node.name, depth + 1);
    return false;
  }
  function captured(decl: TS.VariableDeclaration): boolean {
    let owner: TS.Node | undefined;
    for (let parent: TS.Node | undefined = decl.parent; parent; parent = parent.parent) {
      if (ts.isFunctionLike(parent)) { owner = parent; break; }
    }
    // Module scope includes top-level blocks, but not functions/methods or class state.
    if (!owner) {
      for (let parent: TS.Node | undefined = decl.parent; parent; parent = parent.parent)
        if (ts.isClassLike(parent)) return false;
      return true;
    }
    if (file !== TOOLS) return false;
    let tools = false;
    for (let parent: TS.Node | undefined = owner; parent; parent = parent.parent)
      if (ts.isFunctionDeclaration(parent) && parent.name?.text === "createComponentTools") tools = true;
    if (!tools) return false;
    const symbols = new Set<TS.Symbol>();
    const bind = (name: TS.BindingName): void => {
      if (ts.isIdentifier(name)) {
        const symbol = symbolAt(checker, name);
        if (symbol) symbols.add(symbol);
      } else for (const element of name.elements) if (ts.isBindingElement(element)) bind(element.name);
    };
    bind(decl.name);
    let found = false;
    walk(owner, node => {
      const symbol = reference(node) ? symbolAt(checker, node) : undefined;
      if (!symbol || !symbols.has(symbol)) return;
      for (let parent: TS.Node | undefined = node.parent; parent && parent !== owner; parent = parent.parent)
        if (ts.isFunctionLike(parent)) { found = true; break; }
    });
    return found;
  }
  const chains = new Set(["drillChain", "backChain"]);
  const equals = new Set([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken]);
  walk(tree, node => {
    if (file !== HOME && !inType(node)) {
      if (member(node) && namedValue(node, chains) || reference(node) && namedValue(node, chains)
        || (ts.isImportSpecifier(node) || ts.isExportSpecifier(node)) && chains.has((node.propertyName ?? node.name).text)
        || ts.isBindingElement(node) && chains.has(bindingKey(node) ?? "")) add(node, "chain");
    }
    if (file !== HOME && ts.isCallExpression(node) && port(node.expression) && !adapter(node)) add(node, "ports");
    if (ts.isBinaryExpression(node) && equals.has(node.operatorToken.kind) && (modeJson(node.left) || modeJson(node.right))) add(node, "mode-json");
    if (file !== HOME && ts.isVariableDeclaration(node) && ts.isVariableDeclarationList(node.parent)
      && (node.parent.flags & ts.NodeFlags.Let) !== 0 && captured(node)
      && (typeNamed(node.type, storedTypes) || shareType(node.type, node.name.getText(tree)) || node.initializer && stores(node.initializer))) add(node, "mutable-state");
  });
  return hits;
}

const FAKE = "src/component-mode-guard-fixture.ts";
function flags(rule: Rule, source: string, file = FAKE) {
  const hits = detect(source, file);
  assert.ok(hits.some(hit => hit.rule === rule), `${rule}: ${source}`);
  assert.ok(hits.every(hit => hit.file === file && hit.line >= 1 && hit.text.length > 0));
}
function passes(rule: Rule, source: string, file = FAKE) {
  assert.deepEqual(detect(source, file).filter(hit => hit.rule === rule), [], source);
}

test("chain helpers stay in component-mode, including renamed imports and references to call", () => {
  for (const name of ["drillChain", "backChain"]) {
    for (const source of [`${name}();`, `const run = chain["${name}"]; run();`,
      `import { ${name} as step } from './chain'; step();`, `const { ${name}: step } = chain; step();`,
      `export { ${name} as step } from './chain';`, `consume(chain?.${name});`]) flags("chain", source);
    passes("chain", `${name}();`, HOME);
  }
  passes("chain", `// drillChain()\nconst text = 'backChain'; const keys = { drillChain: true }; type T = typeof backChain;`);
  passes("chain", `function f(step) { step(); }`);
  const shadowed = detect(`import { drillChain as step } from './chain'; function f(step) { step(); }`, FAKE);
  assert.equal(shadowed.filter(hit => hit.text === "step").length, 0);
});

test("component share and frame ports are called only in the createComponentMode adapter", () => {
  for (const call of [`deps.shareHistory?.('a', 'b')`, `deps['shareHistory']('a', 'b')`, `deps.preview()?.editComponent?.(undefined)`]) {
    flags("ports", `function f(deps: ComponentDeps) { ${call}; }`);
    passes("ports", `function f(deps: ComponentDeps) { createComponentMode({ share: () => ${call} }); }`);
    passes("ports", `function f(deps: ComponentDeps) { ${call}; }`, HOME);
  }
  flags("ports", `function f(d: ComponentDeps) { const deps = d; const { shareHistory: share } = deps; share('a', 'b'); }`);
  flags("ports", `function f(d: ComponentDeps) { d.shareHistory.call(d, 'a', 'b'); }`);
  flags("ports", `interface Preview { editComponent(mode: EditComponentFrameMode | undefined): void } function f(p: Preview) { p.editComponent(undefined); }`);
  flags("ports", `interface Preview { editComponent(mode: EditComponentFrameMode | undefined): void } function f(p: Preview) { const { editComponent: frame } = p; frame(undefined); }`);
  flags("ports", `const p = { editComponent: (mode: EditComponentFrameMode | undefined) => {} }; p.editComponent(undefined);`);
  flags("ports", `const p = createNativePreview(); const frame = p.editComponent.bind(p); frame(undefined);`);
  flags("ports", `function f(deps: ComponentDeps) { const p = deps.preview(); const frame = p.editComponent; frame(undefined); }`);
  passes("ports", `function f(ws: EditorWorkspace, host: WorkspaceHost) { ws.shareHistory(['a'], 'b'); host.shareHistory(['a'], 'b'); }`);
  passes("ports", `function editComponent(tag: string) {} editComponent('card'); const other = { editComponent(tag: string) {} }; other.editComponent('card');`);
  passes("ports", `function f(deps: ComponentDeps) { function g(deps: EditorWorkspace) { deps.shareHistory(['a'], 'b'); } }`);
  passes("ports", `import { createComponentMode as create } from './component-mode'; function f(deps: ComponentDeps) { create({ share: () => deps.shareHistory('a', 'b') }); }`);
  flags("ports", `function f(deps: ComponentDeps) { const adapter = { share: () => deps.shareHistory('a', 'b') }; createComponentMode(adapter); }`);
  flags("ports", `function createComponentMode<T>(ports: T) { return ports; } function f(deps: ComponentDeps) { createComponentMode({ share: () => deps.shareHistory('a', 'b') }); }`);
  passes("ports", `import * as modes from './component-mode'; function f(deps: ComponentDeps) { const create = modes.createComponentMode; create({ share: () => deps.shareHistory('a', 'b') }); }`);
  flags("ports", `const other = { createComponentMode: (x: unknown) => x }; function f(deps: ComponentDeps) { other.createComponentMode({ share: () => deps.shareHistory('a', 'b') }); }`);
  flags("ports", `import { createComponentMode } from './other-mode'; function f(deps: ComponentDeps) { createComponentMode({ share: () => deps.shareHistory('a', 'b') }); }`);
  flags("ports", `import * as other from './other-mode'; function f(deps: ComponentDeps) { other.createComponentMode({ share: () => deps.shareHistory('a', 'b') }); }`);
});

test("mode JSON comparisons follow aliases of the read and of its serialised result", () => {
  for (const operator of ["===", "!==", "==", "!="]) {
    for (const read of ["mode.now()", "tools.mode?.now()", "editMode.active()", "mode['active']()"])
      flags("mode-json", `JSON.stringify(${read}) ${operator} before;`);
    flags("mode-json", `const m = tools.mode; const current = m.now(); const snapshot = current; const proof = JSON.stringify(snapshot); const alias = proof; before ${operator} alias;`);
    flags("mode-json", `const { now: read } = tools.mode; JSON.stringify(read()) ${operator} before;`);
    flags("mode-json", `const read = mode.now.bind(mode); JSON.stringify(read()) ${operator} before;`);
  }
  passes("mode-json", `JSON.stringify(mode.now()); const proof = JSON.stringify(mode.active()); log(proof);`);
  passes("mode-json", `JSON.stringify(Date.now()) === before; JSON.stringify(clock.now()) !== before; JSON.stringify(data) == before;`);
  passes("mode-json", `function f(JSON) { return JSON.stringify(mode.now()) === before; }`);
  passes("mode-json", `const proof = JSON.stringify(mode.now()); function f(proof) { return proof === before; }`);
});

test("mutable state catches protected annotations, containers, factories and share releases", () => {
  for (const declaration of [
    `let since: Stamp | undefined;`, `import type { Stamp as Proof } from './guarded-edit'; let since: Proof;`,
    `type Held = { stamp: Stamp }; let opening: Held | undefined;`, `let opening: Opening;`,
    `interface Held { stamp: Stamp } let opening: Held | undefined;`,
    `interface Held { release: () => void } let renames: Held[];`,
    `let pending: Entry;`, `let openings: Map<string, Opening>;`, `let since = edits.stamp();`,
    `let opening = { template: 'card', stamp: edits.stamp() };`, `let release = deps.shareHistory('a', 'b');`,
    `let levelShares: (() => void)[];`, `let renames: { release: () => void }[];`,
    `type Release = () => void; let unshare: Release | undefined;`,
    `function proof(): Stamp { return edits.stamp(); } let since = proof();`,
    `const stamp = edits.stamp; let since = stamp();`,
    `const proof = (): Stamp => edits.stamp(); let since = proof();`,
    `let opening = undefined as Opening | undefined;`,
    `const since = edits.stamp(); let opening = { since };`,
    `const holder: { stamp: Stamp } = x; let since = holder.stamp;`,
    `const held: { release: () => void } = x; let release = held["release"];`,
    `const opening = { since: edits.stamp() }; let since = opening.since;`,
    `const stamp = edits.stamp(); const holder = { stamp }; let since = holder.stamp;`,
    `const holder: { stamp: number } | { stamp: Stamp } = x; let since = holder.stamp;`,
  ]) {
    flags("mutable-state", declaration);
    const imports = declaration.match(/import[^;]+;/g)?.join("\n") ?? "";
    const body = declaration.replace(/import[^;]+;/g, "");
    flags("mutable-state", `${imports}\nfunction createComponentTools(deps: ComponentDeps) { ${body} return () => ${/let\s+(\w+)/.exec(declaration)![1]}; }`, TOOLS);
    passes("mutable-state", declaration.replace(/\blet\b/g, "const"));
    passes("mutable-state", declaration, HOME);
  }
  passes("mutable-state", `function action() { let since = edits.stamp(); return () => since; }`);
  passes("mutable-state", `function createComponentTools() { let since: Stamp; use(since); }`, TOOLS);
  passes("mutable-state", `function createComponentTools() { let since: Stamp; return (since: Stamp) => since; }`, TOOLS);
  passes("mutable-state", `function createComponentTools() { return () => { let since: Stamp; use(since); }; }`, TOOLS);
  flags("mutable-state", `function createComponentTools() { let since: Stamp; return () => ({ since }); }`, TOOLS);
  flags("mutable-state", `function createComponentTools() { function helper() { let since: Stamp; return () => since; } }`, TOOLS);
  flags("mutable-state", `function createComponentTools() { let { stamp: since }: { stamp: Stamp } = opening; return () => since; }`, TOOLS);
  passes("mutable-state", `function createComponentTools() { let { stamp: since }: { stamp: Stamp } = opening; return () => unknown; }`, TOOLS);
  passes("mutable-state", `let releaseNativeTextIndex: (() => void) | undefined; let done = false; let factory: () => Stamp;`);
  passes("mutable-state", `class Cache { method() { let since: Stamp; return () => since; } }`);
  passes("mutable-state", `const holder: { count: number; stamp: Stamp } = x; let count = holder.count; const held: { done: () => void } = x; let done = held.done;`);
});

test("every src TypeScript file respects the component mode boundary", () => {
  const files = sourceFiles();
  for (const file of [HOME, TOOLS, "src/components/native-preview.ts", "src/guarded-edit.ts", "src/editor-workspace.ts", "src/guarded-edit/commit.ts", "src/main.ts"])
    assert.ok(files.includes(file), file);
  const hits = files.flatMap(file => detect(readSource(file), file));
  assert.deepEqual(unallowed(hits, allowlist), []);
  assert.deepEqual(staleEntries(hits, allowlist), []);
});

test("allowlist requires a reason and exact count, and rejects stale entries", () => {
  const hits = detect("drillChain();", FAKE);
  const entry = { file: FAKE, match: "drillChain", reason: "Fixture exception only.", count: 1 };
  assert.deepEqual(unallowed(hits, [entry]), []);
  assert.deepEqual(staleEntries(hits, [entry]), []);
  assert.deepEqual(unallowed(hits, [{ ...entry, file: HOME }]), hits);
  assert.deepEqual(unallowed(hits, [{ ...entry, match: "backChain" }]), hits);
  for (const changed of [[], [...hits, ...hits]]) assert.deepEqual(staleEntries(changed, [entry]), [entry]);
  assert.deepEqual(staleEntries([...hits, ...hits], [{ ...entry, count: 2 }]), []);
  assert.deepEqual(staleEntries(hits, [{ ...entry, reason: " " }]), [{ ...entry, reason: " " }]);
});
