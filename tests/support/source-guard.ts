import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { posix } from "node:path";
import type * as TS from "typescript-eslint-api/node_modules/typescript";
export type { TS };

// TypeScript 7 has no JavaScript API; the lint package owns the TS 6 parser.
export const ts: typeof TS = createRequire(import.meta.url)("typescript-eslint-api");
export type Finding = { file: string; line: number; rule: string; function: string; text: string };
export type AllowlistEntry = { file: string; match: string | { rule?: string; function?: string; text?: string; includes?: boolean }; reason: string; count?: number };
export type Detector = (source: string, file: string) => Finding[];
export type FunctionBody = TS.FunctionLikeDeclaration & { body: TS.ConciseBody };
type Analysis = { tree: TS.SourceFile; checker: TS.TypeChecker };
const analysed = new Map<string, Analysis>();

export function parse(source: string, file: string) {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

export function walk(node: TS.Node, visit: (node: TS.Node) => void) {
  visit(node);
  ts.forEachChild(node, child => walk(child, visit));
}

export function strip(node: TS.Node): TS.Node {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node) || ts.isTypeAssertionExpression(node) || (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken)) node = ts.isPrefixUnaryExpression(node) ? node.operand : node.expression;
  return node;
}

export function member(node: TS.Node): { name: string; receiver: TS.Expression } | undefined {
  if (ts.isPropertyAccessExpression(node)) return { name: node.name.text, receiver: node.expression };
  if (ts.isElementAccessExpression(node) && node.argumentExpression) {
    const key = strip(node.argumentExpression);
    if (ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key)) return { name: key.text, receiver: node.expression };
  }
  return undefined;
}

export function isFunction(node: TS.Node): node is FunctionBody {
  return ts.isFunctionLike(node) && "body" in node && !!node.body;
}

export function boundName(node: TS.FunctionLikeDeclaration): string | undefined {
  let bound: TS.Node = node;
  while (bound.parent && strip(bound.parent) === node) bound = bound.parent;
  const parent = bound.parent;
  return parent && (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent)) ? parent.name.getText() : undefined;
}

export function functionName(node: TS.FunctionLikeDeclaration) {
  return node.name?.getText() ?? boundName(node);
}

export function finding(tree: TS.SourceFile, node: TS.Node, rule: string, text = node.getText(tree)): Finding {
  let name = "<top-level>";
  for (let parent: TS.Node | undefined = node; parent; parent = parent.parent) {
    if (isFunction(parent) && functionName(parent)) { name = functionName(parent)!; break; }
  }
  return { file: tree.fileName, line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1, rule, function: name, text };
}

export function analyse(source: string, file: string): Analysis {
  const key = `${file}\0${source}`;
  let analysis = analysed.get(key);
  if (!analysis) {
    const tree = parse(source, file);
    const host: TS.CompilerHost = {
      getSourceFile: name => name === file ? tree : undefined, fileExists: name => name === file, readFile: () => undefined, writeFile: () => {},
      getDefaultLibFileName: () => "lib.d.ts", getCurrentDirectory: () => "", getCanonicalFileName: name => name, useCaseSensitiveFileNames: () => true, getNewLine: () => "\n",
    };
    analysis = { tree, checker: ts.createProgram([file], { noLib: true, noResolve: true, allowJs: true, types: [] }, host).getTypeChecker() };
    analysed.set(key, analysis);
  }
  return analysis;
}

export function declarationOf(checker: TS.TypeChecker, node: TS.Node): TS.Declaration | undefined {
  const symbol = symbolAt(checker, node);
  return symbol?.valueDeclaration ?? symbol?.declarations?.[0];
}

export function functionOf(checker: TS.TypeChecker, expression: TS.Node, depth = 0): FunctionBody | undefined {
  expression = strip(expression);
  if (isFunction(expression)) return expression;
  if (!ts.isIdentifier(expression) || depth > 8) return undefined;
  const declaration = declarationOf(checker, expression);
  if (declaration && isFunction(declaration)) return declaration;
  return declaration && ts.isVariableDeclaration(declaration) && declaration.initializer ? functionOf(checker, declaration.initializer, depth + 1) : undefined;
}

