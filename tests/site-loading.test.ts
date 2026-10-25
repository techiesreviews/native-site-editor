import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { signal } from "@preact/signals-core";
import { CleanSourceCache } from "../src/clean-source-cache.ts";
import type { DraftScope } from "../src/drafts.ts";
import { createNativeSiteRuntime } from "../src/native-site-runtime.ts";
import type { SiteLoadingPorts } from "../src/site-loading.ts";
import { createWorkspaceSession, type SessionStamp } from "../src/workspace-session.ts";
import type { NativeSite } from "../shared/native-project.ts";
import type { Repository, Snapshot, TreeEntry } from "../shared/types.ts";
import { forEachAwait, type AwaitRace } from "./support/await-race.ts";

// The GitHub reads behind site loading import the editor's icons (a stylesheet and raw SVGs).
registerHooks({ load: (url, context, next) => (/\.css$|\?raw$/.test(url) ? { format: "module", source: "export default '';", shortCircuit: true } : next(url, context)) });
const { ApiError } = await import("../src/github-reads.ts");
const { createSiteLoading } = await import("../src/site-loading.ts");

const SHA = "a".repeat(40);
const REPO = { id: 1, name: "site", full_name: "o/site", private: false, default_branch: "main", owner: { login: "o", type: "User" } } satisfies Repository;
const SCOPE = { account: "o", repoId: 1, repo: "o/site", branch: "main" } satisfies DraftScope;
const TEXTS: Record<string, string> = {
  "index.html": '<html><head><title>Welcome</title><link rel="stylesheet" href="/style.css"></head><body><h1>Home</h1></body></html>',
  "about.html": "<html><head><title>About us</title></head><body><h1>About</h1></body></html>",
  "style.css": "body { color: red; }",
  "components/site-card.html": "<article>Card</article>",
  "components/site-card.css": "article { margin: 0; }",
  "theme.css": "h1 { color: blue; }",
  "fonts.css": '@font-face { font-family: Body; src: url("font.woff2"); }',
  "font.woff2": "",
};
const shaOf = (path: string) => `${path}-sha`;
const pathOf = new Map(Object.keys(TEXTS).map((path) => [shaOf(path), path]));
const entryOf = (path: string) => ({ path, mode: "100644", type: "blob", sha: shaOf(path) }) satisfies TreeEntry;
const snapshotOf = (paths: string[]) => ({ branch: "main", commit: SHA, entries: paths.map(entryOf) }) satisfies Snapshot;

