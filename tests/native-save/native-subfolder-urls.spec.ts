import { expect, test, type Page } from "@playwright/test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { storedDraft } from "./drafts";
import { copyConnectionPrompt } from "./mcp-prompt";

// Default fixture group: native-subfolder (532).
async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=532&branch=main&file=notes%2Ffirst-note%2Findex.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "notes/first-note/index.html", { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").locator("h1")).toHaveText("First note");
}

async function assertMoved(page: Page) {
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toContain('href="/my-site/notes/hello/"');
  await expect.poll(async () => (await storedDraft(page, "components/site-header/site-header.html"))?.content).toContain('href="/my-site/notes/hello/"');
  expect((await storedDraft(page, "_redirects"))?.content).toBe("/my-site/notes/first-note/ /my-site/notes/hello/ 301\n");
  expect((await storedDraft(page, "notes/hello/index.html"))?.content).toContain("First note");
}

test("Change URL keeps the sub-folder in links and the old URL's redirect", async ({ page, baseURL }) => {
  await open(page, baseURL);
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.getByRole("treeitem", { name: "The first note", exact: true }).focus();
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Change URL…", exact: true }).click();
  const url = page.getByRole("textbox", { name: "URL of The first note", exact: true });
  await url.fill("/notes/hello/");
  await expect(page.getByRole("checkbox", { name: "Keep the old URL working (/notes/first-note/ redirects to /notes/hello/)", exact: true })).toBeChecked();
  await expect(page.getByText("GitHub Pages doesn't forward old addresses, so links to the old one will stop working.", { exact: true })).toBeVisible();
  await url.press("Enter");
  await expect(page.locator("#status")).toContainText("URL changed to /notes/hello/");
  await assertMoved(page);
});

test("agent move_file writes the same sub-folder links and redirect", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.locator(".repository-menu__trigger").click();
  const { url, token } = await copyConnectionPrompt(page);
  const client = new Client({ name: "subfolder-agent", version: "1.0.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    await expect(page.getByRole("button", { name: "Disconnect MCP", exact: true })).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Escape");
    const response = await client.callTool({ name: "move_file", arguments: { path: "notes/first-note/index.html", to: "notes/hello/index.html", keepOldUrl: true } });
    expect(response.isError, JSON.stringify(response)).toBeFalsy();
    await assertMoved(page);
  } finally { await client.close(); }
});

test("renaming a media file on a GitHub Pages site says the old address will not forward", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=532&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Media", exact: true }).click();
  const panel = page.getByRole("region", { name: "Media", exact: true });
  await panel.getByRole("button", { name: "Details for media/picture.svg", exact: true }).click();
  await panel.getByLabel("File name", { exact: true }).fill("garden.svg");
  await expect(panel.getByRole("checkbox", { name: "Keep the old address working", exact: true })).toBeVisible();
  await expect(panel.getByText("GitHub Pages doesn't forward old addresses, so links to the old one will stop working.", { exact: true })).toBeVisible();
  await expect(panel.getByText(/on hosts that read the site's _redirects file/)).toHaveCount(0);
});