export function returnsOf(factory: FunctionBody): TS.Expression[] {
  if (!ts.isBlock(factory.body)) return [factory.body];
  const returned: TS.Expression[] = [];
  const visit = (node: TS.Node): void => {
    if (isFunction(node)) return;
    if (ts.isReturnStatement(node) && node.expression) returned.push(node.expression);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(factory.body, visit);
  return returned;
}

export function plansOf(checker: TS.TypeChecker, expression: TS.Node, depth = 0): FunctionBody[] | undefined {
  expression = strip(expression);
  if (depth > 8) return undefined;
  if (ts.isConditionalExpression(expression)) {
    const branches = [plansOf(checker, expression.whenTrue, depth + 1), plansOf(checker, expression.whenFalse, depth + 1)];
    return branches.every(Boolean) ? branches.flat() as FunctionBody[] : undefined;
  }
  if (ts.isCallExpression(expression)) {
    const factory = functionOf(checker, expression.expression);
    const returned = factory ? returnsOf(factory).map(value => plansOf(checker, value, depth + 1)) : [];
    return returned.length && returned.every(Boolean) ? returned.flat() as FunctionBody[] : undefined;
  }
  if (isFunction(expression)) return [expression];
  const declaration = ts.isIdentifier(expression) ? declarationOf(checker, expression) : undefined;
  if (declaration && isFunction(declaration)) return [declaration];
  return declaration && ts.isVariableDeclaration(declaration) && declaration.initializer ? plansOf(checker, declaration.initializer, depth + 1) : undefined;
}

export function isEdits(checker: TS.TypeChecker, node: TS.Node, depth = 0): boolean {
  node = strip(node);
  if (/edits$/i.test(member(node)?.name ?? node.getText())) return true;
  if (!ts.isIdentifier(node) || depth > 8) return false;
  const declaration = declarationOf(checker, node);
  if (declaration && ts.isBindingElement(declaration)) return /edits$/i.test(bindingKey(declaration) ?? "");
  return !!declaration && ts.isVariableDeclaration(declaration) && !!declaration.initializer && isEdits(checker, declaration.initializer, depth + 1);
}

export function isPlanMethod(checker: TS.TypeChecker, node: TS.Node, depth = 0): boolean {
  node = strip(node);
  if (depth > 8) return false;
  const bind = ts.isCallExpression(node) ? member(strip(node.expression)) : undefined;
  if (bind?.name === "bind") return isPlanMethod(checker, bind.receiver, depth + 1);
  const access = member(node);
  if (access) return ["run", "now"].includes(access.name) && isEdits(checker, access.receiver);
  if (!ts.isIdentifier(node)) return false;
  const declaration = declarationOf(checker, node);
  if (declaration && ts.isBindingElement(declaration) && ts.isVariableDeclaration(declaration.parent.parent) && declaration.parent.parent.initializer) {
    return ["run", "now"].includes(bindingKey(declaration) ?? "") && isEdits(checker, declaration.parent.parent.initializer);
  }
  return !!declaration && ts.isVariableDeclaration(declaration) && !!declaration.initializer && isPlanMethod(checker, declaration.initializer, depth + 1);
}

export function bindingKey(node: TS.BindingElement): string | undefined {
  const key = node.propertyName ?? node.name;
  if (ts.isComputedPropertyName(key)) {
    const literal = strip(key.expression);
    return ts.isStringLiteral(literal) || ts.isNoSubstitutionTemplateLiteral(literal) ? literal.text : undefined;
  }
  return ts.isIdentifier(key) || ts.isStringLiteral(key) ? key.text : undefined;
}

export function referenceName(node: TS.Node): string | undefined {
  const access = member(node);
  if (access) return access.name;
  if (ts.isImportSpecifier(node) || ts.isExportSpecifier(node)) return (node.propertyName ?? node.name).text;
  if (ts.isBindingElement(node)) return bindingKey(node);
  if (!ts.isIdentifier(node)) return undefined;
  const parent = node.parent;
  if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent) || ts.isBindingElement(parent)
    || ts.isPropertyAccessExpression(parent) && parent.name === node
    || ts.isPropertyAssignment(parent) && parent.name === node
    || (ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isFunctionLike(parent)
      || ts.isClassDeclaration(parent) || ts.isInterfaceDeclaration(parent) || ts.isTypeAliasDeclaration(parent)
      || ts.isPropertyDeclaration(parent) || ts.isPropertySignature(parent) || ts.isMethodSignature(parent)) && parent.name === node) return undefined;
  return node.text;
}

