import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, test, type Page, type Route } from "@playwright/test";
import { openEditor, switchSiteMidUpload } from "../support/scenarios";
import { editorMounted, storedDrafts } from "./drafts";

// Invisible multiplayer, part 2 (ticket 34): an agent's page or file command that arrived on main
// keeps going there after Lex opens feature (or another site), and lands on main as unsaved changes,
// with nothing on what is shown and the repository menu counting it (ticket 24). Opening its own page
// afterwards offers its Undo as the newest step; Undo there takes it back. Each cell holds the command
// at the edit tools' chunk (loaded by the first edit after it arrived, its workspace already held),
// switches, and lets it go: one per command family (a page command, a section move, a file move, a
// file delete). Default fixture group: native-starter (#repo=501), native-cards (#repo=540).
const pageErrors: string[] = [];

test.beforeEach(async ({ page, baseURL }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.request.post(`${baseURL}/__demo/slow?ms=0`);
});
test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

/** Holds the first request for `path` until `release()`. */
async function hold(page: Page, path: string) {
  let held!: (route: Route) => void;
  const reached = new Promise<Route>(resolve => { held = resolve; });
  let release!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  let first = true;
  await page.route(url => url.pathname === path, async route => {
    if (!first) return route.continue();
    first = false;
    held(route);
    await released;
    await route.continue();
  });
  return { reached, release };
}

const draftsOn = async (page: Page, branch: string, repoId = 501) => (await storedDrafts(page)).filter(draft => draft.branch === branch && draft.repoId === repoId);
const finishedCount = (page: Page) => page.locator(".repository-menu__trigger .repository-menu__finished");
const undo = (page: Page) => page.locator(".code-editor__undo").first();
async function switchTo(page: Page, baseURL: string | undefined, to: "branch" | "site") {
  if (to === "branch") return switchSiteMidUpload(page, baseURL);
  await page.evaluate(() => { location.hash = "repo=540&branch=main&file=index.html"; });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}
async function openMain(page: Page, file = "index.html") {
  await page.evaluate(file => { location.hash = `repo=501&branch=main&file=${file}`; }, file);
  await expect(page.locator("#status")).toContainText("main", { timeout: 30_000 });
  await editorMounted(page, file);
}

