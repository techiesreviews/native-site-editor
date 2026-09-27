import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { legacyDraftKeys, storedDraft, storedDrafts } from "./drafts";
import { showPublish } from "./publish";

// Browser drafts live in IndexedDB (src/drafts.ts): far more than
// localStorage's 5 MB for everything fits, the drafts an older version
// left in localStorage move over on load, and an edit survives a reload
// made right after it.
const indexPath = "index.html";
const indexSource = readFileSync(resolve("fixtures/native-starter", indexPath), "utf8");
const scope = { account: "native-demo-user", repoId: 501, repo: "native-demo-user/native-demo", branch: "main" };
const pageErrors: string[] = [];

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`);
  // The same address again only moves the hash: load it afresh.
  await page.reload();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
}

test.beforeEach(({ page }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
});
test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

test("a draft an older version kept in localStorage moves into IndexedDB on load, and localStorage lets it go", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const files = [["notes.txt", "Notes from before\n"], ["docs/kept.md", "# Kept\n"]] as const;
  await page.evaluate(([scope, files]) => {
    for (const [path, content] of files) {
      const key = "astro-site-editor:draft:v1:" + JSON.stringify([scope.account, scope.repoId, scope.branch, path]);
      localStorage.setItem(key, JSON.stringify({ ...scope, version: 1, path, baseSha: null, original: "", content, updatedAt: Date.now() }));
    }
  }, [scope, files] as const);
  expect(await legacyDraftKeys(page)).toHaveLength(2);
  await open(page, baseURL);
  expect(await legacyDraftKeys(page)).toEqual([]);
  for (const [path, content] of files) {
    expect((await storedDraft(page, path))?.content).toBe(content);
    await showPublish(page);
    await expect(page.locator("#publish-files .publish-menu__file", { hasText: path })).toBeVisible();
  }
  // Loaded again, nothing is left to move and the drafts are still there.
  await open(page, baseURL);
  expect((await storedDrafts(page)).map((draft) => draft.path)).toEqual(["docs/kept.md", "notes.txt"]);
});

test("an edit survives a reload made right after it", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const textbox = page.locator("#content [role=\"textbox\"]").first();
  await expect(textbox).toBeAttached({ timeout: 20_000 });
  const edited = indexSource.replace("A native browser preview", "Typed just before reload");
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), edited);
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
  await page.reload();
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toHaveText("Typed just before reload", { timeout: 30_000 });
  expect((await storedDraft(page, indexPath))?.content).toBe(edited);
});

test("drafts totalling well over 5 MB are kept and survive a reload", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await page.locator(".repository-menu__trigger").click();
  await page.getByRole("button", { name: "Connect with MCP", exact: true }).click();
  await expect(page.getByRole("button", { name: "Waiting for connection…", exact: true })).toBeVisible();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  const url = /Server URL: (\S+)/.exec(prompt)![1];
  const token = /Authorization: Bearer (ase_[a-f0-9]{64})/.exec(prompt)![1];
  const client = new Client({ name: "playwright-agent", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  try {
    await expect(page.getByRole("button", { name: "Disconnect MCP", exact: true })).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Escape");
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const response = await client.callTool({ name, arguments: args });
      const body = JSON.parse((response as { content: { text: string }[] }).content[0].text);
      expect(response.isError, `${name}: ${JSON.stringify(body).slice(0, 300)}`).toBeFalsy();
      return body;
    };
    await expect.poll(async () => (await call("get_site")).available ?? true, { timeout: 15_000 }).toBe(true);
    const paths = Array.from({ length: 8 }, (_, i) => `data/large-${i}.txt`);
    // 8 × 900 KB: past everything localStorage holds for a whole origin.
    for (const [i, path] of paths.entries())
      expect((await call("write_file", { path, content: `${i}`.repeat(900 * 1024) })).state).toBe("applied");
    await expect(page.locator("#notice")).not.toContainText("could not be saved");
    await page.reload();
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
    const stored = (await storedDrafts(page)).filter((draft) => draft.path.startsWith("data/"));
    expect(stored.map((draft) => [draft.path, draft.content.length, draft.content[0]])).toEqual(paths.map((path, i) => [path, 900 * 1024, `${i}`]));
    await showPublish(page);
    for (const path of paths) await expect(page.locator("#publish-files .publish-menu__file", { hasText: path })).toBeVisible();
    await expect(page.locator("#notice")).not.toContainText("could not be saved");
  } finally {
    await client.close();
  }
});
