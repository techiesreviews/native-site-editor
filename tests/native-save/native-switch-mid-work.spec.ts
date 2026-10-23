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

/** Holds the first request whose path is `path` (or passes `path`) until `release()`; `fail` answers it with that status instead. */
async function hold(page: Page, path: string | ((path: string) => boolean), fail?: number) {
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
    await (fail ? route.fulfill({ status: fail, contentType: "application/json", body: JSON.stringify({ error: "GitHub is unavailable." }) }) : route.continue());
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

// Ticket 24: work that finished on another branch is counted on its project's tile, its branch's
// row and the menu's own tile, and named in each one's accessible name. Clicked, that branch opens
// with its changes (the Publish panel, the save's Change status in it), and the count goes.
test("a save that finished on main while feature was shown is counted in the menu, and its click opens main's Change status", async ({ page, baseURL }) => {
  await openEditor(page, baseURL);
  await appendToOpenFile(page, "index.html", "\n<!-- noted on main -->\n");
  await expect.poll(async () => (await draftsOn(page, "main")).map(draft => draft.path)).toEqual(["index.html"]);
  const publish = await hold(page, "/api/publish");
  await showPublish(page);
  await publishButton(page).click();
  await publish.reached;
  await switchSiteMidUpload(page, baseURL);
  const trigger = page.locator(".repository-menu__trigger"), count = trigger.locator(".repository-menu__finished");
  await expect(count).toBeHidden();
  publish.release();
  await expect.poll(() => committed(page, baseURL, "index.html")).toContain("<!-- noted on main -->");

  await expect(count).toHaveText("1");
  await expect(trigger).toHaveAccessibleName(/ — Saved on main$/);
  await trigger.click();
  const row = page.locator('.repository-menu__repo[aria-current="true"]');
  await expect(row.locator(".repository-menu__finished")).toHaveText("1");
  await expect(row).toHaveAccessibleName(/ — Saved on main$/);
  await row.click();
  const branches = page.getByRole("menu", { name: "Branches" });
  const main = branches.getByRole("menuitemradio", { name: "main — Saved", exact: true });
  await expect(main.locator(".repository-menu__finished")).toHaveText("1");
  await expect(branches.getByRole("menuitemradio", { name: "feature", exact: true })).toHaveAttribute("aria-checked", "true");
  // The count is no tab stop of its own: only the rows are.
  await expect(page.locator("#repository-actions .repository-menu__finished")).toHaveCount(2);
  await expect(page.locator("#repository-actions .repository-menu__finished:is(button, a, [tabindex])")).toHaveCount(0);
  await main.click();

  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  const panel = page.locator("#publish-files");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".publish-menu__message")).toContainText("Saved to GitHub.");
  await expect(panel.getByRole("link", { name: "View the commit on GitHub" })).toBeVisible();
  await expect(count).toBeHidden();
  await expect(trigger).toHaveAccessibleName(/repository actions$/);
});

