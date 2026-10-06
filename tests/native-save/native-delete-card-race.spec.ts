import { openPageSettingsFromPages } from "./settings-entry";
import { expect, test, type Page } from "@playwright/test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { storedDraft, storedDrafts } from "./drafts";

// Deleting a page with its card: the card's edit to Home is computed when the
// confirm dialog opens. A write to Home while it is open (an editor or agent
// edit) must refuse the delete, never be overwritten by the older card edit.
const status = (page: Page) => page.locator("#status");
const explorer = (page: Page) => page.locator("#explorer");
const item = (page: Page, name: string) => explorer(page).getByRole("treeitem", { name, exact: true });
const FERN = "work/fern-and-kettle/index.html";
const FOREIGN = "<!-- written while the dialog was open -->";

async function openPages(page: Page) {
  if (!(await explorer(page).isVisible())) await page.locator("#explorer-toggle").click();
  await expect(explorer(page)).toBeVisible();
  await explorer(page).getByRole("tab", { name: "Pages" }).click();
}
async function askDelete(page: Page) {
  await openPages(page);
  const work = item(page, "Work");
  if ((await work.getAttribute("aria-expanded")) === "false") await work.press("ArrowRight");
  await item(page, "Fern & Kettle · Larkspur Studio").focus();
  await page.keyboard.press("Delete");
  const dialog = page.getByRole("dialog", { name: `Delete the page Fern & Kettle · Larkspur Studio (${FERN})?` });
  await expect(dialog.getByRole("checkbox", { name: "Also remove its card from “Recent work” on Home" })).toBeChecked();
  return dialog;
}
const mounted = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"));

test("a Home edit while the delete-with-card dialog is open refuses the delete and keeps the edit; a fresh retry deletes both, one Undo/Redo", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=540&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(status(page)).toContainText("Up to date with main", { timeout: 30_000 });
  const original = (await mounted(page))!;
  expect(original).toContain('href="/work/fern-and-kettle/"');

  const dialog = await askDelete(page);
  // Write to Home through the real editor while the dialog waits.
  await page.evaluate(async (text) => {
    const { getMountedSource, replaceActiveRange } = await import("/src/components/code-editor.ts");
    const at = getMountedSource("index.html")!.indexOf("</main>");
    replaceActiveRange({ path: "index.html", start: at, end: at, expected: "", text });
  }, FOREIGN);
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content ?? "").toContain(FOREIGN);
  const edited = (await storedDraft(page, "index.html"))!.content;
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator("#notice")).toContainText(/Source changed: index\.html|changed meanwhile/);
  expect((await storedDraft(page, "index.html"))?.content).toBe(edited);
  expect(await storedDraft(page, FERN)).toBeUndefined();
  expect(await mounted(page)).toBe(edited);

  // A fresh Delete plans from the edited Home: the edit stays, the card goes.
  const again = await askDelete(page);
  await again.getByRole("button", { name: "Delete" }).click();
  await expect(status(page)).toHaveText("Deleted the page Fern & Kettle · Larkspur Studio and its card.");
  const after = (await storedDraft(page, "index.html"))!.content;
  expect(after).toContain(FOREIGN);
  expect(after).not.toContain("fern-and-kettle");
  expect((await storedDraft(page, FERN))?.deleted).toBe(true);

  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(edited);
  await expect.poll(async () => (await storedDraft(page, FERN))?.deleted ?? false).toBe(false);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(after);
  await expect.poll(async () => (await storedDraft(page, FERN))?.deleted).toBe(true);
});

// ---- Agent, resync and subpage variants (completion checklist: settings rebase and delete evidence gaps). ----

