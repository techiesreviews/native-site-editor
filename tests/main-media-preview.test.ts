import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transform } from "esbuild";
import { siteAddress } from "../shared/site-path-prefix";

// Execute the actual callback with host ports, without booting the editor's DOM and network.
test("the media host's popup preview requests a prefixed image and reuses repository-keyed bytes", async () => {
  const ts = createRequire(import.meta.url)("typescript-eslint-api");
  const source = readFileSync("src/controllers/media-host.ts", "utf8"), tree = ts.createSourceFile("media-host.ts", source, ts.ScriptTarget.Latest, true);
  let callback: string | undefined;
  const walk = (node: any) => {
    if (ts.isPropertyAssignment(node) && node.name.getText(tree) === "imagePopup") {
      callback = node.initializer.properties.find((property: any) => property.name.getText(tree) === "picture").initializer.getText(tree);
    }
    ts.forEachChild(node, walk);
  };
  walk(tree); assert.ok(callback);
  const { code } = await transform(`export default (siteAddress, ports) => (${callback});`, { loader: "ts", format: "esm" });
  const { default: bind } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  for (const prefix of ["", "/my-site"]) {
    const assets = new Map<string, string>(), requests: Record<string, string>[] = [];
    const picture = bind(siteAddress, { runtime: { prefix: () => prefix, state: { assets } }, loadNativeAssets: async (sources: Record<string, string>) => { requests.push(sources); assets.set("media/a b.webp", "blob:picture"); }, appStore: { openFile: { value: "index.html" } } });
    assert.equal(await picture("media/a b.webp"), "blob:picture");
    assert.equal(await picture("media/a b.webp"), "blob:picture");
    assert.deepEqual(requests, [{ "index.html": `<img src="${prefix}/media/a%20b.webp">` }]);
  }
});
