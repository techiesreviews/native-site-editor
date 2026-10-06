import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { Page } from "@playwright/test";
import { deriveNativeRoutes } from "../../shared/native-routes";
import { descendants, parseSource } from "../../src/page-builder/component-model";
import { planManualConversion } from "../../src/page-builder/native-grid-collection";
import { planSidecarRecipe, withLegacyImported } from "../../src/page-builder/collection-origins";
import { planNativeCollectionOperation } from "../../src/page-builder/native-collection-host";
import { writePageBuilderDocument } from "../../src/page-builder/page-builder-document";
import { readSiteIdentity } from "../../src/page-builder/site-identity";

/** Seed recipes on the fake GitHub boundary; inspector UI is no longer part of the editor. */
export async function seedCollection(page: Page, baseURL: string | undefined, folders = ["/work/"], extraPaths: string[] = []) {
  const root = process.env.ASE_NATIVE_SAVE_FIXTURE ?? "fixtures/native-starter";
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(dir, entry.name)) : [relative(root, join(dir, entry.name))]);
  const paths = [...new Set([".editor/config.json", ".editor/page-builder.json", ...walk(root).filter(path => /\.html?$|^\.editor\/(config|page-builder)\.json$/.test(path)), ...extraPaths])];
  const sources: Record<string, string> = {};
  for (const path of paths) {
    const response = await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`);
    if (response.ok()) sources[path] = await response.text();
  }
  const routes = deriveNativeRoutes(Object.keys(sources)), identity = readSiteIdentity(sources[".editor/config.json"], sources["index.html"]);
  const site = { sources, routes, identity, files: Object.keys(sources), revision: "fixture" };
  let origin;
  if (/data-each/.test(sources["index.html"])) {
    const imported = withLegacyImported(site);
    origin = { edits: new Map([...imported.texts, [".editor/page-builder.json", writePageBuilderDocument(imported.document, sources[".editor/page-builder.json"])]]), done: "", undone: "" };
  } else {
    const grid = [...descendants(parseSource(sources["index.html"]))].find(element => /\bclass=["']cards["']/.test(sources["index.html"].slice(element.start, element.tag.end)));
    if (!grid) throw new Error("Fixture cards grid was not found");
    const converted = planManualConversion({ ...site, path: "index.html", start: grid.start, folders, token: "gproof" });
    if ("error" in converted) throw new Error(converted.error);
    origin = { ...planSidecarRecipe(site, "index.html", grid.start, converted.recipe, converted.id), done: "", undone: "" };
  }
  const plan = planNativeCollectionOperation({ ...site, origin });
  if ("error" in plan) throw new Error(plan.error);
  for (const [path, content] of [...(plan.operation.edits ?? []), ...(plan.operation.creates ?? []).map(file => [file.path, file.content] as const)]) {
    const response = await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } });
    if (!response.ok()) throw new Error(`Could not seed ${path}`);
  }
}