/** An MCP client on main's open editor, and `call`, which answers with a tool's JSON reply. */
async function connect(page: Page, baseURL: string | undefined) {
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
  const client = new Client({ name: "invisible-multiplayer-pages-spec", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  const call = async (name: string, args: Record<string, unknown>) => JSON.parse(((await client.callTool({ name, arguments: args })).content as { text: string }[])[0].text);
  return { client, call };
}

/**
 * Starts `command` on main, switches to feature (or another site) while it is held, and lets it go;
 * the result must land on main only, counted on the menu, with no Undo for it on the page shown.
 */
async function heldAcross(page: Page, baseURL: string | undefined, to: "branch" | "site", command: () => Promise<unknown>) {
  const edits = await hold(page, "/src/agent-tools-edit.ts");
  const running = command().catch(error => ({ error: String(error) }));
  await edits.reached;
  await switchTo(page, baseURL, to);
  edits.release();
  return running;
}
async function nothingShown(page: Page) {
  expect(await draftsOn(page, "feature")).toEqual([]);
  expect(await draftsOn(page, "main", 540)).toEqual([]);
  await expect(finishedCount(page)).toHaveText("1");
  // Nothing is said (Lex: no toasts), and the page shown offers no Undo for it.
  await expect(page.locator(".editor-toast")).toHaveCount(0);
  await editorMounted(page);
  await expect(undo(page)).toBeDisabled();
}

for (const to of ["branch", "site"] as const) {
  test(`set_page_details held across a ${to} switch lands on main's page, whose Undo takes it back`, async ({ page, baseURL }) => {
    const { client, call } = await connect(page, baseURL);
    try {
      await heldAcross(page, baseURL, to, () => call("set_page_details", { page: "/", title: "Held title", requestId: `held-details-${to}`, waitSeconds: 0 }));
      await expect.poll(async () => (await draftsOn(page, "main")).filter(draft => draft.path === "index.html").map(draft => draft.content.includes("<title>Held title</title>")), { timeout: 20_000 }).toEqual([true]);
      await nothingShown(page);
      await openMain(page);
      await expect(undo(page)).toBeEnabled();
      await undo(page).click();
      await expect.poll(async () => (await draftsOn(page, "main")).filter(draft => draft.path === "index.html"), { timeout: 20_000 }).toEqual([]);
      expect(await draftsOn(page, "feature")).toEqual([]);
    } finally { await client.close(); }
  });
}

test("move_section held across a branch switch lands on main's page, whose Undo takes it back", async ({ page, baseURL }) => {
  const { client, call } = await connect(page, baseURL);
  try {
    const home = await call("get_page", { page: "/", source: false });
    const ids = (home.sections as { id: string }[]).map(section => section.id);
    await heldAcross(page, baseURL, "branch", () => call("move_section", { page: "/", section: ids[0], after: ids[1], expectedHash: home.hash, requestId: "held-move-section", waitSeconds: 0 }));
    // The hero now follows the cards on main's page.
    const order = (content: string) => content.indexOf('data-key="cards"') < content.indexOf('data-key="hero"');
    await expect.poll(async () => (await draftsOn(page, "main")).filter(draft => draft.path === "index.html").map(draft => order(draft.content)), { timeout: 20_000 }).toEqual([true]);
    await nothingShown(page);
    await openMain(page);
    await undo(page).click();
    await expect.poll(async () => (await draftsOn(page, "main")).filter(draft => draft.path === "index.html"), { timeout: 20_000 }).toEqual([]);
    await expect(page.frameLocator(".native-preview-frame").locator("main > section").first()).toHaveAttribute("data-key", "hero");
  } finally { await client.close(); }
});

test("move_file held across a branch switch moves main's page, whose Undo at its new place moves it back", async ({ page, baseURL }) => {
  const { client, call } = await connect(page, baseURL);
  try {
    await heldAcross(page, baseURL, "branch", () => call("move_file", { path: "about/index.html", to: "team/index.html", requestId: "held-move-file", waitSeconds: 0 }));
    await expect.poll(async () => (await draftsOn(page, "main")).filter(draft => draft.path.endsWith("index.html")).map(draft => [draft.path, Boolean(draft.deleted || draft.movedTo)]).sort(), { timeout: 20_000 })
      .toEqual(expect.arrayContaining([["about/index.html", true], ["team/index.html", false]]));
    await nothingShown(page);
    await openMain(page, "team/index.html");
    await undo(page).click();
    await expect.poll(async () => (await draftsOn(page, "main")).filter(draft => draft.path === "about/index.html" || draft.path === "team/index.html"), { timeout: 20_000 }).toEqual([]);
    await editorMounted(page, "about/index.html");
  } finally { await client.close(); }
});

test("delete_file held across a branch switch deletes main's file, and the page open as it arrived takes it back", async ({ page, baseURL }) => {
  const { client, call } = await connect(page, baseURL);
  try {
    await heldAcross(page, baseURL, "branch", () => call("delete_file", { path: "robots.txt", requestId: "held-delete", waitSeconds: 0 }));
    await expect.poll(async () => (await draftsOn(page, "main")).map(draft => [draft.path, Boolean(draft.deleted)]), { timeout: 20_000 }).toEqual([["robots.txt", true]]);
    await nothingShown(page);
    await openMain(page);
    await undo(page).click();
    await expect.poll(async () => draftsOn(page, "main"), { timeout: 20_000 }).toEqual([]);
  } finally { await client.close(); }
});

test("create_page held across a branch switch makes main's page, whose Undo there takes it away again", async ({ page, baseURL }) => {
  const { client, call } = await connect(page, baseURL);
  try {
    await heldAcross(page, baseURL, "branch", () => call("create_page", { title: "Held page", slug: "held-page", requestId: "held-create", waitSeconds: 0 }));
    await expect.poll(async () => (await draftsOn(page, "main")).map(draft => [draft.path, draft.content.includes("<title>Held page</title>")]), { timeout: 20_000 }).toEqual([["held-page/index.html", true]]);
    await nothingShown(page);
    await openMain(page, "held-page/index.html");
    await undo(page).click();
    await expect.poll(async () => draftsOn(page, "main"), { timeout: 20_000 }).toEqual([]);
    // Undo took the page away: the page it was made on opens.
    await editorMounted(page, "index.html");
  } finally { await client.close(); }
});

for (const operation of ["add_section", "remove_section", "make_component"] as const) {
  test(`${operation} held across a branch switch lands on main's page, whose Undo takes it back`, async ({ page, baseURL }) => {
    const { client, call } = await connect(page, baseURL);
    try {
      const home = await call("get_page", { page: "/", source: false });
      const filler = (home.sections as { id: string; key?: string }[]).find(section => section.key === "filler")!;
      const args = operation === "add_section" ? { page: "/", component: "feature-block", expectedHash: home.hash, after: filler.id }
        : operation === "remove_section" ? { page: "/", section: filler.id, expectedHash: home.hash }
        : { page: "/", element: filler.id, tag: "held-filler", expectedHash: home.hash };
      await heldAcross(page, baseURL, "branch", () => call(operation, { ...args, requestId: `held-${operation}`, waitSeconds: 0 }));
      const landed = (content: string) => operation === "add_section" ? content.includes("<feature-block") : operation === "remove_section" ? !content.includes('data-key="filler"') : content.includes("<held-filler");
      await expect.poll(async () => (await draftsOn(page, "main")).filter(draft => draft.path === "index.html").map(draft => landed(draft.content)), { timeout: 20_000 }).toEqual([true]);
      await nothingShown(page);
      await openMain(page);
      await undo(page).click();
      await expect.poll(async () => draftsOn(page, "main"), { timeout: 20_000 }).toEqual([]);
    } finally { await client.close(); }
  });
}

// A section command on a page other than the one open as it arrived waits on its own page.
test("remove_section on main's about page, held across a branch switch, waits for its Undo on that page", async ({ page, baseURL }) => {
  const { client, call } = await connect(page, baseURL);
  try {
    const about = await call("get_page", { page: "/about/", source: false });
    const section = (about.sections as { id: string }[]).at(-1)!;
    await heldAcross(page, baseURL, "branch", () => call("remove_section", { page: "/about/", section: section.id, expectedHash: about.hash, requestId: "held-about-remove", waitSeconds: 0 }));
    await expect.poll(async () => (await draftsOn(page, "main")).map(draft => draft.path), { timeout: 20_000 }).toEqual(["about/index.html"]);
    await nothingShown(page);
    // index.html, open as it arrived, takes nothing of it; its own page does.
    await openMain(page);
    await expect(undo(page)).toBeDisabled();
    await openMain(page, "about/index.html");
    await undo(page).click();
    await expect.poll(async () => draftsOn(page, "main"), { timeout: 20_000 }).toEqual([]);
  } finally { await client.close(); }
});
