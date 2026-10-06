import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { writePageBuilderDocument, type PageBuilderDocument } from "../../src/page-builder/page-builder-document";
import { makeSectionTarget } from "../../src/page-builder/source-target";
import { storedDraft, storedDrafts } from "./drafts";

// Collections retain their declared fields, labels and cards when the last page
// supplying custom fields is deleted or moved through the editor.
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const page = (title: string, fields: string) =>
  `<html><head><title>${title}</title><meta name="date" content="2026-01-01">${fields}</head><body><main><h1>${title}</h1></main></body></html>`;

async function load(p: Page, baseURL: string | undefined) {
  await p.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(p.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(p.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}

// The same guarantees when the last page supplying a collection's custom fields leaves through
// the editor: deleted (Files or Pages tab) or moved out of /work/ (Move to… or Change URL…). The
// fields are declared either in .editor/page-builder.json (with labels) or in the grid's own
// `data-fields`. They stay declared, the remaining card still renders, and one
// Undo/Redo takes it all back and forth exactly.
type Kind = "JSON" | "inline";
const SIDECAR = ".editor/page-builder.json";
const ID = "series-grid";
const explorer = (p: Page) => p.locator("#explorer");
const status = (p: Page) => p.locator("#status");
const mounted = (p: Page, path = "index.html") => p.evaluate(async (path) => (await import("/src/components/code-editor.ts")).getMountedSource(path), path);
const cardTemplate = `<article><a href="{url}">{title}</a><span>{series-name}</span></article>`;
const card = (url: string, title: string, series: string) => `<article><a href="${url}">${title}</a><span>${series}</span></article>`;
const bothCards = `${card("/work/two/", "Two", "Clay")}\n${card("/work/one/", "One", "")}`;
const oneCard = card("/work/one/", "One", "");
/** JSON stores the recipe outside the page; inline, the grid declares it and keeps its template. */
const homeWith = (cards: string, kind: Kind = "JSON") => readFileSync("fixtures/native-starter/index.html", "utf8")
  .replace("</head>", `<style>.collection-grid { padding: 30px; display: grid; }</style></head>`)
  .replace("</main>", `<section class="collection-grid" data-key="field-list"${kind === "JSON" ? ">" : ` data-each="/work/" data-sort="-release-year" data-fields="series-name release-year"><template>${cardTemplate}</template>`}${cards}</section></main>`);
const supplied = { "series-name": "Clay", "release-year": "2026" };
// JSON values live in Two's per-card record; inline, in Two's own head.
const two = (kind: Kind) => page("Two", kind === "JSON" ? "" : `<meta name="field:series-name" content="Clay"><meta name="field:release-year" content="2026">`);
const labels = { JSON: ["Series", "Year of release"], inline: ["Series name", "Release year"] };
/** The recipe as the editor stores it: declared fields with labels, the values only in Two's per-card record. */
function recipe(overrides: Record<string, Record<string, string>>, output: string): PageBuilderDocument {
  const home = homeWith(output);
  return { version: 1, pages: {}, collections: { [ID]: {
    pagePath: "index.html", target: makeSectionTarget(home, home.indexOf('<section class="collection-grid"')),
    folders: ["/work/"], sort: "-release-year", filter: "", limit: 6, template: cardTemplate,
    fields: ["series-name", "release-year"], fieldLabels: { "series-name": labels.JSON[0], "release-year": labels.JSON[1] },
    overrides, outputFingerprint: output,
  } } };
}
const pageErrors: string[] = [];
test.beforeEach(({ page: p }) => {
  pageErrors.length = 0;
  p.on("pageerror", (error) => pageErrors.push(error.message));
});
test.afterEach(() => expect(pageErrors).toEqual([]));

/** Saved on the branch: Home with the baked grid, One (no custom fields) and Two (the only supplier); no drafts. */
async function seedLeaving(p: Page, baseURL: string | undefined, kind: Kind) {
  await p.goto(baseURL!);
  const home = homeWith(bothCards, kind);
  const files: [string, string][] = [["index.html", home], ["work/one/index.html", page("One", "")], ["work/two/index.html", two(kind)]];
  if (kind === "JSON") files.push([SIDECAR, writePageBuilderDocument(recipe({ "work/two/index.html": supplied }, bothCards))]);
  for (const [path, content] of files) expect((await p.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).ok()).toBeTruthy();
  await load(p, baseURL);
  expect(await storedDrafts(p)).toEqual([]);
  expect(await mounted(p)).toBe(home);
  return home;
}
/** The grid's cards in the preview, remain valid. */
async function expectCollection(p: Page, _kind: Kind, titles: string[]) {
  await p.keyboard.press("Escape");
  await expect(frame(p).locator('[data-key="field-list"] > article > a')).toHaveText(titles);

}
async function openTab(p: Page, name: "Files" | "Pages") {
  await p.keyboard.press("Escape");
  if (!await explorer(p).evaluate((el) => el.matches(":popover-open"))) await p.locator("#explorer-toggle").click();
  await explorer(p).getByRole("tab", { name, exact: true }).click();
}
/** Two's row in the Pages tab, its folder row opened when it starts collapsed. */
async function twoRow(p: Page) {
  await openTab(p, "Pages");
  const two = explorer(p).getByRole("treeitem", { name: "Two", exact: true });
  if (!await two.isVisible()) {
    const work = explorer(p).getByRole("treeitem", { name: /^work$/i }).first();
    await work.focus();
    if (await work.getAttribute("aria-expanded") === "false") await p.keyboard.press("ArrowRight");
  }
  await expect(two).toBeVisible();
  return two;
}

const leaves: { how: string; moved?: string; redirect?: boolean; leave: (p: Page) => Promise<void> }[] = [
  { how: "deleted in the Files tab", leave: async (p) => {
    await openTab(p, "Files");
    for (const folder of ["work", "two"]) {
      const row = explorer(p).getByRole("button", { name: folder, exact: true }).first();
      await expect(row).toBeVisible({ timeout: 20_000 });
      if (await row.getAttribute("aria-expanded") === "false") await row.click();
      await expect(row).toHaveAttribute("aria-expanded", "true");
    }
    const actions = explorer(p).getByRole("button", { name: "Actions for work/two/index.html", exact: true });
    await actions.locator("xpath=ancestor::*[contains(concat(' ', @class, ' '), ' row-action-host ')][1]").hover();
    await actions.click();
    await p.getByRole("menu", { name: "Actions for work/two/index.html" }).getByRole("menuitem", { name: "Delete" }).click();
    await p.getByRole("dialog", { name: "Delete work/two/index.html?" }).getByRole("button", { name: "Delete" }).click();
    await expect(status(p)).toHaveText("Deleted work/two/index.html.");
  } },
  { how: "deleted in the Pages tab", leave: async (p) => {
    await (await twoRow(p)).focus();
    await p.keyboard.press("Delete");
    await p.getByRole("dialog", { name: "Delete the page Two (work/two/index.html)?" }).getByRole("button", { name: "Delete" }).click();
    await expect(explorer(p).getByRole("treeitem", { name: "Two", exact: true })).toHaveCount(0);
  } },
  { how: "moved to the top level with Move to…", moved: "two/index.html", redirect: true, leave: async (p) => {
    await (await twoRow(p)).focus();
    await p.keyboard.press("Shift+F10");
    await p.getByRole("menu", { name: "Actions for Two" }).getByRole("menuitem", { name: "Move to…" }).click();
    await p.getByRole("dialog", { name: "Move Two to…" }).getByRole("treeitem", { name: "Top level" }).click();
    const confirm = p.getByRole("dialog", { name: "Move Two to /two/?" });
    await expect(confirm.getByRole("checkbox", { name: /^Keep the old URL working/ })).toBeChecked();
    await confirm.getByRole("button", { name: "Move" }).click();
    await expect(status(p)).toContainText("URL changed to /two/");
  } },
  { how: "moved out of /work/ with Change URL…", moved: "archive/two/index.html", redirect: true, leave: async (p) => {
    await (await twoRow(p)).focus();
    await p.keyboard.press("Shift+F10");
    await p.getByRole("menu", { name: "Actions for Two" }).getByRole("menuitem", { name: "Change URL…" }).click();
    const url = explorer(p).getByRole("textbox", { name: "URL of Two" });
    await expect(url).toHaveValue("/work/two/");
    await url.fill("/archive/two/");
    await p.keyboard.press("Enter");
    await expect(status(p)).toContainText("URL changed to /archive/two/");
  } },
];

for (const kind of ["JSON", "inline"] as const) for (const { how, moved, redirect, leave } of leaves) {
  test(`${kind === "JSON" ? "a JSON" : "an inline"} collection keeps its declared fields, labels and cards when its last supplying page is ${how}; Undo and Redo are exact`, async ({ page: p, baseURL }) => {
    const before = await seedLeaving(p, baseURL, kind);
    await expectCollection(p, kind, ["Two", "One"]);

    await leave(p);

    // Source: the grid now holds only One's card, built from the same template.
    const home = homeWith(oneCard, kind);
    await expect.poll(async () => (await storedDraft(p, "index.html"))?.content).toBe(home);
    if (kind === "JSON") {
      // JSON: Two's record leaves (or follows the page); the declared fields and labels stay exactly.
      const sidecar = JSON.parse((await storedDraft(p, SIDECAR))!.content);
      expect(sidecar).toEqual(recipe(moved ? { [moved]: supplied } : {}, oneCard));
      expect(sidecar.collections[ID].fields).toEqual(["series-name", "release-year"]);
      expect(sidecar.collections[ID].fieldLabels).toEqual({ "series-name": "Series", "release-year": "Year of release" });
    }
    const drafts = await storedDrafts(p);
    // Inline, no editor JSON is written.
    expect(drafts.map((draft) => draft.path)).toEqual([...kind === "JSON" ? [SIDECAR] : [], ...redirect ? ["_redirects"] : [], "index.html", ...moved ? [moved] : [], "work/two/index.html"].sort((a, b) => a.localeCompare(b)));
    expect(drafts.find((draft) => draft.path === "work/two/index.html")?.deleted).toBe(true);
    if (moved) expect(drafts.find((draft) => draft.path === moved)).toMatchObject({ content: two(kind), movedFrom: "work/two/index.html" });
    // Preview: One's card still renders.
    await expectCollection(p, kind, ["One"]);

    // One Undo restores the page, the JSON and Two exactly: nothing is left to save.
    await p.keyboard.press("Escape");
    await p.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => storedDrafts(p)).toEqual([]);
    await expect.poll(() => mounted(p)).toBe(before);
    await expectCollection(p, kind, ["Two", "One"]);

    // Redo applies it again, exactly.
    await p.keyboard.press("Escape");
    await p.getByRole("button", { name: "Redo", exact: true }).click();
    await expect.poll(() => storedDrafts(p)).toEqual(drafts);
    await expect.poll(() => mounted(p)).toBe(home);
    await expectCollection(p, kind, ["One"]);
  });
}
