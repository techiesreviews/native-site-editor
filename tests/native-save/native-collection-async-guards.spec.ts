import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Collection settings keep friendly names for a declared filter and sort after the
// last page that supplied the custom field is deleted. (A page moved to another
// folder still supplies the names: the choices read every route.)
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const inspector = (page: Page) => page.getByRole("region", { name: "Collection settings", exact: true });
const listing = `<section class="collection-grid" data-key="field-list" data-each="/work/" data-sort="-release-year" data-filter="series-name=Clay"><template><article><a href="{url}">{title}</a></article></template><article><a href="/work/one/">One</a></article></section>`;
const page = (title: string, fields: string) =>
  `<html><head><title>${title}</title><meta name="date" content="2026-01-01">${fields}</head><body><main><h1>${title}</h1></main></body></html>`;

/** `supplier` false: the only page with the custom fields was removed before the grid is opened. */
async function seed(p: Page, baseURL: string | undefined, supplier: boolean) {
  await p.goto(baseURL!);
  // The fixture home, not the server copy: each case seeds from the same start.
  const home = readFileSync("fixtures/native-starter/index.html", "utf8");
  const files: [string, string][] = [
    ["index.html", home.replace("</head>", `<style>.collection-grid { padding: 30px; display: grid; }</style></head>`).replace("</main>", `${listing}</main>`)],
    ["work/one/index.html", page("One", "")],
  ];
  const two = page("Two", `<meta name="field:series-name" content="Clay"><meta name="field:release-year" content="2026">`);
  if (supplier) files.push(["work/two/index.html", two]);
  const edits: Record<string, unknown>[] = files.map(([path, content]) => ({ path, content }));
  if (!supplier) edits.push({ path: "work/two/index.html", delete: true });
  for (const data of edits) expect((await p.request.post(`${baseURL}/__demo/external-edit`, { data })).ok()).toBeTruthy();
  await p.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(p.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(p.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await frame(p).locator('[data-key="field-list"]').click({ position: { x: 5, y: 5 } });
  await p.getByRole("button", { name: "section.collection-grid", exact: true }).click();
  const grip = p.getByRole("separator", { name: "Resize Style panel", exact: true });
  if (await grip.getAttribute("aria-valuenow") === "0") await grip.click();
  await p.locator(".selected-collection > summary").click();
  await expect(inspector(p).getByRole("checkbox", { name: "/work/", exact: true })).toBeChecked();
  return inspector(p);
}
const selected = (select: ReturnType<Page["getByRole"]>) => select.evaluate((el: HTMLSelectElement) => [el.value, el.selectedOptions[0]?.textContent ?? ""]);

test("a declared filter keeps its friendly label after the last page supplying the field is gone", async ({ page: p, baseURL }) => {
  for (const supplier of [true, false]) {
    const panel = await seed(p, baseURL, supplier);
    const filter = panel.getByRole("combobox", { name: "Filter by", exact: true });
    expect(await selected(filter)).toEqual(["series-name", "Series name"]);
    await expect(panel.getByLabel("Matches exactly")).toHaveValue("Clay");
  }
});

test("a declared sort keeps its friendly label after the last page supplying the field is gone", async ({ page: p, baseURL }) => {
  for (const supplier of [true, false]) {
    const panel = await seed(p, baseURL, supplier);
    const sort = panel.getByRole("combobox", { name: "Sort by", exact: true });
    expect(await selected(sort)).toEqual(["release-year", "Release year"]);
    if (!supplier) await expect(sort.locator('option[value="release-year"]')).toHaveCount(1);
    await expect(panel.getByRole("combobox", { name: "Order", exact: true })).toHaveValue("descending");
  }
});
