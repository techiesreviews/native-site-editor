import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, test, type Page, type Route } from "@playwright/test";
import { openEditor, openImagePicker, switchSiteMidUpload } from "../support/scenarios";
import { storedDrafts } from "./drafts";

// Invisible multiplayer (ticket 27): work started on main keeps going there after Lex opens
// feature, as a second, invisible user would, and lands on main as unsaved changes; nothing shows
// or lands on feature. Each case holds the work at a request with `page.route`, switches, and
// lets it go.
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
/** Whether a background page (src/background-page.ts) has been opened since `watchBackground`, and how many are open now. */
async function watchBackground(page: Page) {
  await page.evaluate(() => {
    document.body.dataset.backgroundPages = "0";
    new MutationObserver(records => {
      for (const record of records) for (const added of record.addedNodes)
        if (added instanceof HTMLElement && added.classList.contains("background-page")) document.body.dataset.backgroundPages = String(Number(document.body.dataset.backgroundPages) + 1);
    }).observe(document.body, { childList: true });
  });
  return { opened: () => page.evaluate(() => Number(document.body.dataset.backgroundPages)), open: () => page.locator(".background-page").count() };
}
const preview = (page: Page) => page.frameLocator(".native-preview-frame");
/** index.html as the editor shows it now. */
const shownSource = async (page: Page) => {
  await expect.poll(() => page.evaluate(async () => (await import("/src/components/code-editor.ts")).isMounted("index.html")), { timeout: 20_000 }).toBe(true);
  return page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")!);
};
const openMain = (page: Page) => page.evaluate(() => { location.hash = "repo=501&branch=main&file=index.html"; });

test("an agent's Media change held across a branch switch lands on its own branch's page, not the one shown", async ({ page, baseURL }) => {
  await openEditor(page, baseURL);
  const messages: string[] = [];
  page.on("websocket", socket => socket.on("framereceived", frame => { if (typeof frame.payload === "string") messages.push(frame.payload); }));
  await page.locator(".repository-menu__trigger").click();
  const made = page.waitForResponse(response => new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Connect with MCP", exact: true }).click();
  const { token } = await (await made).json() as { token: string };
  await expect.poll(() => messages.some(message => message.includes('"type":"ready"'))).toBe(true);
  await page.keyboard.press("Escape");
  const client = new Client({ name: "invisible-multiplayer-spec", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  try {
    const inspection = await client.callTool({ name: "inspect_preview", arguments: { page: "index.html", selector: ".hero img", limit: 1, waitSeconds: 25 } });
    const element = JSON.parse((inspection.content as { text: string }[])[0].text).result.elements[0].element as string;
    // The Media tools' chunk, loaded by the first Media change after it arrived: held while the branch switches.
    const media = await hold(page, "/src/agent-tools-media.ts"), background = await watchBackground(page);
    const placing = client.callTool({ name: "place_media", arguments: { path: "index.html", element, file: "images/studio-desk.svg", requestId: "invisible-place", waitSeconds: 0 } })
      .catch(error => ({ isError: true, content: [{ text: String(error) }] }));
    await media.reached;
    await switchSiteMidUpload(page, baseURL);
    media.release();
    await placing;
    // Placed on main's page, as an unsaved change there; feature, shown, has nothing of it.
    await expect.poll(async () => (await draftsOn(page, "main")).filter(draft => draft.path === "index.html").map(draft => draft.content.includes("/images/studio-desk.svg")), { timeout: 20_000 }).toEqual([true]);
    expect(await draftsOn(page, "feature")).toEqual([]);
    await expect(preview(page).locator(".hero img")).not.toHaveAttribute("src", /studio-desk/);
    // The picture was measured in a background page of main's index.html, which closed once done.
    expect(await background.opened()).toBeGreaterThan(0);
    await expect.poll(background.open).toBe(0);
    // Back on main the agent learns it was applied, and the page shows it.
    const ready = messages.filter(message => message.includes('"type":"ready"')).length;
    await openMain(page);
    await expect(page.locator("#status")).toContainText("main", { timeout: 30_000 });
    await expect.poll(() => messages.filter(message => message.includes('"type":"ready"')).length, { timeout: 30_000 }).toBeGreaterThan(ready);
    const status = await client.callTool({ name: "get_command_status", arguments: { requestId: "invisible-place" } });
    expect(JSON.parse((status.content as { text: string }[])[0].text)).toMatchObject({ requestId: "invisible-place", state: "applied" });
  } finally { await client.close(); }
});

for (const to of ["branch", "site"] as const) {
  test(`a picture placed with the picker's Use, held across a ${to} switch, lands on the page it was chosen for`, async ({ page, baseURL }) => {
    await openEditor(page, baseURL);
    await expect(preview(page).locator(".hero img")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#content [role='textbox']").first()).toBeAttached({ timeout: 30_000 });
    await openImagePicker(page, ".hero img");
    const picker = page.getByRole("dialog", { name: "Choose image", exact: true });
    await picker.getByRole("button", { name: "Choose images/studio-desk.svg", exact: true }).click();
    // The placement's chunk, loaded by Use: held while another branch or site opens.
    const placing = await hold(page, "/src/page-builder/media-place.ts"), background = await watchBackground(page);
    await picker.getByRole("button", { name: "Use image", exact: true }).click();
    await placing.reached;
    if (to === "branch") await switchSiteMidUpload(page, baseURL);
    else {
      await page.evaluate(() => { location.hash = "repo=540&branch=main&file=index.html"; });
      await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
    }
    placing.release();
    await expect.poll(async () => (await draftsOn(page, "main")).filter(draft => draft.path === "index.html").map(draft => draft.content.includes('src="/images/studio-desk.svg"')), { timeout: 20_000 }).toEqual([true]);
    // Its toast says where it landed (the repository too, when another is shown); what is shown has nothing of it.
    await expect(page.locator("#status")).toHaveText(to === "branch" ? /^On main: Image replaced/ : /^On [^ ]+\/native-demo \(main\): Image replaced/);
    expect(await draftsOn(page, "feature")).toEqual([]);
    expect(await draftsOn(page, "main", 540)).toEqual([]);
    expect(await shownSource(page)).not.toContain("studio-desk");
    expect(await background.opened()).toBeGreaterThan(0);
    await expect.poll(background.open).toBe(0);
    // Opened again, main's page has the picture placed.
    await openMain(page);
    await expect(page.locator("#status")).toContainText("main", { timeout: 30_000 });
    await expect.poll(() => shownSource(page), { timeout: 20_000 }).toContain('src="/images/studio-desk.svg"');
  });
}