export function destructured(node: TS.BindingElement): TS.Expression | undefined {
  let root: TS.Node = node;
  while (ts.isBindingElement(root) || ts.isObjectBindingPattern(root) || ts.isArrayBindingPattern(root)) root = root.parent;
  return ts.isVariableDeclaration(root) || ts.isParameter(root) ? root.initializer : undefined;
}

export function walkOutside(node: TS.Node, visit: (node: TS.Node) => void) {
  visit(node);
  ts.forEachChild(node, child => { if (!isFunction(child) && !ts.isImportDeclaration(child) && !ts.isExportDeclaration(child)) walkOutside(child, visit); });
}

export function literal(node: TS.Node | undefined): string | undefined {
  // `"div" as const`, `("div")`, `"div"!` and `<const>"div"` are the same literal.
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node) || ts.isTypeAssertionExpression(node))) node = node.expression;
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined;
}

export function inType(node: TS.Node) {
  for (let parent: TS.Node | undefined = node; parent; parent = parent.parent) {
    if (ts.isTypeNode(parent) || ts.isImportTypeNode(parent)) return true;
    if ((ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) && parent.isTypeOnly) return true;
    if (ts.isImportClause(parent) && parent.isTypeOnly || ts.isExportDeclaration(parent) && parent.isTypeOnly) return true;
  }
  return false;
}

export function reference(node: TS.Node): boolean {
  if (!ts.isIdentifier(node) || inType(node)) return false;
  const parent = node.parent;
  if (ts.isShorthandPropertyAssignment(parent)) return true;
  return !(ts.isPropertyAccessExpression(parent) && parent.name === node
    || ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent) || ts.isBindingElement(parent)
    || "name" in parent && parent.name === node);
}