async function openCards(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=540&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(status(page)).toContainText("Up to date with main", { timeout: 30_000 });
}
// The agent connection the editor hands out (Connect with MCP), used as an agent does.
async function connectAgent(page: Page) {
  await page.locator(".repository-menu__trigger").click();
  await page.getByRole("button", { name: "Connect with MCP", exact: true }).click();
  await expect(page.locator(".agent-menu__hint")).toContainText("Paste it into Claude, Codex");
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  const url = /Server: `(\S+)`/.exec(prompt)![1];
  const token = /Authorization: `Bearer (ase_[a-f0-9]{64})`/.exec(prompt)![1];
  const client = new Client({ name: "delete-card-race", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  await page.keyboard.press("Escape");
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await client.callTool({ name, arguments: args });
    const body = JSON.parse((response as { content: { text: string }[] }).content[0].text);
    expect(response.isError, `${name}: ${JSON.stringify(body)}`).toBeFalsy();
    return body;
  };
  await expect.poll(async () => (await call("get_site")).available ?? true).toBe(true);
  return { client, call };
}
const cards = (page: Page) => page.frameLocator(".native-preview-frame").locator("card-project");

test("an agent's write to Home while the delete-with-card dialog is open refuses the delete and keeps the agent's edit", async ({ page, baseURL }) => {
  await openCards(page, baseURL);
  const original = (await mounted(page))!;
  const { client, call } = await connectAgent(page);
  try {
    const dialog = await askDelete(page);
    const file = await call("read_file", { path: "index.html" });
    expect(file.content).toBe(original);
    const agentHome = original.replace("</main>", `${FOREIGN}\n  </main>`);
    expect((await call("write_file", { path: "index.html", content: agentHome, expectedHash: file.hash })).state).toBe("applied");
    await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(agentHome);
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("#notice")).toContainText(/Source changed: index\.html|changed meanwhile/);
    expect((await storedDraft(page, "index.html"))?.content).toBe(agentHome);
    expect(await storedDraft(page, FERN)).toBeUndefined();
    expect(await mounted(page)).toBe(agentHome);
    await expect(cards(page)).toHaveCount(2);

    // Planned again from the agent's Home: its edit stays, the card goes, and Undo undoes only the delete.
    const again = await askDelete(page);
    await again.getByRole("button", { name: "Delete" }).click();
    await expect(status(page)).toHaveText("Deleted the page Fern & Kettle · Larkspur Studio and its card.");
    const after = (await storedDraft(page, "index.html"))!.content;
    expect(after).toContain(FOREIGN);
    expect(after).not.toContain("fern-and-kettle");
    expect((await storedDraft(page, FERN))?.deleted).toBe(true);
    await page.locator(".code-editor__undo").first().click();
    await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(agentHome);
    await expect.poll(async () => (await storedDraft(page, FERN))?.deleted ?? false).toBe(false);
    await page.locator(".code-editor__redo").first().click();
    await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(after);
    await expect.poll(async () => (await storedDraft(page, FERN))?.deleted).toBe(true);
  } finally { await client.close(); }
});

test("an agent deleting the page while the delete-with-card dialog is open refuses the dialog's delete: Home keeps its card, the agent's delete stands", async ({ page, baseURL }) => {
  await openCards(page, baseURL);
  const original = (await mounted(page))!;
  const { client, call } = await connectAgent(page);
  try {
    const dialog = await askDelete(page);
    expect((await call("delete_file", { path: FERN })).state).toBe("applied");
    await expect.poll(async () => (await storedDraft(page, FERN))?.deleted ?? false).toBe(true);
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("#notice")).toContainText(/Source changed: work\/fern-and-kettle\/index\.html|changed meanwhile/);
    // The older card edit was not applied over Home.
    expect(await storedDraft(page, "index.html")).toBeUndefined();
    expect(await mounted(page)).toBe(original);
    expect((await storedDraft(page, FERN))?.deleted).toBe(true);
    // Undo undoes the agent's delete, nothing more.
    await page.locator(".code-editor__undo").first().click();
    await expect.poll(async () => await storedDraft(page, FERN)).toBeUndefined();
    expect(await storedDraft(page, "index.html")).toBeUndefined();
  } finally { await client.close(); }
});

test("a repository resync while the delete-with-card dialog is open cancels the delete; a retry plans from the new Home", async ({ page, baseURL }) => {
  await openCards(page, baseURL);
  const original = (await mounted(page))!;
  const dialog = await askDelete(page);
  // Home changes on GitHub, and the tab sees it on focus while the dialog waits:
  // the snapshot reloads, closing the explorer and with it the dialog (a cancel).
  const upstream = original.replace("<h2>What we do</h2>", "<h2>What we make</h2>");
  expect(upstream).not.toBe(original);
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { repo: "native-cards", path: "index.html", content: upstream } });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => mounted(page), { timeout: 30_000 }).toBe(upstream);
  await expect(dialog).toHaveCount(0);
  await expect(status(page)).toHaveText(`Cancelled deleting ${FERN}`);
  expect(await storedDrafts(page)).toEqual([]);
  expect(await mounted(page)).toBe(upstream);
  await expect(cards(page)).toHaveCount(2);

  const again = await askDelete(page);
  await again.getByRole("button", { name: "Delete" }).click();
  await expect(status(page)).toHaveText("Deleted the page Fern & Kettle · Larkspur Studio and its card.");
  const home = (await storedDraft(page, "index.html"))!;
  expect(home.content).toContain("<h2>What we make</h2>");
  expect(home.content).not.toContain("fern-and-kettle");
  expect(home.original).toBe(upstream);
  expect((await storedDraft(page, FERN))?.deleted).toBe(true);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDrafts(page)).length).toBe(0);
  expect(await mounted(page)).toBe(upstream);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(home.content);
  await expect.poll(async () => (await storedDraft(page, FERN))?.deleted).toBe(true);
});

