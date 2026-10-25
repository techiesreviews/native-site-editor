import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { createAppStore } from "../src/app-store.ts";
import { CleanSourceCache } from "../src/clean-source-cache.ts";
import { createDraftStore } from "../src/draft-store.ts";
import { draftStore } from "../src/drafts.ts";
import { createNativeSiteRuntime } from "../src/native-site-runtime.ts";
import type { SitePreviewPorts } from "../src/site-preview.ts";
import { NATIVE_CONFIG_PATH, resolveNativeProject } from "../shared/native-project.ts";

// The preview needs a browser: its stylesheet lookup stands in, answering with the page's own links and recording each ask.
const asked: unknown[][] = [];
(globalThis as Record<string, unknown>).sitePreviewStubs = { routeStylesheets: (...args: unknown[]) => { asked.push(args); return args[2] === "/" ? ["style.css"] : []; } };
registerHooks({ load: (url, context, next) => (url.endsWith("/src/components/native-preview.ts")
  ? { format: "module", source: "export const routeStylesheets = (...args) => globalThis.sitePreviewStubs.routeStylesheets(...args);", shortCircuit: true } : next(url, context)) });
const { createSitePreview } = await import("../src/site-preview.ts");

const FILES = ["index.html", "blog/index.html", "blog/post.html", "components/site-header.html", "style.css", "base.css"];
const page = (title: string, sheet = "") => `<html><head><title>${title}</title><meta name="description" content="About ${title}">${sheet}</head><body></body></html>`;

// The preview over the real runtime and app store, with the branch's texts in GitHub's layer; the preview,
// the version on show and the loaders record what they were asked. `late` stands in for main.ts's later state.
function setup() {
  const calls: string[] = [], updates: Record<string, unknown>[] = [], assets: Record<string, string>[] = [];
  const late: { preview: boolean; view?: { path: string; content: string }; template?: string } = { preview: true };
  const runtime = createNativeSiteRuntime({
    scope: () => undefined, shown: () => undefined, drafts: draftStore, mounted: () => undefined, clean: new CleanSourceCache(() => "o"),
    textKey: () => "", route: () => undefined, openFile: () => undefined, pageStyles: () => [], find: async () => undefined,
    readTexts: async () => ({ texts: new Map(), unreadable: [] }), unreadable: () => {}, changed: () => {}, closed: () => {},
  });
  const appStore = createAppStore(createDraftStore());
  const record = (name: string) => async () => { calls.push(name); };
  const ports = {
    runtime, appStore,
    get nativePreview() { return late.preview ? { update: (request: Record<string, unknown>) => { updates.push(request); }, setAssets: (shown: Record<string, string>) => { assets.push(shown); } } : undefined; },
    get versions() { return { check: () => { calls.push("check"); }, view: late.view }; },
    get previewSelection() { return { editableTemplatePath: () => late.template }; },
    nativePreviewUnreadable: () => new Map([["missing.css", "unreadable"]]),
    loadNativeAssets: record("assets"), loadNativeStyleFiles: record("styles"), loadNativeShownFiles: record("shown"),
  } satisfies SitePreviewPorts;
  const preview = createSitePreview(ports);
  const resolved = resolveNativeProject(FILES);
  assert.ok(resolved.ok);
  const sources: Record<string, string> = {
    "index.html": page("Home", '<link rel="stylesheet" href="/style.css">'), "blog/index.html": page("Blog"), "blog/post.html": page("Post"),
    "components/site-header.html": "<header></header>", "style.css": '@import "base.css"; body { color: red; }', "base.css": "body { margin: 0; }",
  };
  for (const [path, text] of Object.entries(sources)) runtime.base.sources.set(path, text);
  // The style files read so far (src/site-loading.ts): what the runtime's sources carry beside pages and templates.
  for (const path of ["style.css", "base.css"]) runtime.state.styleFiles.add(path);
  return { preview, runtime, appStore, site: resolved.site, calls, updates, assets, late };
}

test("without a site nothing is a page or a component, and no preview update is sent", () => {
  const { preview, calls, updates, assets } = setup();
  assert.equal(preview.nativeModeActive(), false);
  assert.equal(preview.nativeRouteForPath("index.html"), undefined);
  assert.equal(preview.nativeComponentTagForPath("components/site-header.html"), undefined);
  assert.equal(preview.nativeFallbackPage("blog/post.html"), undefined);
  assert.deepEqual(preview.nativeRouteInfo("/"), {});
  assert.deepEqual(preview.nativePageStyles(), []);
  preview.updateNativePreview(); preview.updateNativePreviewSources(); preview.updateNativePreviewAssets();
  assert.deepEqual([calls, updates, assets], [[], [], []]);
});

