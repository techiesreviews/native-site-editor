import { expect, test, type Page } from "@playwright/test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { storedDraft } from "./drafts";
import { copyConnectionPrompt, waitForConnection } from "./mcp-prompt";

// Undo and Redo of guarded edits (sturdy-base slice 17, src/guarded-edit.ts): a range edit on
// the open page (a block from the rail) selects what was selected before and says so; a plain
// repository's Files tab renames with no file open and undoes; Undo of Make component closes
// the new component's stylesheet pane; Done while that mode still loads returns to the new component
// with its stylesheet; an agent's page edit while it loads brings the page back with nothing selected.
// Default native-starter fixture group.
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const status = (page: Page) => page.locator("#status");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const tree = (page: Page) => page.getByRole("tree", { name: "Page structure" });
const pageErrors: string[] = [];

test.beforeEach(({ page }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
});
test.afterEach(() => { expect(pageErrors).toEqual([]); });

async function openHome(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
}

test("Undo of a block from the rail selects what was selected before and says so; Redo selects the block again", async ({ page, baseURL }) => {
  await openHome(page, baseURL);
  await frame(page).locator(".hero h1").click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Heading");
  await page.getByRole("navigation", { name: "Blocks" }).getByRole("button", { name: "Paragraph", exact: true }).click();
  await expect(status(page)).toHaveText(/^Paragraph added\./);
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
  await page.locator(".code-editor__undo").first().click();
  await expect(status(page)).toHaveText("Undid adding the Paragraph.");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Heading");
  await expect(tree(page).getByRole("treeitem", { selected: true })).toHaveAccessibleName(/^Heading/);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(status(page)).toHaveText(/^Paragraph added\./);
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
});

test("a plain repository renames a file in the Files tab with no file open; Undo takes it back", async ({ page, baseURL }) => {
  // Signed in on the demo site first; the plain repository then opens by a fresh load of its address.
  await openHome(page, baseURL);
  await page.request.post(`${baseURL}/__demo/onboarding`, { data: { add: [{ name: "guarded-notes", kind: "no-site" }] } });
  const repos = await (await page.request.get(`${baseURL}/api/repositories?refresh=1`)).json() as { id: number; name: string }[];
  const repo = repos.find((entry) => entry.name === "guarded-notes")!;
  await page.goto(`${baseURL}/#repo=${repo.id}&branch=main`);
  await page.reload();
  const explorer = page.locator("#explorer");
  if (!(await explorer.isVisible())) await page.locator("#explorer-toggle").click();
  const readme = explorer.getByRole("button", { name: "README.md", exact: true });
  await expect(readme).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#primary-title")).not.toHaveText("README.md");
  await readme.focus();
  await page.keyboard.press("F2");
  await explorer.getByRole("textbox", { name: "New name for README.md" }).fill("NOTES.md");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("Renamed README.md to NOTES.md.");
  await expect(page.locator("#primary-title")).toHaveText("NOTES.md");
  await expect.poll(async () => (await storedDraft(page, "NOTES.md"))?.movedFrom).toBe("README.md");
  await page.keyboard.press("Escape");
  await page.locator(".code-editor__undo").first().click();
  await expect(status(page)).toHaveText("Undid renaming README.md to NOTES.md.");
  await expect.poll(() => storedDraft(page, "NOTES.md")).toBeUndefined();
  await expect.poll(() => storedDraft(page, "README.md")).toBeUndefined();
  await expect(page.locator("#primary-title")).toHaveText("README.md");
  // Redo from the file where it was renames it again.
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(status(page)).toHaveText("Renamed README.md to NOTES.md.");
  await expect(page.locator("#primary-title")).toHaveText("NOTES.md");
});

