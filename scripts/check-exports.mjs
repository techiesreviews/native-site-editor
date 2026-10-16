import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript-eslint-api";

const slash = path => path.replaceAll("\\", "/");
const subject = file => /^(src|shared|worker)\//.test(file);
const allowedSource = file => subject(file) || /^vite(?:\.config|-.*)\.ts$/.test(file);
const allowFile = "scripts/check-exports.allow.json";

function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, child => { walk(child, visit); });
}

/** Literal module edges, including the entry files Vite discovers through URLs. */
function moduleEdges(source) {
  const edges = [];
  walk(source, node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      edges.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) {
      edges.push(node.arguments[0].text);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) {
      edges.push(node.argument.literal.text);
    } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "URL" && node.arguments?.length === 2) {
      const [path, base] = node.arguments;
      if (ts.isStringLiteralLike(path) && /^\.\.?\/.+\.(?:js|ts)$/.test(path.text)
        && ts.isPropertyAccessExpression(base) && base.name.text === "url"
        && ts.isMetaProperty(base.expression) && base.expression.keywordToken === ts.SyntaxKind.ImportKeyword && base.expression.name.text === "meta") {
        edges.push(path.text);
      }
    }
  });
  return edges;
}

function moduleResolver(options, host) {
  const cache = ts.createModuleResolutionCache(host.getCurrentDirectory(), slash, options);
  return (name, from) => ts.resolveModuleName(name, from, options, host, cache).resolvedModule?.resolvedFileName;
}

function reachableFiles(roots, root, sourceFile, resolveModule) {
  const reached = new Set();
  const queue = roots.map(file => resolve(root, file));
  for (let index = 0; index < queue.length; index++) {
    const file = queue[index];
    if (reached.has(file) || !allowedSource(slash(relative(root, file)))) continue;
    const source = sourceFile(file);
    if (!source) throw new Error(`Cannot read production module: ${slash(relative(root, file))}`);
    reached.add(file);
    for (const name of moduleEdges(source)) {
      const target = resolveModule(name, file);
      if (target) queue.push(target);
    }
  }
  return reached;
}

/** Build each configured program, adding URL-only files before binding symbols. */
export function productionPrograms(root) {
  const cache = new Map();
  return [
    { config: "tsconfig.json", roots: ["src/main.ts", "src/components/native-preview-runtime.ts", "vite.config.ts"] },
    { config: "worker/tsconfig.json", roots: ["worker/index.ts"] },
  ].map(({ config, roots }) => {
    const configPath = resolve(root, config);
    const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
    if (loaded.error) throw new Error(ts.flattenDiagnosticMessageText(loaded.error.messageText, "\n"));
    const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, dirname(configPath), { allowJs: true, checkJs: false });
    if (parsed.errors.length) throw new Error(parsed.errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, "\n")).join("\n"));
    const options = parsed.options;
    const host = ts.createCompilerHost(options);
    const readSource = host.getSourceFile;
    host.getSourceFile = (file, ...args) => {
      if (!cache.has(file)) cache.set(file, readSource(file, ...args));
      return cache.get(file);
    };
    roots = roots.map(file => file.endsWith("/native-preview-runtime.ts") && !host.fileExists(resolve(root, file)) ? file.replace(/\.ts$/, ".js") : file);
    const reached = reachableFiles(roots, root, file => host.getSourceFile(file, options.target), moduleResolver(options, host));
    return { program: ts.createProgram([...new Set([...parsed.fileNames, ...reached])], options, host), roots };
  });
}

