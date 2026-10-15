import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createMemoryWorkspace } from "./fakes/memory-workspace";
import { createGuardedEdits } from "../src/guarded-edit";
import { createAppStore } from "../src/app-store";
import { createDraftStore } from "../src/draft-store";
import type { createNativeSettings } from "../src/native-settings";
import type { SiteSettingsHandlers } from "../src/components/site-settings";

// Capture the real settings orchestration's handlers without mounting a browser dialog.
const bundled = build({ entryPoints: ["src/native-settings.ts"], bundle: true, write: false, format: "esm", platform: "node", loader: { ".css": "empty" },
  plugins: [{ name: "settings-dialog", setup(plugin) {
    plugin.onResolve({ filter: /^\.\/components\/site-settings$/ }, () => ({ path: "settings-dialog", namespace: "test" }));
    plugin.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: "export const createSiteSettings = handlers => handlers;" }));
  } }],
}).then(result => import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text + "\n//# sourceURL=native-settings-writers-bundle.mjs").toString("base64")}`));

async function fixture(prefix: string) {
  const site = { routes: { "/": "index.html" }, components: {} };
  const config = JSON.stringify({ site: { url: `https://user.github.io${prefix}/` } });
  const workspace = createMemoryWorkspace({ site, branch: { ".editor/config.json": config, "index.html": '<html><head><title>Home</title></head><body><main><h1>Home</h1></main></body></html>', "media/a.webp": "pixels" } });
  const previews: Record<string, string>[] = [];
  const ports = {
    nativeSite: site, generation: 0, appStore: createAppStore(createDraftStore()), guardedEdits: createGuardedEdits(workspace.workspace),
    nativeAssets: new Map([["media/a.webp", "blob:picture"]]), nativePageLabelOf: () => "Home", setupScope: () => "site", nativeUrlPlan: () => { throw new Error("Unused"); },
    changeNativeUrl: async () => undefined, restoreFile: async () => {}, nativeSiteReadForCreate: async () => undefined,
    choosePath: async () => undefined, shareImage: async () => undefined, nativeEffectiveSource: (path: string) => workspace.workspace.source(path),
    loadNativeAssets: async (sources: Record<string, string>) => { previews.push(sources); },
  } satisfies Parameters<typeof createNativeSettings>[0];
  const module = await bundled, settings = module.createNativeSettings(ports);
  const handlers: SiteSettingsHandlers = settings.nativeSettingsController({ createSiteSettings: settings.createSiteSettings });
  return { handlers, workspace, previews };
}

test("settings social frames and previews use the same current site prefix", async () => {
  for (const prefix of ["", "/my-site"]) {
    const f = await fixture(prefix);
    assert.equal(f.handlers.prefix(), prefix);
    assert.equal(f.handlers.socialFrame?.(`${prefix}/media/a.webp`)?.value, `${prefix}/media/a.webp`);
    assert.equal(await f.handlers.imageUrl(`https://user.github.io${prefix}/media/a.webp`), "blob:picture");
    assert.deepEqual(f.previews, [{ "index.html": `<img src="${prefix}/media/a.webp">` }]);
  }
});

test("404 home link is written with the prefix read through the guarded edit", async () => {
  for (const prefix of ["", "/my-site"]) {
    const f = await fixture(prefix);
    await f.handlers.open404();
    const source = f.workspace.workspace.source("404.html");
    assert.ok(source?.includes(`<a href="${prefix}/">Go to the home page</a>`));
  }
});