test("Undo of Make component closes the new component's stylesheet pane", async ({ page, baseURL }) => {
  const tag = "section-a-native-browser", cssPath = `components/${tag}/${tag}.css`;
  await openHome(page, baseURL);
  await tree(page).getByRole("treeitem", { name: "Section A native browser preview", exact: true }).first().locator(".page-structure__label").first().click();
  await bar(page).getByRole("button", { name: "Make component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", `components/${tag}/${tag}.html`);
  await page.getByRole("button", { name: "Done editing component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  // Back on the page, the new component's stylesheet still shows beside it.
  await expect(page.locator("#secondary-pane")).toBeVisible();
  await expect(page.locator("#secondary-title")).toContainText(cssPath);
  await page.locator(".code-editor__undo").first().click();
  await expect(frame(page).locator(tag)).toHaveCount(0);
  await expect.poll(() => storedDraft(page, cssPath)).toBeUndefined();
  await expect(page.locator("#secondary-pane")).toBeHidden();
});

// The mode's lazily loaded view, held so Done comes before the mode is on. The request is the app
// asking for the view (its entry is loading); on load the view adds its notes list to the page.
const MODE_VIEW = /\/edit-component-mode(?:\.ts|-[\w-]+\.js)/;
async function holdModeView(page: Page) {
  let release!: () => void;
  const held = new Promise<void>((done) => { release = done; });
  const requested = page.waitForRequest(MODE_VIEW);
  await page.route(MODE_VIEW, async (route) => { await held; await route.continue().catch(() => undefined); });
  return {
    requested,
    /** Lets the view load and waits until it has: a mode the cancelled entry started would be on by then. */
    release: async () => {
      release();
      await expect(page.locator("ul.edit-mode__notes")).toBeAttached();
      await page.unroute(MODE_VIEW);
    },
    unroute: () => { release(); return page.unroute(MODE_VIEW); },
  };
}

async function makeComponentHeld(page: Page, tag: string) {
  const view = await holdModeView(page);
  await tree(page).getByRole("treeitem", { name: "Section A native browser preview", exact: true }).first().locator(".page-structure__label").first().click();
  await bar(page).getByRole("button", { name: "Make component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", `components/${tag}/${tag}.html`);
  await view.requested;
  return view;
}

test("Done while the new component's mode still loads returns to it on the page, its stylesheet beside it", async ({ page, baseURL }) => {
  const tag = "section-a-native-browser", cssPath = `components/${tag}/${tag}.css`;
  await openHome(page, baseURL);
  const view = await makeComponentHeld(page, tag);
  try {
    await page.getByRole("button", { name: "Done editing component", exact: true }).click();
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
    await view.release();
  } finally { await view.unroute(); }
  // Back on the page, the new component is selected and its stylesheet shows beside it; no mode starts late.
  await expect(tree(page).getByRole("treeitem", { selected: true })).toHaveAccessibleName(new RegExp(tag.replaceAll("-", "[- ]"), "i"));
  await expect(page.locator("#secondary-pane")).toBeVisible();
  await expect(page.locator("#secondary-title")).toContainText(cssPath);
  await expect(page.locator(".canvas-bar .edit-mode__title")).toHaveCount(0);
});

test("an agent's page edit while the new component's mode loads brings the page back with nothing selected; no mode starts late", async ({ page, baseURL }) => {
  const tag = "section-a-native-browser";
  await openHome(page, baseURL);
  await page.locator(".repository-menu__trigger").click();
  const { url, token } = await copyConnectionPrompt(page);
  const client = new Client({ name: "guarded-history-agent", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  const call = async (name: string, args: Record<string, unknown>) => {
    const response = await client.callTool({ name, arguments: args });
    expect(response.isError).toBeFalsy();
    return JSON.parse((response.content as { text: string }[])[0].text);
  };
  try {
    await waitForConnection(page);
    await page.keyboard.press("Escape");
    const view = await makeComponentHeld(page, tag);
    try {
      // An agent puts a paragraph above the new instance while the mode loads: its node is another element
      // now. The page the agent edited comes forward, so there is no Done to press (component-mode.test.ts
      // covers a Done after such a change: it returns no instance).
      const home = await call("get_page", { page: "/" });
      expect((await call("edit_file", { path: "index.html", expectedHash: home.hash, edits: [{ oldText: `<${tag}`, newText: `<p>Agent note</p><${tag}` }] })).state).toBe("applied");
      await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
      await expect(frame(page).getByText("Agent note")).toBeVisible();
      await expect(page.getByRole("button", { name: "Done editing component", exact: true })).toHaveCount(0);
      await view.release();
    } finally { await view.unroute(); }
    await expect(tree(page).getByRole("treeitem", { selected: true })).toHaveCount(0);
    await expect(page.locator(".canvas-bar .edit-mode__title")).toHaveCount(0);
  } finally {
    await client.close();
  }
});
