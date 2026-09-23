import ts from "typescript-language";
import * as compiler from "@astrojs/compiler";
import wasmURL from "@astrojs/compiler/astro.wasm?url";
import {
  TraceMap,
  generatedPositionFor,
  originalPositionFor,
  GREATEST_LOWER_BOUND,
} from "@jridgewell/trace-mapping";

const libraries = import.meta.glob(
  "/node_modules/typescript-language/lib/lib*.d.ts",
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;
const astroTypes = import.meta.glob("./astro-types/**/*.d.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const astroConfigs = import.meta.glob("./astro-types/tsconfigs/*.json", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const files = new Map<string, string>();
const sources = new Map<
  string,
  { text: string; map?: TraceMap; ranges?: { start: number; end: number }[] }
>();
const versions = new Map<string, number>();
let service: ts.LanguageService;
let options: ts.CompilerOptions;
let projectVersion = 0;
// The package ships Node declarations but Vite selects its browser export.
const browserCompiler = compiler as typeof compiler & {
  initialize(options: { wasmURL: string }): Promise<void>;
};
const ready = browserCompiler.initialize({ wasmURL });
const root = "/project/";
const normalize = (path: string) => new URL(path, "file:///project/").pathname;
const virtual = (path: string) =>
  path.endsWith(".astro") ? `${path}.tsx` : path;
const original = (path: string) =>
  path.endsWith(".astro.tsx") ? path.slice(0, -4) : path;

function position(text: string, offset: number) {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length, column: before.at(-1)!.length };
}
function offset(text: string, line: number, column: number) {
  const lines = text.split("\n");
  return (
    lines
      .slice(0, Math.max(0, line - 1))
      .reduce((sum, line) => sum + line.length + 1, 0) + column
  );
}
function generatedOffset(path: string, sourceOffset: number) {
  const source = sources.get(path)!;
  if (!source.map) return sourceOffset;
  const point = position(source.text, sourceOffset);
  const generated = generatedPositionFor(source.map, {
    source: source.map.sources[0]!,
    ...point,
    bias: GREATEST_LOWER_BOUND,
  });
  if (generated.line === null) return undefined;
  const mapped = originalPositionFor(source.map, {
    line: generated.line,
    column: generated.column!,
  });
  const delta =
    mapped.line === point.line
      ? Math.max(0, point.column - (mapped.column ?? point.column))
      : 0;
  const generatedText = files.get(virtual(path))!;
  const generatedStart = offset(
    generatedText,
    generated.line,
    generated.column!,
  );
  const sourceStart =
    mapped.line !== null && mapped.column !== null
      ? offset(source.text, mapped.line, mapped.column)
      : sourceOffset;
  // Interpolate only across text copied verbatim, never across synthetic TSX.
  return (
    generatedStart +
    (source.text.slice(sourceStart, sourceStart + delta) ===
    generatedText.slice(generatedStart, generatedStart + delta)
      ? delta
      : 0)
  );
}
function sourceRange(path: string, start: number, length: number) {
  const source = sources.get(path);
  if (!source) return undefined;
  if (!source.map) return { start, end: start + length };
  if (
    !source.ranges?.some((range) => start >= range.start && start < range.end)
  )
    return undefined;
  const text = files.get(virtual(path))!;
  const a = originalPositionFor(source.map, position(text, start));
  const b = originalPositionFor(source.map, position(text, start + length));
  if (a.line === null || a.column === null) return undefined;
  const from = offset(source.text, a.line, a.column);
  const to =
    b.line !== null && b.column !== null
      ? offset(source.text, b.line, b.column)
      : from + 1;
  return { start: from, end: Math.max(from + 1, to) };
}

async function update(path: string, text: string) {
  const full = normalize(path);
  if (sources.get(full)?.text === text) return;
  let code = text;
  let map: TraceMap | undefined;
  let ranges: { start: number; end: number }[] | undefined;
  if (full.endsWith(".astro")) {
    await ready;
    const converted = await compiler.convertToTSX(text, { filename: full });
    code = converted.code;
    map = new TraceMap(JSON.stringify(converted.map));
    ranges = [converted.metaRanges.frontmatter, converted.metaRanges.body];
  }
  sources.set(full, { text, map, ranges });
  files.set(virtual(full), code);
  versions.set(virtual(full), (versions.get(virtual(full)) ?? 0) + 1);
  projectVersion++;
}

function createService() {
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => options,
    getCurrentDirectory: () => "/project",
    getDefaultLibFileName: () => "/lib/lib.es2022.full.d.ts",
    getScriptFileNames: () =>
      [...files.keys()].filter(
        (p) => p.startsWith(root) && /\.[cm]?[jt]sx?$/.test(p),
      ),
    getScriptVersion: (path) => String(versions.get(path) ?? 0),
    getProjectVersion: () => String(projectVersion),
    getScriptSnapshot: (path) =>
      files.has(path)
        ? ts.ScriptSnapshot.fromString(files.get(path)!)
        : undefined,
    fileExists: (path) => files.has(path),
    readFile: (path) => files.get(path),
    readDirectory: () => [...files.keys()],
    directoryExists: (path) =>
      [...files.keys()].some((file) =>
        file.startsWith(path.replace(/\/$/, "") + "/"),
      ),
    getDirectories: () => [],
    resolveModuleNames: (names, containing) =>
      names.map((name) => {
        const resolved = ts.resolveModuleName(
          name,
          containing,
          options,
          host,
        ).resolvedModule;
        if (resolved) return resolved;
        // TypeScript doesn't know .astro. Reuse its paths/baseUrl resolution by
        // trying the corresponding generated TSX file, which exports typed Props.
        if (name.endsWith(".astro"))
          return ts.resolveModuleName(`${name}.tsx`, containing, options, host)
            .resolvedModule;
        return undefined;
      }),
  };
  service = ts.createLanguageService(host);
}

async function handle(message: any) {
  if (message.method === "init") {
    service?.dispose();
    files.clear();
    sources.clear();
    versions.clear();
    for (const [path, text] of Object.entries(libraries))
      files.set(`/lib/${path.split("/").pop()}`, text);
    for (const [path, text] of Object.entries({
      ...astroTypes,
      ...astroConfigs,
    }))
      files.set(
        `/project/node_modules/astro/${path.replace("./astro-types/", "")}`,
        text,
      );
    files.set(
      "/project/node_modules/astro/jsx-runtime.d.ts",
      "import './astro-jsx.js'; export import JSX = astroHTML.JSX;",
    );
    files.set(
      "/project/editor-env.d.ts",
      `declare const Fragment: unknown;
declare module 'astro' { export interface AstroGlobal<P = Record<string, unknown>, C = unknown> { props: P; self: C; params: Record<string, string | undefined>; url: URL; request: Request; site: URL | undefined; generator: string; response: ResponseInit & {readonly headers: Headers}; redirect(path: string, status?: number): Response; slots: {has(name: string): boolean; render(name: string, args?: unknown[]): Promise<string>}; } }
`,
    );
    for (const [path, text] of Object.entries(
      message.files as Record<string, string>,
    ))
      await update(path, text);
    const configText =
      message.files["tsconfig.json"] ?? message.files["jsconfig.json"] ?? "{}";
    const config =
      ts.parseConfigFileTextToJson("tsconfig.json", configText).config ?? {};
    const configured = ts.parseJsonConfigFileContent(
      config,
      {
        useCaseSensitiveFileNames: true,
        readFile: (path) => files.get(path),
        fileExists: (path) => files.has(path),
        readDirectory: (path) =>
          [...files.keys()].filter((file) => file.startsWith(path)),
      },
      "/project",
    );
    options = {
      target: ts.ScriptTarget.ES2022,
      strict: true,
      allowJs: true,
      allowNonTsExtensions: true,
      skipLibCheck: true,
      ...configured.options,
      noEmit: true,
      jsx: ts.JsxEmit.Preserve,
      jsxImportSource: "astro",
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    };
    createService();
    return {
      files: sources.size,
      extendedConfig: configured.errors.some((error) => error.code !== 18003),
    };
  }
  if (message.method === "update") {
    await update(message.path, message.text);
    return true;
  }
  const path = normalize(message.path);
  const file = virtual(path);
  if (!sources.has(path)) return [];
  if (!/\.[cm]?[jt]sx?$/.test(file)) return [];
  if (message.method === "diagnostics") {
    return [
      ...service.getSyntacticDiagnostics(file),
      ...service.getSemanticDiagnostics(file),
    ].flatMap((d) => {
      const range = sourceRange(path, d.start ?? 0, d.length ?? 1);
      return range
        ? [
            {
              ...range,
              message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
              code: d.code,
              error: d.category === ts.DiagnosticCategory.Error,
            },
          ]
        : [];
    });
  }
  const at = generatedOffset(path, message.offset);
  if (at === undefined) return message.method === "completions" ? [] : null;
  if (message.method === "completions") {
    const result = service.getCompletionsAtPosition(file, at, {
      includeCompletionsForModuleExports: false,
      includeCompletionsWithInsertText: true,
    });
    return (
      result?.entries
        .filter(
          (e) => !e.name.includes("__Astro") && !e.name.startsWith("__astro"),
        )
        .map((e) => ({
          label: e.name,
          kind: e.kind,
          sortText: e.sortText,
          insertText: e.insertText ?? e.name,
          range: e.replacementSpan
            ? sourceRange(
                path,
                e.replacementSpan.start,
                e.replacementSpan.length,
              )
            : undefined,
        })) ?? []
    );
  }
  if (message.method === "hover") {
    const info = service.getQuickInfoAtPosition(file, at);
    return info
      ? {
          text: ts.displayPartsToString(info.displayParts),
          documentation: ts.displayPartsToString(info.documentation),
          range: sourceRange(path, info.textSpan.start, info.textSpan.length),
        }
      : null;
  }
  return null;
}

// Conversion is async, but TypeScript's virtual filesystem must be updated
// atomically before a following completion/diagnostic request is answered.
let queue = Promise.resolve();
self.onmessage = (event) => {
  const message = event.data;
  queue = queue.then(async () => {
    try {
      self.postMessage({ id: message.id, result: await handle(message) });
    } catch (error) {
      self.postMessage({
        id: message.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
};
