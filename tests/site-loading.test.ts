import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { signal } from "@preact/signals-core";
import { CleanSourceCache } from "../src/clean-source-cache.ts";
import { createNativeSiteRuntime } from "../src/native-site-runtime.ts";
import type { SiteLoadingPorts } from "../src/site-loading.ts";
import { createWorkspaceSession, type SessionStamp } from "../src/workspace-session.ts";
import type { NativeSite } from "../shared/native-project.ts";
import type { Repository, Snapshot, TreeEntry } from "../shared/types.ts";

// The GitHub reads behind site loading import the editor's icons (a stylesheet and raw SVGs).
registerHooks({ load: (url, context, next) => (/\.css$|\?raw$/.test(url) ? { format: "module", source: "export default '';", shortCircuit: true } : next(url, context)) });
const { ApiError } = await import("../src/github-reads.ts");
const { createSiteLoading } = await import("../src/site-loading.ts");

const SHA = "a".repeat(40);
const REPO = { full_name: "o/site" } as Repository;
const TEXTS: Record<string, string> = {
  "index.html": '<html><head><title>Welcome</title><link rel="stylesheet" href="/style.css"></head><body><h1>Home</h1></body></html>',
  "about.html": "<html><head><title>About us</title></head><body><h1>About</h1></body></html>",
  "style.css": "body { color: red; }",
  "components/site-card.html": "<article>Card</article>",
  "components/site-card.css": "article { margin: 0; }",
};
const shaOf = (path: string) => `${path}-sha`;
const pathOf = new Map(Object.keys(TEXTS).map((path) => [shaOf(path), path]));
const entryOf = (path: string) => ({ path, mode: "100644", type: "blob", sha: shaOf(path) }) satisfies TreeEntry;
const snapshotOf = (paths: string[]) => ({ branch: "main", commit: SHA, entries: paths.map(entryOf) }) satisfies Snapshot;

// A real runtime, session and file readers over the files above; GitHub, the preview and the host record what they were asked.
function setup(paths = Object.keys(TEXTS), options: { refused?: string[] } = {}) {
  const calls: string[] = [], fetched: string[][] = [], started: { request: number; deferred?: boolean }[] = [];
  const preview: { warnings?: unknown[]; unreadable?: ReadonlyMap<string, string>; activated?: NativeSite; error?: string; updated?: Record<string, string> } = {};
  const runtime = createNativeSiteRuntime({
    scope: () => undefined, shown: () => undefined, drafts: () => ({ get: () => undefined, list: () => [] }), mounted: () => undefined,
    clean: new CleanSourceCache(() => "o"), textKey: () => "", route: () => "/", openFile: () => undefined, pageStyles: () => [],
    find: async () => undefined, readTexts: async () => ({ texts: new Map(), unreadable: [] }), unreadable: () => {}, changed: () => {}, closed: () => {},
  });
  const snapshot = snapshotOf(paths);
  const appStore = { repository: signal<Repository | undefined>(REPO), snapshot: signal<Snapshot | undefined>(snapshot), openFile: signal<string | undefined>(undefined) };
  const workspaceSession = createWorkspaceSession();
  let view: { path: string } | undefined;
  const label = { textContent: "", dataset: {} as Record<string, string> };
  const api = async <T,>(action: string, params?: Record<string, string>): Promise<T> => {
    const shas = action === "files" ? params!.shas.split(",") : [params!.sha];
    fetched.push(shas.map((sha) => pathOf.get(sha)!));
    if (shas.some((sha) => options.refused?.includes(pathOf.get(sha)!))) throw new ApiError(415, "This file is not UTF-8 text.");
    const files = Object.fromEntries(shas.map((sha) => [sha, TEXTS[pathOf.get(sha)!]]));
    return (action === "files" ? { files } : { content: files[shas[0]] }) as T;
  };
  const entry = (path: string): TreeEntry | undefined => (paths.includes(path) ? entryOf(path) : undefined);
  const ports = {
    runtime, appStore, workspaceSession, api, cleanSources: new CleanSourceCache(() => "o"),
    repositoryIndex: { listRepositoryFiles: async () => paths },
    nativePreview: {
      preload: () => {}, activate: (site: NativeSite) => { preview.activated = site; }, update: (update: { sources: Record<string, string> }) => { preview.updated = update.sources; },
      setAssets: () => {}, setError: (message: string | undefined) => { preview.error = message; }, setWarnings: (warnings: unknown[]) => { preview.warnings = warnings; },
      setUnreadable: (unreadable: ReadonlyMap<string, string>) => { preview.unreadable = unreadable; }, route: () => "/", shownRoute: () => undefined,
    },
    pageStructure: { refreshMeta: () => { calls.push("meta"); } },
    previewSelection: { editableTemplatePath: () => undefined },
    versions: { get view() { return view; } },
    // The top bar's page label, the only element site loading writes.
    // eslint-disable-next-line no-restricted-syntax -- the stand-in implements only what the label writes.
    element: <T extends HTMLElement>() => label as unknown as T,
    draftScope: () => undefined,
    findEntry: async (path: string) => entry(path),
    entryAt: entry,
    nativeLinkedSheets: () => ["style.css"],
    updateNativePreviewSources: () => { calls.push("sources"); },
    updateNativePreviewAssets: () => {},
    nativeModeActive: () => Boolean(runtime.site),
    withSiteConfig: (sources: Record<string, string>) => sources,
    nativeRouteForPath: (path: string | undefined) => Object.entries(runtime.site?.routes ?? {}).find(([, file]) => file === path)?.[0],
    nativeRouteInfo: (route: string) => ({ title: /<title>(.*)<\/title>/.exec(runtime.source(runtime.site!.routes[route]) ?? "")?.[1] }),
    updateAgentContext: () => { calls.push("agent"); },
    startNativeTextIndex: (_repo: Repository, _site: NativeSite, _scope: unknown, _at: SessionStamp, request: number, deferred?: boolean) => { started.push({ request, deferred }); },
  } satisfies SiteLoadingPorts;
  const loading = createSiteLoading(ports);
  return { loading, runtime, appStore, workspaceSession, snapshot, calls, fetched, started, preview, label, setView: (path?: string) => { view = path ? { path } : undefined; } };
}