function analyzeProgram(program, roots, root, host) {
  const checker = program.getTypeChecker();
  const resolveModule = moduleResolver(program.getCompilerOptions(), host);
  const reached = reachableFiles(roots, root, file => program.getSourceFile(file), resolveModule);
  const modules = new Map();
  const exportedNames = new Set();
  const exports = new Map();
  const used = new Set();
  const localExports = new Map();
  const files = new Set();
  const key = (file, name) => `${slash(relative(root, file))}:${name}`;
  const unalias = symbol => symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const moduleAt = node => checker.getSymbolAtLocation(node);
  const moduleFile = symbol => unalias(symbol)?.declarations?.find(ts.isSourceFile)?.fileName;
  const fileAt = node => moduleFile(moduleAt(node));

  for (const source of program.getSourceFiles()) {
    if (!allowedSource(slash(relative(root, source.fileName)))) continue;
    if (subject(slash(relative(root, source.fileName)))) files.add(source.fileName);
    const symbol = checker.getSymbolAtLocation(source);
    if (!symbol) continue;
    const names = new Map();
    for (const exported of checker.getExportsOfModule(symbol)) {
      const name = exported.getName();
      exportedNames.add(name);
      // Star barrels participate in propagation, but only declarations have findings.
      const declaration = exported.declarations?.find(node => node.getSourceFile() === source);
      names.set(name, { symbol: exported, source });
      if (!declaration) continue;
      const id = key(source.fileName, name);
      const record = { file: slash(relative(root, source.fileName)), line: source.getLineAndCharacterOfPosition(declaration.getStart(source)).line + 1, name };
      if (subject(record.file)) exports.set(id, record);
      const local = ts.isExportSpecifier(declaration) && !declaration.parent.parent.moduleSpecifier
        ? checker.getExportSpecifierLocalTargetSymbol(declaration) : exported;
      if (local && !(local.flags & ts.SymbolFlags.Alias)) {
        for (const node of local.declarations ?? []) {
          if (node.name && ts.isIdentifier(node.name)) exportedNames.add(node.name.text);
        }
        const entries = localExports.get(local) ?? [];
        entries.push({ id, declarations: local.declarations ?? [] });
        localExports.set(local, entries);
      }
    }
    modules.set(source.fileName, names);
  }

  function mark(file, name, user) {
    if (!file || file === user) return;
    const id = key(file, name);
    const entry = modules.get(file)?.get(name);
    if (!entry || used.has(id)) return;
    used.add(id);
    for (const statement of entry.source.statements) {
      if (!ts.isExportDeclaration(statement)) continue;
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        const specifier = statement.exportClause.elements.find(item => item.name.text === name);
        if (!specifier) continue;
        if (statement.moduleSpecifier) mark(fileAt(statement.moduleSpecifier), (specifier.propertyName ?? specifier.name).text, file);
        else markImported(checker.getExportSpecifierLocalTargetSymbol(specifier), file);
      } else if (!statement.exportClause && statement.moduleSpecifier) {
        const target = fileAt(statement.moduleSpecifier);
        const origin = modules.get(target)?.get(name);
        if (origin && unalias(origin.symbol) === unalias(entry.symbol)) mark(target, name, file);
      }
    }
  }

  function markImported(symbol, user) {
    for (const declaration of symbol?.declarations ?? []) {
      if (ts.isImportSpecifier(declaration)) mark(fileAt(declaration.parent.parent.parent.moduleSpecifier), (declaration.propertyName ?? declaration.name).text, user);
      if (ts.isImportClause(declaration)) mark(fileAt(declaration.parent.moduleSpecifier), "default", user);
    }
  }

  function moduleTypes(type) {
    if (type.isUnion()) return type.types.flatMap(moduleTypes);
    const file = moduleFile(type.getSymbol());
    return file ? [file] : [];
  }

  function member(type, name, user) {
    for (const file of moduleTypes(type)) mark(file, name, user);
  }

  function literalNames(type) {
    if (type.isUnion()) return type.types.flatMap(literalNames);
    return type.isStringLiteral() ? [type.value] : [];
  }

  function portMembers(type, context, user, depth = 0) {
    if (depth > 6) return;
    type = checker.getNonNullableType(type);
    context = checker.getNonNullableType(context);
    if (moduleTypes(context).length) return;
    const targets = moduleTypes(type);
    if (targets.length) {
      for (const target of targets) {
        for (const property of checker.getPropertiesOfType(context)) mark(target, property.name, user);
      }
      return;
    }
    const promised = checker.getPromisedTypeOfPromise(type);
    const expected = checker.getPromisedTypeOfPromise(context);
    if (promised && expected) portMembers(promised, expected, user, depth + 1);
    for (const signature of type.getCallSignatures()) {
      for (const port of context.getCallSignatures()) {
        portMembers(checker.getReturnTypeOfSignature(signature), checker.getReturnTypeOfSignature(port), user, depth + 1);
      }
    }
  }

  for (const file of reached) {
    const source = program.getSourceFile(file);
    walk(source, node => {
      // Passing a module into a typed production port consumes that port's members.
      if (ts.isIdentifier(node) && (ts.isPropertyAssignment(node.parent) && node.parent.initializer === node
        || ts.isShorthandPropertyAssignment(node.parent)
        || ts.isArrowFunction(node.parent) && node.parent.body === node
        || ts.isCallExpression(node.parent) && node.parent.arguments.includes(node)
        || ts.isVariableDeclaration(node.parent) && node.parent.initializer === node && node.parent.type)) {
        const objectContext = ts.isShorthandPropertyAssignment(node.parent) ? checker.getContextualType(node.parent.parent) : undefined;
        const property = objectContext?.getProperty(node.text);
        const context = property ? checker.getTypeOfSymbolAtLocation(property, node) : checker.getContextualType(node);
        if (context) portMembers(checker.getTypeAtLocation(node), context, file);
      }
      if (ts.isIdentifier(node) && exportedNames.has(node.text)) {
        const symbol = ts.isShorthandPropertyAssignment(node.parent)
          ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node);
        for (const entry of localExports.get(symbol) ?? []) {
          // Recursive references and export clauses do not make a declaration live.
          let insideDeclaration = false;
          for (let ancestor = node; ancestor && ancestor !== source; ancestor = ancestor.parent) {
            if (entry.declarations.includes(ancestor) || ts.isExportDeclaration(ancestor)) insideDeclaration = true;
          }
          if (!insideDeclaration) used.add(entry.id);
        }
      }
      if (ts.isImportDeclaration(node) && node.importClause) {
        const target = fileAt(node.moduleSpecifier);
        if (node.importClause.name) mark(target, "default", file);
        const bindings = node.importClause.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const specifier of bindings.elements) mark(target, (specifier.propertyName ?? specifier.name).text, file);
        }
      } else if (ts.isPropertyAccessExpression(node) && exportedNames.has(node.name.text)) {
        member(checker.getTypeAtLocation(node.expression), node.name.text, file);
      } else if (ts.isElementAccessExpression(node) && node.argumentExpression) {
        for (const name of literalNames(checker.getTypeAtLocation(node.argumentExpression))) member(checker.getTypeAtLocation(node.expression), name, file);
      } else if (ts.isQualifiedName(node) && exportedNames.has(node.right.text)) {
        mark(fileAt(node.left), node.right.text, file);
        member(checker.getTypeAtLocation(node.left), node.right.text, file);
      } else if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent) && !node.dotDotDotToken) {
        const name = node.propertyName ?? node.name;
        if ((ts.isIdentifier(name) || ts.isStringLiteralLike(name)) && exportedNames.has(name.text)) member(checker.getTypeAtLocation(node.parent), name.text, file);
      } else if (ts.isImportTypeNode(node) && node.qualifier) {
        let name = node.qualifier;
        while (ts.isQualifiedName(name)) name = name.left;
        mark(fileAt(node.argument.literal), name.text, file);
      } else if (ts.isIndexedAccessTypeNode(node)) {
        for (const name of literalNames(checker.getTypeFromTypeNode(node.indexType))) member(checker.getTypeFromTypeNode(node.objectType), name, file);
      } else if (ts.isTypeReferenceNode(node) && node.typeArguments?.length) {
        // Mapped utilities such as Pick preserve the selected module properties.
        const files = moduleTypes(checker.getTypeFromTypeNode(node.typeArguments[0]));
        if (files.length) {
          for (const property of checker.getPropertiesOfType(checker.getTypeFromTypeNode(node))) {
            for (const target of files) {
              const exported = unalias(modules.get(target)?.get(property.name)?.symbol);
              if (exported && checker.getRootSymbols(property).some(symbol => unalias(symbol) === exported)) mark(target, property.name, file);
            }
          }
        }
      }
    });
  }
  return { exports, used, files, reached };
}