// Fern & Kettle with a subpage on the branch: /work/fern-and-kettle/menu/.
const MENU = "work/fern-and-kettle/menu/index.html";
async function openCardsWithSubpage(page: Page, baseURL: string | undefined) {
  await page.goto(baseURL!);
  const menu = [
    "<!doctype html>", '<html lang="en-GB">', "<head>", '  <meta charset="utf-8">',
    "  <title>Menu · Fern &amp; Kettle</title>", '  <link rel="stylesheet" href="/styles/site.css">',
    '  <script type="module" src="/components/components.js"></script>', "</head>", "<body>",
    "  <site-header></site-header>", '  <main class="page" id="main"><h1>Menu</h1></main>', "  <site-footer></site-footer>", "</body>", "</html>", "",
  ].join("\n");
  const posted = await page.request.post(`${baseURL}/__demo/external-edit`, { data: { repo: "native-cards", path: MENU, content: menu } });
  expect(posted.status()).toBe(204);
  await openCards(page, baseURL);
}
async function askDeleteWithSubpages(page: Page) {
  await openPages(page);
  const work = item(page, "Work");
  if ((await work.getAttribute("aria-expanded")) === "false") await work.press("ArrowRight");
  await item(page, "Fern & Kettle · Larkspur Studio").focus();
  await page.keyboard.press("Delete");
  const dialog = page.getByRole("dialog", { name: "Delete Fern & Kettle · Larkspur Studio?" });
  await expect(dialog).toContainText("Fern & Kettle · Larkspur Studio (/work/fern-and-kettle/) has 1 subpage. Delete them too, with everything in work/fern-and-kettle/, or only this page");
  await expect(dialog.getByRole("checkbox", { name: "Also remove its card from “Recent work” on Home" })).toBeChecked();
  await expect(dialog.getByRole("button", { name: "Delete only this page" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Delete Fern & Kettle · Larkspur Studio and its 1 subpage" })).toBeVisible();
  return dialog;
}

test("deleting a page with a subpage and a card: Delete all takes the page, its subpage and its card, and one Undo/Redo restores and repeats all three", async ({ page, baseURL }) => {
  await openCardsWithSubpage(page, baseURL);
  const original = (await mounted(page))!;
  const dialog = await askDeleteWithSubpages(page);
  await dialog.getByRole("button", { name: "Delete Fern & Kettle · Larkspur Studio and its 1 subpage" }).click();
  await expect(status(page)).toHaveText("Deleted Fern & Kettle · Larkspur Studio and its 1 subpage and its card.");
  const home = (await storedDraft(page, "index.html"))!.content;
  expect(home).not.toContain("fern-and-kettle");
  expect(home).toContain('href="/work/harbour-lane-pottery/"');
  expect((await storedDraft(page, FERN))?.deleted).toBe(true);
  expect((await storedDraft(page, MENU))?.deleted).toBe(true);
  expect((await storedDrafts(page)).map((draft) => draft.path)).toEqual(["index.html", MENU, FERN].sort());
  await expect(cards(page)).toHaveCount(1);

  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDrafts(page)).length).toBe(0);
  expect(await mounted(page)).toBe(original);
  await expect(cards(page)).toHaveCount(2);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(home);
  await expect.poll(async () => (await storedDraft(page, FERN))?.deleted).toBe(true);
  await expect.poll(async () => (await storedDraft(page, MENU))?.deleted).toBe(true);
});

test("deleting a page with a subpage and a card: Delete only this page takes the page and its card, keeps the subpage, and Undo restores both", async ({ page, baseURL }) => {
  await openCardsWithSubpage(page, baseURL);
  const original = (await mounted(page))!;
  const dialog = await askDeleteWithSubpages(page);
  await dialog.getByRole("button", { name: "Delete only this page" }).click();
  await expect(status(page)).toHaveText("Deleted the page Fern & Kettle · Larkspur Studio and its card.");
  expect((await storedDraft(page, "index.html"))!.content).not.toContain("fern-and-kettle");
  expect((await storedDraft(page, FERN))?.deleted).toBe(true);
  expect(await storedDraft(page, MENU)).toBeUndefined();
  await expect(cards(page)).toHaveCount(1);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDrafts(page)).length).toBe(0);
  expect(await mounted(page)).toBe(original);
});