test("a repository without a home page does not open as a site", async () => {
  const { loading, runtime, workspaceSession, snapshot, fetched } = setup(["about.html", "style.css"]);
  assert.equal(await loading.activateNativeSite(REPO, snapshot, workspaceSession.begin()), false);
  assert.equal(runtime.engaged, false);
  assert.deepEqual(fetched, []);
});

test("opening a site reads only what the page on show needs, draws it and leaves the rest to the text index", async () => {
  const { loading, runtime, appStore, workspaceSession, snapshot, fetched, started, preview, label, calls } = setup();
  appStore.openFile.value = "index.html";
  assert.equal(await loading.activateNativeSite(REPO, snapshot, workspaceSession.begin(), "index.html"), true);
  assert.equal(runtime.engaged, true);
  // The home page in the first read, then the stylesheet it links; neither About nor the component.
  assert.deepEqual(fetched, [["index.html"], ["style.css"]]);
  assert.deepEqual(Object.keys(runtime.site!.routes).sort(), ["/", "/about.html"]);
  assert.equal(preview.activated, runtime.site);
  assert.equal(preview.error, undefined);
  assert.equal(preview.updated?.["style.css"], TEXTS["style.css"]);
  assert.deepEqual(started, [{ request: runtime.state.request, deferred: true }]);
  assert.deepEqual(calls, ["meta", "agent"]);
  assert.equal(label.textContent, "Home");
  assert.equal(label.dataset.path, "index.html");
});

test("the top bar names a page by its title once read, and any other file by its path", async () => {
  const { loading, runtime, appStore, workspaceSession, snapshot, label } = setup();
  await loading.activateNativeSite(REPO, snapshot, workspaceSession.begin());
  runtime.base.sources.set("about.html", TEXTS["about.html"]);
  appStore.openFile.value = "about.html";
  loading.updateCurrentPageLabel();
  assert.equal(label.textContent, "About us");
  appStore.openFile.value = "style.css";
  loading.updateCurrentPageLabel();
  assert.equal(label.textContent, "style.css");
  appStore.openFile.value = undefined;
  loading.updateCurrentPageLabel();
  assert.equal(label.textContent, "Select a page");
  assert.equal(label.dataset.path, undefined);
});

test("a page the page on show needs that cannot be read as text fails the open with its path", async () => {
  const { loading, workspaceSession, snapshot, preview, started } = setup(undefined, { refused: ["index.html"] });
  assert.equal(await loading.activateNativeSite(REPO, snapshot, workspaceSession.begin()), true);
  assert.match(preview.error ?? "", /^index\.html: /);
  assert.deepEqual(started, []);
});

test("a stylesheet that cannot be read as text is left out with a warning; a forgotten one clears it", () => {
  const { loading, preview, setView } = setup();
  loading.noteNativeUnreadable([{ path: "style.css", message: "Not UTF-8." }, { path: "about.html", message: "Too big." }]);
  assert.deepEqual(preview.warnings, ["style.css: Not UTF-8. The preview shows the site without it."]);
  assert.deepEqual([...preview.unreadable!.keys()], ["style.css", "about.html"]);
  // History's earlier version of a file stands in for it.
  setView("about.html");
  assert.deepEqual([...loading.nativePreviewUnreadable().keys()], ["style.css"]);
  loading.noteNativeUnreadable(undefined);
  assert.deepEqual(preview.warnings, []);
  assert.equal(preview.unreadable!.size, 0);
});

test("a component's stylesheet and template are read in one request and the preview takes them", async () => {
  const { loading, runtime, workspaceSession, snapshot, fetched, calls } = setup();
  await loading.activateNativeSite(REPO, snapshot, workspaceSession.begin());
  fetched.length = 0; calls.length = 0;
  await loading.loadNativeComponentStyles(["site-card", "no-such-tag"]);
  assert.deepEqual(fetched, [["components/site-card.css", "components/site-card.html"]]);
  assert.equal(runtime.state.componentStyles.get("site-card"), "components/site-card.css");
  assert.equal(runtime.base.sources.get("components/site-card.html"), TEXTS["components/site-card.html"]);
  assert.deepEqual(calls, ["sources"]);
});

test("a blob read twice is fetched once", async () => {
  const { loading, fetched } = setup();
  assert.equal(await loading.readFile("o/site", shaOf("about.html")), TEXTS["about.html"]);
  assert.equal(await loading.readFile("o/site", shaOf("about.html")), TEXTS["about.html"]);
  assert.deepEqual(fetched, [["about.html"]]);
});
