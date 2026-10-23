import { createHash } from "node:crypto";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, test, type Page, type Route } from "@playwright/test";
import { openEditor, switchSiteMidUpload } from "../support/scenarios";
import { editorMounted, storedDrafts } from "./drafts";
import { publishButton, showPublish } from "./publish";

// Work goes on across a switch and lands where it started (ticket 23): a save,
// an upload and an agent edit are each held at their request with `page.route`,
// the branch switches to `feature`, and the request is let go. The result is on
// main, the branch the work began on; feature has nothing of it.
const pageErrors: string[] = [];

test.beforeEach(async ({ page, baseURL }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.request.post(`${baseURL}/__demo/slow?ms=0`);
});
test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

/** Holds the first request whose path is `path` (or passes `path`) until `release()`. */
async function hold(page: Page, path: string | ((path: string) => boolean)) {
  let held!: (route: Route) => void;
  const reached = new Promise<Route>(resolve => { held = resolve; });
  let release!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  let first = true;
  await page.route(url => typeof path === "string" ? url.pathname === path : path(url.pathname), async route => {
    if (!first) return route.continue();
    first = false;
    held(route);
    await released;
    await route.continue();
  });
  return { reached, release };
}

/** A branch's committed text of `path` on the fake GitHub; undefined when it has none. */
async function committed(page: Page, baseURL: string | undefined, path: string, branch = "main") {
  const response = await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}&branch=${branch}`);
  return response.ok() ? response.text() : undefined;
}

/** Appends `text` to the open file through the code editor, as typing would. */
async function appendToOpenFile(page: Page, path: string, text: string) {
  await expect.poll(() => page.evaluate(async path => (await import("/src/components/code-editor.ts")).isMounted(path), path), { timeout: 20_000 }).toBe(true);
  await page.evaluate(({ path, text }) => import("/src/components/code-editor.ts").then(editor => {
    const source = editor.getMountedSource(path)!;
    editor.replaceActiveRange({ path, start: source.length, end: source.length, expected: "", text });
  }), { path, text });
}

const draftsOn = async (page: Page, branch: string) => (await storedDrafts(page)).filter(draft => draft.branch === branch);

test("a save held across a branch switch commits on its own branch, and its drafts there are saved", async ({ page, baseURL }) => {
  await openEditor(page, baseURL);
  await appendToOpenFile(page, "index.html", "\n<!-- saved from main -->\n");
  await expect.poll(async () => (await draftsOn(page, "main")).map(draft => draft.path)).toEqual(["index.html"]);
  const publish = await hold(page, "/api/publish");
  await showPublish(page);
  await publishButton(page).click();
  await publish.reached;

  await switchSiteMidUpload(page, baseURL);
  const answered = page.waitForResponse(response => new URL(response.url()).pathname === "/api/publish");
  publish.release();
  expect((await answered).ok()).toBe(true);

  // The commit is main's; feature is as it was, with no draft of its own.
  await expect.poll(() => committed(page, baseURL, "index.html")).toContain("<!-- saved from main -->");
  expect(await committed(page, baseURL, "index.html", "feature")).not.toContain("<!-- saved from main -->");
  expect(await draftsOn(page, "feature")).toEqual([]);
  // Main's draft is saved: back on main there is nothing left to publish.
  await expect.poll(async () => (await draftsOn(page, "main")).filter(draft => draft.content !== draft.original)).toEqual([]);
  await page.evaluate(() => { location.hash = "repo=501&branch=main&file=index.html"; });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await expect(publishButton(page)).toBeDisabled();
});

// A real 1×1 PNG.
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP476AAAAOhAWAv9IBkAAAAAElFTkSuQmCC", "base64");

/** Files dropped from the desktop on the element at `selector`. */
async function dropFiles(page: Page, selector: string, files: { name: string; type: string; base64: string }[]) {
  await page.locator(selector).first().evaluate((element, files) => {
    const transfer = new DataTransfer();
    for (const file of files) transfer.items.add(new File([Uint8Array.from(atob(file.base64), c => c.charCodeAt(0))], file.name, { type: file.type }));
    for (const type of ["dragenter", "dragover", "drop"]) element.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, files);
}

test("files dropped on a folder, held across a branch switch, are added to the branch they were dropped on", async ({ page, baseURL }) => {
  await openEditor(page, baseURL);
  const explorer = page.locator("#explorer");
  if (!(await explorer.isVisible())) await page.locator("#explorer-toggle").click();
  await explorer.getByRole("tab", { name: "Files" }).click();
  await expect(explorer.locator(".file-row[data-path='images']")).toBeVisible();
  // The Media chunk that makes the drop's context: held while the branch switches.
  const media = await hold(page, "/src/controllers/media-actions.ts");
  await dropFiles(page, "#explorer .file-row[data-path='images']", [{ name: "Logo.png", type: "image/png", base64: png.toString("base64") }]);
  await media.reached;

  await switchSiteMidUpload(page, baseURL);
  media.release();
  await expect(page.locator("#status")).toHaveText("On main: Added images/logo.png.", { timeout: 20_000 });
  // The picture and its media records, as any addition writes them.
  expect((await draftsOn(page, "main")).map(draft => [draft.path, Boolean(draft.upload)])).toEqual([[".editor/media.json", false], ["images/logo.png", true]]);
  expect(await draftsOn(page, "feature")).toEqual([]);
  await expect(explorer.locator(".file-row[data-path='images/logo.png']")).toHaveCount(0);

  // Back on main the file waits there, unsaved, and saves to main.
  await page.evaluate(() => { location.hash = "repo=501&branch=main&file=index.html"; });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  if (!(await explorer.isVisible())) await page.locator("#explorer-toggle").click();
  await explorer.getByRole("tab", { name: "Files" }).click();
  const images = explorer.locator(".file-row[data-path='images']");
  if ((await images.getAttribute("aria-expanded")) === "false") await images.click();
  await expect(explorer.locator(".file-row[data-path='images/logo.png']")).toHaveAttribute("aria-description", "added, not saved to GitHub yet");
  await showPublish(page);
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  expect(await committed(page, baseURL, "images/logo.png")).toBeDefined();
  expect(await committed(page, baseURL, "images/logo.png", "feature")).toBeUndefined();
});

test("an agent's edit held across a branch switch waits on its own branch as an unsaved change", async ({ page, baseURL }) => {
  const messages: string[] = [];
  page.on("websocket", socket => {
    if (socket.url().includes("/api/agent/relay?")) socket.on("framereceived", ({ payload }) => messages.push(String(payload)));
  });
  await openEditor(page, baseURL);
  await editorMounted(page);
  await page.locator(".repository-menu__trigger").click();
  const made = page.waitForResponse(response => new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Connect with MCP", exact: true }).click();
  const { token } = await (await made).json() as { token: string };
  await expect.poll(() => messages.some(message => message.includes('"type":"ready"'))).toBe(true);
  await page.keyboard.press("Escape");
  const client = new Client({ name: "switch-mid-work-spec", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  try {
    const robots = (await committed(page, baseURL, "robots.txt"))!;
    const expectedHash = createHash("sha256").update(robots).digest("hex");
    // The edit tools' chunk, loaded by the first edit after it arrived: held while the branch switches.
    const read = await hold(page, "/src/agent-tools-edit.ts");
    const edit = client.callTool({ name: "edit_file", arguments: { path: "robots.txt", expectedHash, edits: [{ oldText: robots.slice(0, 10), newText: "# agent on main\n" + robots.slice(0, 10) }], requestId: "switch-mid-edit", waitSeconds: 0 } })
      .catch(error => ({ isError: true, content: [{ text: String(error) }] }));
    await read.reached;

    await switchSiteMidUpload(page, baseURL);
    read.release();
    // The tab's answer has no socket to go back on; the change itself is kept on main.
    await edit;
    await expect.poll(async () => (await draftsOn(page, "main")).map(draft => [draft.path, draft.content.startsWith("# agent on main")]), { timeout: 20_000 }).toEqual([["robots.txt", true]]);
    expect(await draftsOn(page, "feature")).toEqual([]);
    expect(await committed(page, baseURL, "robots.txt")).toBe(robots);
  } finally { await client.close(); }
});