export function checkerFor(tree: TS.SourceFile): TS.TypeChecker {
  return analyse(tree.text, tree.fileName).checker;
}
export function symbolAt(checker: TS.TypeChecker, node: TS.Node) {
  return node.parent && ts.isShorthandPropertyAssignment(node.parent)
    ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node);
}
// A synthetic access retains the original receiver's bound symbols, including nested destructuring.
export function initializer(checker: TS.TypeChecker, node: TS.Node): TS.Node | undefined {
  const decl = declarationOf(checker, node);
  if (decl && ts.isVariableDeclaration(decl)) return decl.initializer;
  if (decl && ts.isBindingElement(decl)) {
    const receiver = bindingReceiver(decl), key = bindingKey(decl);
    if (receiver && key) return ts.factory.createPropertyAccessExpression(receiver, key);
  }
  return undefined;
}
export function bindingReceiver(node: TS.BindingElement): TS.Expression | undefined {
  const parent = node.parent.parent;
  if (ts.isVariableDeclaration(parent) || ts.isParameter(parent)) return parent.initializer;
  if (ts.isBindingElement(parent)) {
    const receiver = bindingReceiver(parent), key = bindingKey(parent);
    if (receiver && key) return ts.factory.createPropertyAccessExpression(receiver, key);
  }
  return undefined;
}
// Follow a value standing for a protected reference. Calls return values, not readers.
export function standsFor(checker: TS.TypeChecker, node: TS.Node, accepts: (node: TS.Node) => boolean, seen = new Set<TS.Node>()): boolean {
  node = strip(node);
  if (seen.has(node) || inType(node)) return false;
  seen.add(node);
  if (accepts(node)) return true;
  if (ts.isCallExpression(node) && member(strip(node.expression))?.name === "bind")
    return standsFor(checker, member(strip(node.expression))!.receiver, accepts, seen);
  if (!ts.isIdentifier(node)) return false;
  const decl = declarationOf(checker, node);
  if (decl && (ts.isImportSpecifier(decl) || ts.isBindingElement(decl)) && accepts(decl)) return true;
  const value = initializer(checker, node);
  return !!value && standsFor(checker, value, accepts, seen);
}
export function named(checker: TS.TypeChecker, node: TS.Node, names: Set<string>): boolean {
  return standsFor(checker, node, value => names.has(referenceName(value) ?? ""));
}
type NamedReference = (checker: TS.TypeChecker, node: TS.Node, names: Set<string>) => boolean;
const namedReference: NamedReference = (_checker, node, names) => !inType(node) && names.has(referenceName(node) ?? "");
const reached = new WeakMap<TS.SourceFile, Map<NamedReference, Map<Set<string>, Set<TS.Node>>>>();
export function referring(checker: TS.TypeChecker, tree: TS.SourceFile, names: Set<string>, direct: NamedReference = namedReference): Set<TS.Node> {
  let byPredicate = reached.get(tree);
  if (!byPredicate) reached.set(tree, byPredicate = new Map());
  let byNames = byPredicate.get(direct);
  if (!byNames) byPredicate.set(direct, byNames = new Map());
  let found = byNames.get(names);
  if (found) return found;
  found = new Set();
  const users = new Map<TS.Node, TS.Node[]>(), queue: TS.Node[] = [];
  walk(tree, declaration => {
    if (ts.isImportSpecifier(declaration)) {
      if (direct(checker, declaration, names)) queue.push(declaration);
      return;
    }
    if (ts.isBindingElement(declaration) && direct(checker, declaration, names)) queue.push(declaration);
    // A function with its parameter defaults; a destructured name by what it is taken from.
    const value = isFunction(declaration) ? declaration : ts.isBindingElement(declaration) ? destructured(declaration)
      : ts.isVariableDeclaration(declaration) || ts.isParameter(declaration) ? declaration.initializer : undefined;
    if (value) walk(value, inner => {
      const name = referenceName(inner);
      if (!name) return;
      if (direct(checker, inner, names)) queue.push(declaration);
      const used = ts.isIdentifier(inner) ? declarationOf(checker, inner) : undefined;
      if (used) users.set(used, [...users.get(used) ?? [], declaration]);
    });
  });
  for (let declaration = queue.pop(); declaration; declaration = queue.pop()) {
    if (found.has(declaration)) continue;
    found.add(declaration);
    queue.push(...users.get(declaration) ?? []);
  }
  byNames.set(names, found);
  return found;
}

export function refers(checker: TS.TypeChecker, node: TS.Node, names: Set<string>, direct: NamedReference = namedReference): boolean {
  const name = referenceName(node);
  if (!name) return false;
  if (direct(checker, node, names)) return true;
  const declaration = ts.isIdentifier(node) ? declarationOf(checker, node) : undefined;
  return !!declaration && referring(checker, node.getSourceFile(), names, direct).has(declaration);
}

