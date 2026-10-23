import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { unzipStored } from "../../src/zip.ts";
import { storedDrafts } from "./drafts";
import { copyConnectionPrompt, waitForConnection } from "./mcp-prompt";

// These specs use the fixture relay and browser-owned drafts and receipts.

// When this browser cannot keep agent edits (ticket 10, src/agent-records.ts): a full storage is
// relieved and the edit tried once; still full, agent edits stop with a plain error in the
// project menu, which downloads the unsaved changes this tab has (src/agent-recovery-export.ts).
// Disabled storage refuses agent edits the same way. Nothing unsaved is ever removed.
const indexPath = "index.html";
const pageErrors: string[] = [];
test.beforeEach(async ({ page }) => {
  pageErrors.length = 0;

  page.on("pageerror", (error) => pageErrors.push(error.message));
});
test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
}
async function connectAgent(page: Page, storageOff = false) {
  await page.locator(".repository-menu__trigger").click();
  const { url, token } = storageOff ? await (async () => {
    const response = await page.request.post("/api/agent/connect", { headers: { Origin: new URL(page.url()).origin }, data: { repo: "native-demo-user/native-demo", repoId: 501, branch: "main" } });
    expect(response.ok()).toBe(true);
    const { token } = await response.json() as { token: string };
    await page.getByRole("button", { name: "Connect to MCP", exact: true }).click();
    return { url: new URL("/mcp", page.url()).href, token };
  })() : await copyConnectionPrompt(page);
  const client = new Client({ name: "playwright-agent", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  await waitForConnection(page);
  await expect(page.locator(".agent-menu")).toHaveAttribute("data-state", /connected|takeover-failed/, { timeout: 15_000 });
  await page.keyboard.press("Escape");
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await client.callTool({ name, arguments: args });
    return { error: Boolean(response.isError), text: (response as { content: { text: string }[] }).content[0].text };
  };
  return { client, call };
}
// Every agent commit (one transaction over drafts and receipts) is refused as a full storage would.
async function fillStorage(page: Page, full: boolean) {
  await page.evaluate((full) => {
    const state: { __put?: typeof IDBObjectStore.prototype.put } = window as Window & { __put?: typeof IDBObjectStore.prototype.put };
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Restored exactly; each call below supplies its receiver.
    state.__put ??= IDBObjectStore.prototype.put;
    const put = state.__put;
    IDBObjectStore.prototype.put = full ? function (...args) {
      if (this.name === "receipts" && this.transaction.objectStoreNames.contains("drafts"))
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      return put.apply(this, args);
    } : put;
  }, full);
}
// The menu's one exception to having no text: Download unsaved changes, while this browser cannot keep agent edits.
const downloadButton = (page: Page) => page.getByRole("button", { name: "Download unsaved changes", exact: true });

test("full storage: the agent edit is refused, agent edits stop with a plain error, and the unsaved changes download; the download lets agents try again", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const { client, call } = await connectAgent(page);
  try {
    expect((await call("write_file", { path: "notes/plan.txt", content: "Opening hours change in May.\n" })).error).toBe(false);
    await expect.poll(async () => (await storedDrafts(page)).map((draft) => draft.path)).toEqual(["notes/plan.txt"]);
    // Two uploads, one of whose bytes this browser has lost: the export lists that one as missing.
    await page.evaluate(async () => {
      const [{ draftStore }, uploads] = await Promise.all([import("/src/drafts.ts"), import("/src/uploads.ts")]);
      const store = draftStore();
      const db = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open("native-site-editor-drafts"); request.onsuccess = () => resolve(request.result); });
      const saved = await new Promise<{ account: string; repoId: number; repo: string; branch: string }[]>((resolve) => {
        const request = db.transaction("drafts").objectStore("drafts").getAll(); request.onsuccess = () => resolve(request.result);
      });
      db.close();
      const { account, repoId, repo, branch } = saved[0], scope = { account, repoId, repo, branch };
      for (const [name, bytes] of [["kept.png", [1, 2, 3]], ["lost.png", [4, 5, 6]]] as const) {
        const result = await uploads.addUpload({ drafts: store, bytes: uploads.uploadBytes(), scope, folder: "media/images", file: new File([new Uint8Array(bytes)], name, { type: "image/png" }), taken: () => false });
        if (!result.ok) throw new Error(result.error);
      }
      await store.flush();
      const lost = store.list(scope).find((draft) => draft.path === "media/images/lost.png")!;
      await uploads.uploadBytes().delete(uploads.uploadKey(scope, lost.sourceSha!));
    });
    const before = await storedDrafts(page);

    await fillStorage(page, true);
    const homeRead = await call("read_file", { path: indexPath });
    expect(homeRead.error, homeRead.text).toBe(false);
    const home = JSON.parse(homeRead.text);
    const refused = await call("edit_file", { path: indexPath, expectedHash: home.hash, edits: [{ oldText: "A native browser preview", newText: "Agent heading" }] });
    expect(refused.error, refused.text).toBe(true);
    expect(refused.text).toContain("storage is full");
    expect(refused.text).toContain("Nothing was changed; your drafts are as they were.");
    expect(await storedDrafts(page)).toEqual(before);
    await expect(frame(page).locator(".hero h1")).toHaveText("A native browser preview");

    await page.locator(".repository-menu__trigger").click();
    await expect(downloadButton(page)).toBeVisible();
    await expect(page.locator(".agent-menu__action")).toHaveText(/^(Disconnect MCP|Connect to MCP)$/);
    const downloading = page.waitForEvent("download");
    await downloadButton(page).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe("native-demo-unsaved-changes.zip");
    const files = unzipStored(new Uint8Array(readFileSync(await download.path())));
    const text = (name: string) => new TextDecoder().decode(files[name]);
    expect(Object.keys(files).sort()).toEqual(["README.txt", "changes.json", "files/media/images/kept.png", "files/notes/plan.txt"]);
    expect(text("files/notes/plan.txt")).toBe("Opening hours change in May.\n");
    expect([...files["files/media/images/kept.png"]]).toEqual([1, 2, 3]);
    expect(text("README.txt")).toContain("media/images/lost.png: this browser no longer has the uploaded file; upload it again");
    // The download lets agents try again; a browser still full stops them again before any write.
    await expect(downloadButton(page)).toBeHidden();
    const still = await call("edit_file", { path: indexPath, expectedHash: home.hash, edits: [{ oldText: "A native browser preview", newText: "Agent heading" }] });
    expect(still.error, still.text).toBe(true);
    expect(still.text).toContain("storage is full");
    expect(await storedDrafts(page)).toEqual(before);
    await expect(downloadButton(page)).toBeVisible();

    // Space again, but agent edits stay stopped until the next download.
    await fillStorage(page, false);
    const stopped = await call("edit_file", { path: indexPath, expectedHash: home.hash, edits: [{ oldText: "A native browser preview", newText: "Agent heading" }] });
    expect(stopped.error, stopped.text).toBe(true);
    expect(stopped.text).toContain("agent edits are stopped");
    const again = page.waitForEvent("download");
    await downloadButton(page).click();
    await again;
    await expect(downloadButton(page)).toBeHidden();
    const applied = await call("edit_file", { path: indexPath, expectedHash: home.hash, edits: [{ oldText: "A native browser preview", newText: "Agent heading" }] });
    expect(applied.error, applied.text).toBe(false);
    await expect(frame(page).locator(".hero h1")).toHaveText("Agent heading");
    // Nothing unsaved went at any point.
    expect((await storedDrafts(page)).map((draft) => draft.path)).toEqual([indexPath, "media/images/kept.png", "media/images/lost.png", "notes/plan.txt"]);
  } finally { await client.close(); }
});