/** Analyze configured programs together: shared exports can have users in either. */
export function unusedExports(programs, root) {
  const exports = new Map();
  const used = new Set();
  const files = new Set();
  const reached = new Set();
  for (const { program, roots, host = ts.sys } of programs) {
    const result = analyzeProgram(program, roots, root, host);
    for (const [key, entry] of result.exports) exports.set(key, entry);
    for (const key of result.used) used.add(key);
    for (const file of result.files) files.add(file);
    for (const file of result.reached) reached.add(file);
  }
  const unreachable = [...files].filter(file => !reached.has(file)).map(file => slash(relative(root, file)));
  return [
    ...unreachable.map(file => ({ file, line: 1, name: "(file unreachable)" })),
    ...[...exports].filter(([key, entry]) => !used.has(key) && !unreachable.includes(entry.file)).map(([, entry]) => entry),
  ]
    .sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line || a.name.localeCompare(b.name));
}

/** In-memory fixtures use the same resolver, checker and graph as the CLI. */
export function exportsInFiles(files, roots = ["src/main.ts"]) {
  const root = "/exports-fixture";
  const texts = new Map(Object.entries(files).map(([file, text]) => [resolve(root, file), text]));
  const options = { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, noLib: true, allowJs: true, strict: true };
  const host = ts.createCompilerHost(options);
  host.getCurrentDirectory = () => root;
  host.fileExists = file => texts.has(file);
  host.readFile = file => texts.get(file);
  host.directoryExists = dir => [...texts.keys()].some(file => file.startsWith(`${dir}/`));
  host.getSourceFile = file => texts.has(file) ? ts.createSourceFile(file, texts.get(file), options.target, true) : undefined;
  const program = ts.createProgram([...texts.keys()], options, host);
  return unusedExports([{ program, roots, host }], root);
}