export type ModuleReference = { node: TS.Node; module: string; name?: string };
// Value imports, re-exports and dynamic imports share one traversal. Type positions read nothing.
export function moduleReferences(tree: TS.SourceFile): ModuleReference[] {
  const refs: ModuleReference[] = [];
  const add = (node: TS.Node, specifier: TS.Node | undefined, name?: string) => {
    const module = literal(specifier);
    if (module !== undefined && !inType(node)) refs.push({ node, module, name });
  };
  walk(tree, node => {
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) {
      const clause = node.importClause, bindings = clause?.namedBindings;
      if (!clause) add(node, node.moduleSpecifier);
      if (clause?.name) add(clause.name, node.moduleSpecifier, "default");
      if (bindings && ts.isNamespaceImport(bindings)) add(bindings, node.moduleSpecifier);
      if (bindings && ts.isNamedImports(bindings)) for (const entry of bindings.elements)
        if (!entry.isTypeOnly) add(entry, node.moduleSpecifier, (entry.propertyName ?? entry.name).text);
    }
    if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) for (const entry of node.exportClause.elements) {
        if (!entry.isTypeOnly) add(entry, node.moduleSpecifier, (entry.propertyName ?? entry.name).text);
      } else add(node, node.moduleSpecifier);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) add(node, node.arguments[0]);
  });
  return refs;
}
export function modulePath(module: string, file: string): string {
  return (module.startsWith(".") ? posix.normalize(posix.join(posix.dirname(file), module)) : module.replace(/^\//, "")).replace(/\.[cm]?[jt]s$/, "");
}
export function matches(hit: Finding, entry: AllowlistEntry): boolean {
  if (hit.file !== entry.file) return false;
  if (typeof entry.match === "string") return hit.function === entry.match || hit.text === entry.match;
  const match = entry.match;
  return (match.rule === undefined || hit.rule === match.rule) && (match.function === undefined || hit.function === match.function)
    && (match.text === undefined || (match.includes ? hit.text.includes(match.text) : hit.text === match.text));
}
export function unallowed(hits: Finding[], entries: AllowlistEntry[]): Finding[] {
  return hits.filter(hit => !entries.some(entry => matches(hit, entry)));
}
export function staleEntries(hits: Finding[], entries: AllowlistEntry[]): AllowlistEntry[] {
  return entries.filter(entry => !entry.reason.trim() || !Number.isInteger(entry.count ?? 1) || (entry.count ?? 1) < 1
    || hits.filter(hit => matches(hit, entry)).length !== (entry.count ?? 1));
}
export function sourceFiles(directory = "src"): string[] {
  return readdirSync(new URL(`../../${directory}/`, import.meta.url), { withFileTypes: true }).flatMap(entry => {
    const file = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sourceFiles(file) : /\.(?:[cm]?[jt]s|tsx)$/.test(file) ? [file] : [];
  });
}
export function readSource(file: string): string {
  return readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
}

// Each rule supplies only the protected names and whether declarations also count.
export function nameFindings(source: string, file: string, rule: string, accepts: (name: string) => boolean, declarations = false, text?: (node: TS.Node) => string): Finding[] {
  const { tree, checker } = analyse(source, file), hits: Finding[] = [];
  const protectedReference = (node: TS.Node) => accepts(referenceName(node) ?? "");
  walk(tree, node => {
    if (inType(node)) return;
    const declaration = declarations && (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node))
      && node.name && ts.isIdentifier(node.name) ? node.name : undefined;
    if (declaration && accepts(declaration.text)) hits.push(finding(tree, declaration, rule, text?.(declaration)));
    else if (referenceName(node) && (protectedReference(node) || ts.isIdentifier(node) && standsFor(checker, node, protectedReference)))
      hits.push(finding(tree, node, rule, text?.(node)));
  });
  return hits;
}

// Resolve the module behind a namespace, including same-file aliases and awaited imports.
function namespaceModule(checker: TS.TypeChecker, node: TS.Node, seen = new Set<TS.Node>()): string | undefined {
  node = strip(node);
  if (seen.has(node)) return undefined;
  seen.add(node);
  if (ts.isAwaitExpression(node)) return namespaceModule(checker, node.expression, seen);
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) return literal(node.arguments[0]);
  if (!ts.isIdentifier(node)) return undefined;
  const declaration = declarationOf(checker, node);
  if (declaration && ts.isNamespaceImport(declaration) && !inType(declaration)) return literal(declaration.parent.parent.moduleSpecifier);
  const value = initializer(checker, node);
  return value ? namespaceModule(checker, value, seen) : undefined;
}

export function importedFrom(checker: TS.TypeChecker, node: TS.Node, name: string, module: (specifier: string) => boolean, seen = new Set<TS.Node>()): boolean {
  node = strip(node);
  if (seen.has(node) || inType(node)) return false;
  seen.add(node);
  const access = member(node);
  if (access) {
    const specifier = namespaceModule(checker, access.receiver);
    return access.name === name && specifier !== undefined && module(specifier);
  }
  if (!ts.isIdentifier(node)) return false;
  const declaration = declarationOf(checker, node);
  if (!declaration) return node.text === name; // Unresolved fixture names retain their meaning.
  if (ts.isImportSpecifier(declaration)) return !inType(declaration) && (declaration.propertyName ?? declaration.name).text === name
    && module(literal(declaration.parent.parent.parent.moduleSpecifier) ?? "");
  const value = initializer(checker, node);
  return !!value && importedFrom(checker, value, name, module, seen);
}
