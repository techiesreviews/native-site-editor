import { monaco } from "../components/monaco";
import type { TreeEntry } from "../../shared/types";

export interface ProjectContext {
  key: string;
  repo: string;
  entries: TreeEntry[];
  onSessionExpired?: () => void;
}
type Observed = {
  path: string;
  model: monaco.editor.ITextModel;
  dispose: () => void;
};
let active: Project | undefined;
const markerOwner = "astro-project";

async function indexProject(context: ProjectContext, signal: AbortSignal) {
  const result: Record<string, string> = {};
  const entries: TreeEntry[] = [];
  let directories = 0;
  async function api(path: string, sha: string) {
    const response = await fetch(
      `/api/${path}?${new URLSearchParams({ repo: context.repo, sha })}`,
      { credentials: "same-origin", signal },
    );
    const data = await response.json();
    if (response.status === 401) context.onSessionExpired?.();
    if (!response.ok)
      throw new Error(data.error ?? "Could not index project files.");
    return data;
  }
  async function walk(list: TreeEntry[], prefix = "") {
    for (const entry of list) {
      const path = prefix + entry.path;
      if (entry.type === "tree") {
        if (
          /^(node_modules|dist|\.git|\.astro|\.vercel|\.cache|public)$/.test(
            entry.path,
          )
        )
          continue;
        if (++directories > 100)
          throw new Error(
            "Project intelligence supports up to 100 source folders.",
          );
        await walk((await api("tree", entry.sha)).entries, path + "/");
      } else if (
        entry.mode !== "120000" &&
        (/\.(astro|[cm]?[jt]sx?)$/.test(path) ||
          /(^|\/)(tsconfig[^/]*|jsconfig|package)\.json$/.test(path))
      ) {
        if (entries.length >= 200)
          throw new Error(
            "Project intelligence supports up to 200 source files.",
          );
        if ((entry.size ?? 0) > 128 * 1024)
          throw new Error(`Project file exceeds the indexing limit: ${path}`);
        entries.push({ ...entry, path });
      }
    }
  }
  await walk(context.entries);
  let next = 0,
    bytes = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < entries.length) {
        const entry = entries[next++];
        const { content } = await api("file", entry.sha);
        bytes += new TextEncoder().encode(content).length;
        if (bytes > 3 * 1024 * 1024)
          throw new Error(
            "Project intelligence supports up to 3 MB of source.",
          );
        result[entry.path] = content;
      }
    }),
  );
  return result;
}

class Project {
  worker = new Worker(new URL("./project.worker.ts", import.meta.url), {
    type: "module",
  });
  models = new Map<string, Observed>();
  listeners = new Set<(status: string) => void>();
  pending = new Map<
    number,
    { resolve: (result: any) => void; reject: (error: Error) => void }
  >();
  abort = new AbortController();
  sequence = 0;
  revision = 0;
  status = "Indexing project…";
  ready: Promise<void>;
  timer: ReturnType<typeof setTimeout> | undefined;
  constructor(public context: ProjectContext) {
    this.worker.onmessage = (event) => {
      const { id, result, error } = event.data;
      const request = this.pending.get(id);
      this.pending.delete(id);
      if (error) request?.reject(new Error(error));
      else request?.resolve(result);
    };
    this.worker.onerror = () =>
      this.fail(new Error("The project language worker could not start."));
    this.ready = indexProject(context, this.abort.signal)
      .then(async (files) => {
        for (const entry of this.models.values())
          files[entry.path] = entry.model.getValue();
        const result = await this.call("init", { files });
        this.setStatus(
          `Project intelligence · ${result.files} files${result.extendedConfig ? " · inherited config limited" : ""}`,
        );
      })
      .catch((error) => {
        this.setStatus(`Project intelligence unavailable: ${error.message}`);
        throw error;
      });
    // Provider calls have their own fallback; this also handles failures before a view attaches.
    void this.ready.catch(() => {});
  }
  call(method: string, params: Record<string, unknown> = {}): Promise<any> {
    if (this.abort.signal.aborted)
      return Promise.reject(new Error("Project closed"));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, method, ...params });
    });
  }
  setStatus(status: string) {
    this.status = status;
    this.listeners.forEach((listener) => listener(status));
  }
  fail(error: Error) {
    this.setStatus(error.message);
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }
  observe(path: string, model: monaco.editor.ITextModel) {
    const uri = model.uri.toString();
    if (this.models.has(uri)) return;
    const change = model.onDidChangeContent(() => this.schedule());
    const disposal = model.onWillDispose(() => {
      change.dispose();
      disposal.dispose();
      this.models.delete(uri);
    });
    this.models.set(uri, {
      path,
      model,
      dispose: () => {
        change.dispose();
        disposal.dispose();
      },
    });
    this.schedule();
  }
  schedule() {
    const revision = ++this.revision;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.validate(revision), 300);
  }
  async sync() {
    await this.ready;
    for (const entry of this.models.values()) {
      if (!entry.model.isDisposed())
        await this.call("update", {
          path: entry.path,
          text: entry.model.getValue(),
        });
    }
  }
  async validate(revision: number) {
    try {
      await this.sync();
      for (const entry of this.models.values()) {
        const version = entry.model.getVersionId();
        const diagnostics = await this.call("diagnostics", {
          path: entry.path,
        });
        if (
          revision !== this.revision ||
          entry.model.isDisposed() ||
          version !== entry.model.getVersionId()
        )
          continue;
        monaco.editor.setModelMarkers(
          entry.model,
          markerOwner,
          diagnostics.map((d: any) => ({
            ...range(entry.model, d),
            message: d.message,
            code: String(d.code),
            source: "Astro project",
            severity: d.error
              ? monaco.MarkerSeverity.Error
              : monaco.MarkerSeverity.Warning,
          })),
        );
      }
    } catch (error) {
      if (!this.abort.signal.aborted)
        this.setStatus(
          `Project intelligence unavailable: ${(error as Error).message}`,
        );
    }
  }
  dispose() {
    this.abort.abort();
    clearTimeout(this.timer);
    this.worker.terminate();
    for (const entry of this.models.values()) {
      entry.dispose();
      if (!entry.model.isDisposed())
        monaco.editor.setModelMarkers(entry.model, markerOwner, []);
    }
    this.models.clear();
    this.listeners.clear();
    this.fail(new Error("Project closed"));
  }
}