/** Exceptions must explain a current finding; invalid or stale entries fail. */
export function checkExports(findings, allow = []) {
  if (!Array.isArray(allow)) return [{ file: allowFile, line: 1, name: "allow list must be an array" }, ...findings];
  const failures = [];
  const allowed = new Set();
  allow.forEach((entry, index) => {
    if (!entry || ![entry.file, entry.name, entry.reason].every(value => typeof value === "string" && value.trim())) {
      failures.push({ file: allowFile, line: index + 1, name: "allow entry requires file, name and reason" });
    } else if (!findings.some(finding => finding.file === entry.file && finding.name === entry.name)) {
      failures.push({ file: allowFile, line: index + 1, name: `stale allow entry: ${entry.file}: ${entry.name}` });
    } else allowed.add(`${entry.file}:${entry.name}`);
  });
  return [...failures, ...findings.filter(finding => !allowed.has(`${finding.file}:${finding.name}`))];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const started = performance.now();
  try {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const findings = unusedExports(productionPrograms(root), root);
    const allow = JSON.parse(readFileSync(resolve(root, allowFile), "utf8"));
    const failures = checkExports(findings, allow);
    for (const { file, line, name } of failures) console.log(`${file}${name === "(file unreachable)" ? "" : `:${line}`}  ${name}`);
    console.log(`check-exports: ${findings.length} unused export(s), ${failures.length} failure(s).`);
    if (failures.length) process.exitCode = 1;
  } catch (error) {
    console.error(`check-exports: ${error.message}`);
    process.exitCode = 1;
  }
  if (process.argv.includes("--time")) console.log(`check-exports: ${Math.round(performance.now() - started)} ms`);
}