test("a file's route and component, a page's head and the page shown after one is gone", () => {
  const { preview, runtime, site } = setup();
  runtime.site = site;
  assert.equal(preview.nativeModeActive(), true);
  assert.equal(preview.nativeRouteForPath("blog/index.html"), "/blog/");
  assert.equal(preview.nativeRouteForPath("style.css"), undefined);
  assert.equal(preview.nativeRouteForPath(undefined), undefined);
  assert.equal(preview.nativeComponentTagForPath("components/site-header.html"), "site-header");
  assert.deepEqual(preview.nativeRouteInfo("/blog/"), { title: "Blog", description: "About Blog" });
  assert.deepEqual(preview.nativeRouteInfo("/nowhere/"), {});
  assert.deepEqual(preview.nativeTitles(site), { "/": "Home", "/blog/": "Blog", "/blog/post.html": "Post" });
  // The nearest page above it by folder, never itself; else the home page.
  assert.equal(preview.nativeFallbackPage("blog/post.html"), "blog/index.html");
  assert.equal(preview.nativeFallbackPage("blog/index.html"), "index.html");
  assert.equal(preview.nativeFallbackPage("index.html"), "index.html");
});

test("the stylesheets pages link, and the shown page's with every file they import", () => {
  const { preview, runtime, appStore, site } = setup();
  runtime.site = site;
  assert.deepEqual(preview.nativeLinkedSheets(site, runtime.sources()), ["style.css"]);
  // No page open: the home page's, with the file it imports.
  asked.length = 0;
  assert.deepEqual(preview.nativePageStyles(), ["style.css", "base.css"]);
  appStore.openFile.value = "blog/index.html";
  assert.deepEqual(preview.nativePageStyles(), []);
  assert.deepEqual(asked.map(([given, , route, prefix]) => [given, route, prefix]), [[site, "/", ""], [site, "/blog/", ""]]);
  assert.equal((asked[0][1] as Record<string, string>)["style.css"], '@import "base.css"; body { color: red; }');
});

test("a page update sends the route, the component, the version on show and the site's settings", () => {
  const { preview, runtime, appStore, site, calls, updates, late } = setup();
  runtime.site = site;
  runtime.base.sources.set(NATIVE_CONFIG_PATH, '{"siteAddress":"https://example.com/"}');
  preview.nativePreviewBehind = true;
  appStore.openFile.value = "components/site-header.html";
  late.view = { path: "index.html", content: "<p>earlier</p>" };
  late.template = "components/site-header.html";
  preview.updateNativePreview();
  assert.equal(preview.nativePreviewBehind, false);
  assert.deepEqual(calls, ["check"]);
  const [update] = updates;
  assert.equal(update.route, undefined);
  assert.equal(update.component, "site-header");
  assert.equal(update.editableTemplatePath, "components/site-header.html");
  assert.deepEqual(update.unreadable, new Map([["missing.css", "unreadable"]]));
  const sources = update.sources as Record<string, string>;
  assert.equal(sources["index.html"], "<p>earlier</p>");
  assert.equal(sources[NATIVE_CONFIG_PATH], '{"siteAddress":"https://example.com/"}');
  appStore.openFile.value = "blog/index.html";
  late.view = undefined;
  preview.updateNativePreview();
  assert.deepEqual([updates[1].route, updates[1].component], ["/blog/", undefined]);
});

test("a source update keeps the route, sends the assets and loads what the page needs", () => {
  const { preview, runtime, site, calls, updates, assets } = setup();
  runtime.site = site;
  runtime.state.assets.set("logo.png", "blob:logo");
  preview.nativePreviewBehind = true;
  preview.updateNativePreviewSources();
  assert.equal(preview.nativePreviewBehind, false);
  assert.equal(Object.hasOwn(updates[0], "route"), false);
  assert.deepEqual(updates[0].assets, { "logo.png": "blob:logo" });
  assert.deepEqual(calls, ["check", "assets", "styles", "shown"]);
  preview.updateNativePreviewAssets();
  assert.deepEqual(assets, [{ "logo.png": "blob:logo" }]);
});

test("with no preview made yet, an update waits and the flag stays", () => {
  const { preview, runtime, site, calls, late } = setup();
  runtime.site = site;
  late.preview = false;
  preview.nativePreviewBehind = true;
  preview.updateNativePreview(); preview.updateNativePreviewSources(); preview.updateNativePreviewAssets();
  assert.equal(preview.nativePreviewBehind, true);
  assert.deepEqual(calls, []);
});