// A real runtime, session and file readers over the files above; GitHub, the preview and the host record what they were asked.
// `race` (set later) wraps GitHub's reads, so a test can disturb the work at each of them (tests/support/await-race.ts).
// `home` replaces the home page's text; `linked` is the stylesheets the pages link, as the host finds them.
function setup(paths = Object.keys(TEXTS).filter((path) => !path.startsWith("font")), options: { refused?: string[]; home?: string } = {}) {
  const texts: Record<string, string> = { ...TEXTS, ...(options.home ? { "index.html": options.home } : {}) }, linked = ["style.css"];
  const raced: { race?: AwaitRace } = {};
  const wrap = <Args extends unknown[], Value>(name: string, work: (...args: Args) => Promise<Value>) => (...args: Args) => (raced.race ? raced.race.port(name, work)(...args) : work(...args));
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
  let view: { path: string } | undefined, scope: DraftScope | undefined;
  const label = { textContent: "", dataset: {} as Record<string, string> };
  const read = async (action: string, params?: Record<string, string>): Promise<unknown> => {
    const shas = action === "files" ? params!.shas.split(",") : [params!.sha];
    fetched.push(shas.map((sha) => pathOf.get(sha)!));
    if (shas.some((sha) => options.refused?.includes(pathOf.get(sha)!))) throw new ApiError(415, "This file is not UTF-8 text.");
    const files = Object.fromEntries(shas.map((sha) => [sha, texts[pathOf.get(sha)!]]));
    return action === "files" ? { files } : { content: files[shas[0]] };
  };
  const reading = wrap("api", read);
  // eslint-disable-next-line no-restricted-syntax -- the stand-in answers both reads site loading makes; each caller names its own type.
  const api = <T,>(action: string, params?: Record<string, string>) => reading(action, params) as Promise<T>;
  const entry = (path: string): TreeEntry | undefined => (paths.includes(path) ? entryOf(path) : undefined);
  const ports = {
    runtime, appStore, workspaceSession, api, cleanSources: new CleanSourceCache(() => "o"),
    repositoryIndex: { listRepositoryFiles: wrap("list", async () => paths) },
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
    draftScope: () => scope,
    findEntry: wrap("find", async (path: string) => entry(path)),
    entryAt: entry,
    nativeLinkedSheets: () => linked,
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
  return { loading, runtime, appStore, workspaceSession, snapshot, calls, fetched, started, preview, label, raced, linked,
    setView: (path?: string) => { view = path ? { path } : undefined; }, setScope: (value?: DraftScope) => { scope = value; } };
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

test("opening a site writes nothing once another load takes over, at every read", async () => {
  const points = await forEachAwait((race) => {
    const run = setup();
    run.raced.race = race;
    return { ...run, done: run.loading.activateNativeSite(REPO, run.snapshot, run.workspaceSession.begin()) };
  }, (run) => { run.workspaceSession.next(undefined); }, (run) => {
    assert.equal(run.runtime.site, undefined);
    assert.equal(run.preview.updated, undefined);
    assert.deepEqual(run.started, []);
    assert.equal(run.calls.includes("agent"), false);
  });
  assert.ok(points >= 3, `${points} reads`);
});

test("component styles read for a load that was left are not taken up, at every read", async () => {
  await forEachAwait((race) => {
    const run = setup();
    const before = { styles: new Map<string, string>(), sources: new Map<string, string>() };
    const done = (async () => {
      await run.loading.activateNativeSite(REPO, run.snapshot, run.workspaceSession.begin());
      before.styles = new Map(run.runtime.state.componentStyles);
      before.sources = new Map(run.runtime.base.sources);
      run.calls.length = 0;
      run.raced.race = race;
      await run.loading.loadNativeComponentStyles(["site-card"]);
    })();
    return { ...run, before, done };
  }, (run) => { run.workspaceSession.next(undefined); }, (run) => {
    assert.deepEqual(run.runtime.state.componentStyles, run.before.styles);
    // GitHub's layer is the clean cache's own Map: compared by its entries.
    assert.deepEqual(new Map(run.runtime.base.sources), run.before.sources);
    assert.equal(run.calls.includes("sources"), false);
  });
});

test("before the first paint only the page's fonts are read, each once from /api/blob", async (t: TestContext) => {
  const fetches: string[] = [];
  const fetch = globalThis.fetch;
  globalThis.fetch = async (url) => { fetches.push(String(url)); return new Response(new Uint8Array([1, 2, 3])); };
  t.after(() => { globalThis.fetch = fetch; });
  const { loading, runtime } = setup([...Object.keys(TEXTS)]);
  const shown: string[] = [];
  await loading.loadNativeAssets({ "fonts.css": TEXTS["fonts.css"] }, () => { shown.push("assets"); }, () => true, true);
  assert.deepEqual(fetches, [`/api/blob?repo=o%2Fsite&sha=${shaOf("font.woff2")}&type=woff2`]);
  assert.match(runtime.state.assets.get("font.woff2") ?? "", /^data:font\/woff2;base64,/);
  assert.ok(shown.length > 0);
  await loading.loadNativeAssets({ "fonts.css": TEXTS["fonts.css"] }, () => {}, () => true, true);
  assert.equal(fetches.length, 1, "a read font is not read again");
});

test("drafted images are forgotten after files change, and the preview takes the sources once", async () => {
  const { loading, runtime, workspaceSession, snapshot, calls } = setup();
  await loading.activateNativeSite(REPO, snapshot, workspaceSession.begin());
  runtime.state.assets.set("logo.png", "data:image/png;base64,AA").set("photo.jpg", "data:image/jpeg;base64,AA");
  runtime.state.draftAssets.add("logo.png");
  calls.length = 0;
  loading.forgetDraftedAssets();
  assert.deepEqual([...runtime.state.assets.keys()], ["photo.jpg"]);
  assert.equal(runtime.state.draftAssets.size, 0);
  assert.deepEqual(calls, ["sources"]);
});

test("Download site has nothing to give without an open site, and the site's files with one", async () => {
  const { loading, runtime, workspaceSession, snapshot, setScope } = setup();
  // The draft scope follows the open: the home page check reads the real draft store with one.
  setScope(SCOPE);
  assert.equal(await loading.nativeSiteFiles(), undefined);
  setScope(undefined);
  await loading.activateNativeSite(REPO, snapshot, workspaceSession.begin());
  setScope(SCOPE);
  const files = await loading.nativeSiteFiles();
  assert.equal(files?.repository, "o/site");
  assert.deepEqual(files?.paths, runtime.files(SCOPE));
  assert.equal(files?.held("index.html"), TEXTS["index.html"]);
});

test("the page on show's files and stylesheets read for a load that was left are not taken up, at every read", async () => {
  for (const [what, load, path] of [["shown files", (run: ReturnType<typeof setup>) => run.loading.loadNativeShownFiles("/about.html"), "about.html"],
    ["stylesheets", (run: ReturnType<typeof setup>) => { run.linked.push("theme.css"); return run.loading.loadNativeStyleFiles(); }, "theme.css"]] as const) {
    await forEachAwait((race) => {
      const run = setup();
      const done = (async () => {
        await run.loading.activateNativeSite(REPO, run.snapshot, run.workspaceSession.begin());
        run.calls.length = 0;
        run.raced.race = race;
        await load(run);
      })();
      return { ...run, done };
    }, (run) => { run.workspaceSession.next(undefined); }, (run) => {
      assert.equal(run.runtime.base.sources.has(path), false, what);
      assert.equal(run.calls.includes("sources"), false, what);
    });
  }
});

test("a font that never arrives holds the first paint back 300 ms at most, and is not kept once the load is left", async (t: TestContext) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let answer: ((response: Response) => void) | undefined;
  const fetch = globalThis.fetch;
  globalThis.fetch = () => new Promise<Response>((resolve) => { answer = resolve; });
  t.after(() => { globalThis.fetch = fetch; });
  const settle = async () => { for (let turn = 0; turn < 20; turn++) await new Promise((resolve) => setImmediate(resolve)); };
  const home = TEXTS["index.html"].replace("/style.css", "/fonts.css");
  const { loading, runtime, workspaceSession, snapshot, started, linked } = setup(Object.keys(TEXTS), { home });
  // As the host finds it: the home page links fonts.css.
  linked.splice(0, linked.length, "fonts.css");
  let opened: boolean | undefined;
  void loading.activateNativeSite(REPO, snapshot, workspaceSession.begin()).then((value) => { opened = value; });
  await settle();
  assert.ok(answer, "the font is being read");
  assert.equal(opened, undefined, "the paint waits for the font");
  t.mock.timers.tick(299);
  await settle();
  assert.equal(opened, undefined);
  t.mock.timers.tick(1);
  await settle();
  assert.equal(opened, true);
  assert.ok(runtime.site);
  assert.deepEqual(started, [{ request: runtime.state.request, deferred: true }]);
  workspaceSession.next(undefined);
  answer!(new Response(new Uint8Array([1, 2, 3])));
  await settle();
  assert.equal(runtime.state.assets.has("font.woff2"), false);
});