function range(
  model: monaco.editor.ITextModel,
  span: { start: number; end: number },
) {
  const start = model.getPositionAt(span.start),
    end = model.getPositionAt(span.end);
  return new monaco.Range(
    start.lineNumber,
    start.column,
    end.lineNumber,
    end.column,
  );
}

export function connectProject(
  context: ProjectContext,
  models: { path: string; model: monaco.editor.ITextModel }[],
  listener: (status: string) => void,
) {
  if (active?.context.key !== context.key) {
    active?.dispose();
    active = new Project(context);
  }
  const project = active!;
  models.forEach((entry) => project.observe(entry.path, entry.model));
  project.listeners.add(listener);
  listener(project.status);
  return () => project.listeners.delete(listener);
}
export function closeProject() {
  active?.dispose();
  active = undefined;
}

// The standalone TS worker only sees one model. Project diagnostics below
// replace it so valid imports don't receive contradictory missing-module errors.
monaco.typescript.typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: true,
});
monaco.typescript.javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: true,
});

async function query(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  method: string,
) {
  const project = active,
    observed = project?.models.get(model.uri.toString());
  if (!project || !observed) return null;
  const version = model.getVersionId();
  await project.sync();
  const result = await project.call(method, {
    path: observed.path,
    offset: model.getOffsetAt(position),
  });
  return !model.isDisposed() &&
    version === model.getVersionId() &&
    active === project
    ? result
    : null;
}
monaco.languages.registerCompletionItemProvider(
  ["astro", "typescript", "javascript"],
  {
    triggerCharacters: [".", " ", "<", ":", '"', "'"],
    async provideCompletionItems(model, position) {
      try {
        const entries = await query(model, position, "completions");
        const word = model.getWordUntilPosition(position);
        return {
          suggestions: (entries ?? []).map((entry: any) => ({
            label: entry.label,
            insertText: entry.insertText,
            sortText: entry.sortText,
            detail: "Project type information",
            kind:
              entry.kind === "property"
                ? monaco.languages.CompletionItemKind.Property
                : entry.kind === "method"
                  ? monaco.languages.CompletionItemKind.Method
                  : monaco.languages.CompletionItemKind.Variable,
            range: entry.range
              ? range(model, entry.range)
              : new monaco.Range(
                  position.lineNumber,
                  word.startColumn,
                  position.lineNumber,
                  word.endColumn,
                ),
          })),
        };
      } catch {
        return { suggestions: [] };
      }
    },
  },
);
monaco.languages.registerHoverProvider(["astro", "typescript", "javascript"], {
  async provideHover(model, position) {
    try {
      const result = await query(model, position, "hover");
      return result
        ? {
            range: result.range ? range(model, result.range) : undefined,
            contents: [
              {
                value:
                  "```typescript\n" + result.text.replace(/```/g, "") + "\n```",
                isTrusted: false,
              },
              { value: result.documentation, isTrusted: false },
            ],
          }
        : null;
    } catch {
      return null;
    }
  },
});
