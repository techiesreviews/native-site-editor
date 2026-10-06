import { expect, type Page } from "@playwright/test";
import { DEFAULT_STATIC_SECTIONS } from "../../src/page-builder/static-section-defaults";

/** A branch with user-saved sections, preserving existing page data and catalogue entries. */
export async function seedSavedSections(page: Page, baseURL: string | undefined, ids = ["intro", "features", "split", "contact"]) {
  await page.goto(baseURL!);
  const jsonPath = ".editor/page-builder.json";
  const response = await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(jsonPath)}`);
  const document = response.ok() ? JSON.parse(await response.text()) : { version: 1, pages: {} };
  const catalogue = document.reusableSections ??= { version: 1, records: {} };
  const added = DEFAULT_STATIC_SECTIONS.filter(record => ids.includes(record.id) && !Object.hasOwn(catalogue.records, record.id));
  for (const record of added) catalogue.records[record.id] = structuredClone(record);
  const content = JSON.stringify(document, null, 2) + "\n";
  expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: jsonPath, content } })).status()).toBe(204);
  // These are already-saved sections: their public styles exist on the branch before Add.
  for (const path of new Set(added.map(record => record.stylesheetPath))) {
    const css = await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`);
    const before = css.ok() ? await css.text() : "";
    const content = before + added.filter(record => record.stylesheetPath === path).map(record => record.css).join("");
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).status()).toBe(204);
  }
  return content;
}