// Files dropped on native-demo's main and added while another repository is shown: that repository's
// row counts them, the tile names where, and the row's click opens native-demo on main with them listed.
test("files added to another repository while it is not shown are counted on its row, and its click lists them there", async ({ page, baseURL }) => {
  await openEditor(page, baseURL);
  const explorer = page.locator("#explorer");
  if (!(await explorer.isVisible())) await page.locator("#explorer-toggle").click();
  await explorer.getByRole("tab", { name: "Files" }).click();
  await expect(explorer.locator(".file-row[data-path='images']")).toBeVisible();
  const media = await hold(page, "/src/controllers/media-actions.ts");
  await dropFiles(page, "#explorer .file-row[data-path='images']", [{ name: "Logo.png", type: "image/png", base64: png.toString("base64") }]);
  await media.reached;
  await page.evaluate(() => { location.hash = "repo=530&branch=main"; });
  await expect(page.locator(".repository-menu__trigger")).toHaveAccessibleName(/^native-routing — repository actions/, { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  media.release();
  await expect(page.locator("#status")).toHaveText("On native-demo-user/native-demo (main): Added images/logo.png.", { timeout: 20_000 });

  const trigger = page.locator(".repository-menu__trigger");
  await expect(trigger.locator(".repository-menu__finished")).toHaveText("1");
  await expect(trigger).toHaveAccessibleName(/ — 1 file added on native-demo-user\/native-demo \(main\)$/);
  await trigger.click();
  const row = page.locator("#repository-actions").getByRole("button", { name: /^native-demo native-demo-user/ });
  await expect(row).not.toHaveAttribute("aria-current", "true");
  await expect(row.locator(".repository-menu__finished")).toHaveText("1");
  await expect(row).toHaveAccessibleName("native-demo native-demo-user · private — 1 file added on main");
  await row.click();
  await expect(trigger).toHaveAccessibleName(/^native-demo — repository actions$/, { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  const panel = page.locator("#publish-files");
  await expect(panel.locator(".publish-menu__files")).toBeVisible();
  await expect(panel.locator(".publish-menu__path")).toContainText(["images/logo.png"]);
  await expect(trigger.locator(".repository-menu__finished")).toBeHidden();
});

// Left and shown again (a new load of main at the commit it was saved from) while the save is held:
// the save follows as on the same load, so the next save of the page goes on top of it, with no conflict.
test("a save held while feature and then main are opened commits on main, and the next save goes on top of it", async ({ page, baseURL }) => {
  await openEditor(page, baseURL);
  await appendToOpenFile(page, "index.html", "\n<!-- first save -->\n");
  await expect.poll(async () => (await draftsOn(page, "main")).map(draft => draft.path)).toEqual(["index.html"]);
  const publish = await hold(page, "/api/publish");
  await showPublish(page);
  await publishButton(page).click();
  await publish.reached;
  await switchSiteMidUpload(page, baseURL);
  await page.evaluate(() => { location.hash = "repo=501&branch=main&file=index.html"; });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  const answered = page.waitForResponse(response => new URL(response.url()).pathname === "/api/publish");
  publish.release();
  expect((await answered).ok()).toBe(true);
  const head = (await (await page.request.get(`${baseURL}/__demo/head`)).json()) as { commit: string };
  await expect(page.locator("#revision")).toHaveText(head.commit.slice(0, 7), { timeout: 20_000 });
  await appendToOpenFile(page, "index.html", "<!-- second save -->\n");
  await showPublish(page);
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  const text = await committed(page, baseURL, "index.html");
  expect(text).toContain("<!-- first save -->");
  expect(text).toContain("<!-- second save -->");
});

// The rejects cell: a save refused after the switch leaves main's drafts as they were, nothing on feature.
test("a save held across a branch switch that then fails keeps main's drafts unsaved", async ({ page, baseURL }) => {
  await openEditor(page, baseURL);
  await appendToOpenFile(page, "index.html", "\n<!-- kept on main -->\n");
  await expect.poll(async () => (await draftsOn(page, "main")).map(draft => draft.path)).toEqual(["index.html"]);
  const publish = await hold(page, "/api/publish", 500);
  await showPublish(page);
  await publishButton(page).click();
  await publish.reached;
  await switchSiteMidUpload(page, baseURL);
  const answered = page.waitForResponse(response => new URL(response.url()).pathname === "/api/publish");
  publish.release();
  expect((await answered).status()).toBe(500);
  expect(await committed(page, baseURL, "index.html")).not.toContain("<!-- kept on main -->");
  expect((await draftsOn(page, "main")).map(draft => [draft.path, draft.content.includes("<!-- kept on main -->")])).toEqual([["index.html", true]]);
  expect(await draftsOn(page, "feature")).toEqual([]);
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
    // Ticket 24: the menu counts it; its branch row opens main with the change listed.
    const trigger = page.locator(".repository-menu__trigger");
    await expect(trigger.locator(".repository-menu__finished")).toHaveText("1");
    await expect(trigger).toHaveAccessibleName(/ — Agent changes waiting on main$/);
    // Back on main, with agents on there again, the agent learns its change was kept.
    const ready = messages.filter(message => message.includes('"type":"ready"')).length;
    await trigger.click();
    await page.locator('.repository-menu__repo[aria-current="true"]').click();
    await page.getByRole("menu", { name: "Branches" }).getByRole("menuitemradio", { name: "main — Agent changes waiting", exact: true }).click();
    await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
    await expect(page.locator("#publish-files .publish-menu__path")).toContainText(["robots.txt"]);
    await expect(trigger.locator(".repository-menu__finished")).toBeHidden();
    await expect.poll(() => messages.filter(message => message.includes('"type":"ready"')).length, { timeout: 30_000 }).toBeGreaterThan(ready);
    const status = await client.callTool({ name: "get_command_status", arguments: { requestId: "switch-mid-edit" } });
    expect(JSON.parse((status.content as { text: string }[])[0].text)).toMatchObject({ requestId: "switch-mid-edit", state: "applied" });
  } finally { await client.close(); }
});

// The never-settles cell: an addition held across the switch stays on its way with its Cancel; cancelled, nothing is added anywhere.
test("files held across a branch switch can still be cancelled there, and nothing is added", async ({ page, baseURL }) => {
  await openEditor(page, baseURL);
  const explorer = page.locator("#explorer");
  if (!(await explorer.isVisible())) await page.locator("#explorer-toggle").click();
  await explorer.getByRole("tab", { name: "Files" }).click();
  await expect(explorer.locator(".file-row[data-path='images']")).toBeVisible();
  const media = await hold(page, "/src/controllers/media-actions.ts");
  await dropFiles(page, "#explorer .file-row[data-path='images']", [{ name: "Logo.png", type: "image/png", base64: png.toString("base64") }]);
  await media.reached;
  await switchSiteMidUpload(page, baseURL);
  if (!(await explorer.isVisible())) await page.locator("#explorer-toggle").click();
  await explorer.getByRole("tab", { name: "Files" }).click();
  const adding = explorer.getByRole("region", { name: "Files being added" });
  await adding.getByRole("button", { name: "Cancel adding Logo.png" }).click();
  await expect(adding.getByRole("button", { name: "Cancel adding Logo.png" })).toBeHidden();
  media.release();
  // Additions run one after another: one dropped now on feature is added once the cancelled one has
  // finished, so its toast says the first is done.
  await expect(explorer.locator(".file-row[data-path='images']")).toBeVisible();
  await dropFiles(page, "#explorer .file-row[data-path='images']", [{ name: "Second.png", type: "image/png", base64: png.toString("base64") }]);
  await expect(page.locator("#status")).toHaveText("Added images/second.png.", { timeout: 20_000 });
  expect(await draftsOn(page, "main")).toEqual([]);
  expect((await draftsOn(page, "feature")).map(draft => draft.path)).toEqual([".editor/media.json", "images/second.png"]);
});

// Left and shown again before it lands (a new load of main): the drop still lands on main.
test("files dropped on main, held while feature is opened and main again, are added to main", async ({ page, baseURL }) => {
  await openEditor(page, baseURL);
  const explorer = page.locator("#explorer");
  if (!(await explorer.isVisible())) await page.locator("#explorer-toggle").click();
  await explorer.getByRole("tab", { name: "Files" }).click();
  await expect(explorer.locator(".file-row[data-path='images']")).toBeVisible();
  const media = await hold(page, "/src/controllers/media-actions.ts");
  await dropFiles(page, "#explorer .file-row[data-path='images']", [{ name: "Logo.png", type: "image/png", base64: png.toString("base64") }]);
  await media.reached;
  await switchSiteMidUpload(page, baseURL);
  await page.evaluate(() => { location.hash = "repo=501&branch=main&file=index.html"; });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  media.release();
  await expect(page.locator("#status")).toHaveText("Added images/logo.png.", { timeout: 20_000 });
  expect((await draftsOn(page, "main")).map(draft => [draft.path, Boolean(draft.upload)])).toEqual([[".editor/media.json", false], ["images/logo.png", true]]);
  expect(await draftsOn(page, "feature")).toEqual([]);
});