test("a subpage an agent creates while the delete-with-subpages dialog is open cancels it; asked again, the dialog counts both subpages and Delete all takes them all", async ({ page, baseURL }) => {
  await openCardsWithSubpage(page, baseURL);
  const original = (await mounted(page))!;
  const { client, call } = await connectAgent(page);
  const HOURS = "work/fern-and-kettle/hours/index.html";
  try {
    const dialog = await askDeleteWithSubpages(page);
    const created = await call("create_page", { title: "Hours", parent: "/work/fern-and-kettle/", slug: "hours" });
    expect(created.state, JSON.stringify(created)).toBe("applied");
    await expect.poll(async () => (await storedDraft(page, HOURS))?.content ?? "").toContain("<title>Hours");
    // The agent's new page opens, closing the explorer and its dialog: a cancel, nothing deleted.
    await expect(dialog).toHaveCount(0);
    await expect(status(page)).toHaveText("Cancelled deleting Fern & Kettle · Larkspur Studio");
    expect((await storedDrafts(page)).map((draft) => [draft.path, draft.deleted ?? false])).toEqual([[HOURS, false]]);
  } finally { await client.close(); }
  await page.goto(`${baseURL}/#repo=540&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await openPages(page);
  const work = item(page, "Work");
  if ((await work.getAttribute("aria-expanded")) === "false") await work.press("ArrowRight");
  await item(page, "Fern & Kettle · Larkspur Studio").focus();
  await page.keyboard.press("Delete");
  const again = page.getByRole("dialog", { name: "Delete Fern & Kettle · Larkspur Studio?" });
  await expect(again).toContainText("has 2 subpages. Delete them too, with everything in work/fern-and-kettle/");
  await again.getByRole("button", { name: "Delete Fern & Kettle · Larkspur Studio and its 2 subpages" }).click();
  await expect(status(page)).toHaveText("Deleted Fern & Kettle · Larkspur Studio and its 2 subpages and its card.");
  // The agent's unsaved page is discarded; the branch's are marked deleted.
  expect((await storedDrafts(page)).map((draft) => [draft.path, draft.deleted ?? false])).toEqual([["index.html", false], [FERN, true], [MENU, true]]);
  expect((await storedDraft(page, "index.html"))!.content).not.toContain("fern-and-kettle");
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDrafts(page)).map((draft) => [draft.path, draft.deleted ?? false])).toEqual([[HOURS, false]]);
  expect(await mounted(page)).toBe(original);
});

test("a file an agent adds to the page's folder while the delete-with-subpages dialog is open refuses Delete all: nothing is left behind in a deleted folder", async ({ page, baseURL }) => {
  await openCardsWithSubpage(page, baseURL);
  const original = (await mounted(page))!;
  const { client, call } = await connectAgent(page);
  const NOTES = "work/fern-and-kettle/notes.txt";
  try {
    const dialog = await askDeleteWithSubpages(page);
    expect((await call("write_file", { path: NOTES, content: "Opening hours change in May.\n" })).state).toBe("applied");
    await expect.poll(async () => (await storedDraft(page, NOTES))?.content).toBe("Opening hours change in May.\n");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Delete Fern & Kettle · Larkspur Studio and its 1 subpage" }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(async () => (await storedDrafts(page)).map((draft) => [draft.path, draft.deleted ?? false]), { timeout: 3000 }).toEqual([[NOTES, false]]);
    await expect(page.locator("#notice")).toContainText(/changed meanwhile/);
    expect(await mounted(page)).toBe(original);
  } finally { await client.close(); }
  // Asked again, Delete all takes the agent's file too (unsaved, so discarded), and one Undo brings it all back.
  const again = await askDeleteWithSubpages(page);
  await again.getByRole("button", { name: "Delete Fern & Kettle · Larkspur Studio and its 1 subpage" }).click();
  await expect(status(page)).toHaveText("Deleted Fern & Kettle · Larkspur Studio and its 1 subpage and its card.");
  expect((await storedDrafts(page)).map((draft) => [draft.path, draft.deleted ?? false])).toEqual([["index.html", false], [FERN, true], [MENU, true]]);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDrafts(page)).map((draft) => [draft.path, draft.deleted ?? false])).toEqual([[NOTES, false]]);
  expect((await storedDraft(page, NOTES))!.content).toBe("Opening hours change in May.\n");
  expect(await mounted(page)).toBe(original);
});