test("disabled storage: agent edits are refused with a plain error and the tab's unsaved changes still download", async ({ page, baseURL }) => {
  // Browser storage the editor may not use: IndexedDB refuses to open (drafts fall back to localStorage).
  await page.addInitScript(() => {
    IDBFactory.prototype.open = function () { throw new DOMException("The user denied permission to access the database.", "SecurityError"); };
  });
  await open(page, baseURL);
  const { client, call } = await connectAgent(page, true);
  try {
    const refused = await call("write_file", { path: "notes/plan.txt", content: "Kept only in this tab.\n" });
    expect(refused.error, refused.text).toBe(true);
    expect(refused.text).toContain("The editor isn't open");
    // The user's own edit is kept by the tab (in memory and localStorage) and is what downloads.
    const source = await page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).getMountedSource(path), indexPath);
    expect(source).toContain("A native browser preview");
    const edited = source!.replace("A native browser preview", "Manual heading kept in this tab");
    await page.evaluate(async (text) => navigator.clipboard.writeText(text), edited);
    await page.locator("#content [role=\"textbox\"]").first().evaluate((el) => (el as HTMLElement).focus());
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("ControlOrMeta+V");
    await expect(frame(page).locator(".hero h1")).toHaveText("Manual heading kept in this tab");
    await page.locator(".repository-menu__trigger").click();
    await expect(downloadButton(page)).toBeVisible();
    const downloading = page.waitForEvent("download");
    await downloadButton(page).click();
    const files = unzipStored(new Uint8Array(readFileSync(await (await downloading).path())));
    expect(Object.keys(files).sort()).toEqual(["README.txt", "changes.json", `files/${indexPath}`]);
    expect(new TextDecoder().decode(files[`files/${indexPath}`])).toBe(edited);
    expect(new TextDecoder().decode(files["README.txt"])).toContain('The folder "files" holds 1 file,');
  } finally { await client.close(); }
});
