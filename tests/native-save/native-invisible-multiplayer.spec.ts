import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, test, type Page, type Route } from "@playwright/test";
import { openEditor, openImagePicker, pickPicture, switchSiteMidUpload } from "../support/scenarios";
import { storedDrafts } from "./drafts";

// Invisible multiplayer (ticket 27): work started on main keeps going there after Lex opens
// feature (or another site, or another page of main), as a second, invisible user would, and lands
// on its own page as an unsaved change; nothing shows or lands on what is shown, and the repository
// menu counts it (ticket 24). Each cell holds the work at a request with `page.route`, switches,
// and lets it go: an agent's Media change, the picker's Use, the image popup's trim. A pinned
// batch's attempt and a Media pane edit make no request that can be held: their cells are unit
// tests (tests/media-batch.test.ts, tests/media-workspace.test.ts).
// Default fixture group: native-starter (#repo=501), native-cards (#repo=540) as the other site.
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
    // A background frame's answer to a measurement (preview-link.ts "measure-image" → "image-measured").
    document.body.dataset.backgroundMeasured = "0";
    window.addEventListener("message", event => {
      const from = [...document.querySelectorAll<HTMLIFrameElement>(".background-page iframe")].some(frame => frame.contentWindow === event.source);
      if (from && (event.data as { type?: unknown } | null)?.type === "image-measured") document.body.dataset.backgroundMeasured = String(Number(document.body.dataset.backgroundMeasured) + 1);
    });
  });
  return { opened: () => page.evaluate(() => Number(document.body.dataset.backgroundPages)), open: () => page.locator(".background-page").count(),
    measured: () => page.evaluate(() => Number(document.body.dataset.backgroundMeasured)) };
}
const preview = (page: Page) => page.frameLocator(".native-preview-frame");
/** The repository menu's count of work finished on a workspace not shown (src/finished-elsewhere.ts). */
const finishedCount = (page: Page) => page.locator(".repository-menu__trigger .repository-menu__finished");
/** index.html as the editor shows it now. */
const shownSource = async (page: Page) => {
  await expect.poll(() => page.evaluate(async () => (await import("/src/components/code-editor.ts")).isMounted("index.html")), { timeout: 20_000 }).toBe(true);
  return page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")!);
};
/** Opens feature (a branch of the same site) or another site (native-cards, repository 540). */
async function switchTo(page: Page, baseURL: string | undefined, to: "branch" | "site") {
  if (to === "branch") return switchSiteMidUpload(page, baseURL);
  await page.evaluate(() => { location.hash = "repo=540&branch=main&file=index.html"; });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}
const openMain = (page: Page) => page.evaluate(() => { location.hash = "repo=501&branch=main&file=index.html"; });

for (const to of ["branch", "site"] as const) {
  test(`an agent's Media change held across a ${to} switch lands on its own branch's page, not the one shown`, async ({ page, baseURL }) => {
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
    await switchTo(page, baseURL, to);
    media.release();
    await placing;
    // Placed on main's page, as an unsaved change there; feature, shown, has nothing of it.
    await expect.poll(async () => (await draftsOn(page, "main")).filter(draft => draft.path === "index.html").map(draft => draft.content.includes("/images/studio-desk.svg")), { timeout: 20_000 }).toEqual([true]);
    expect(await draftsOn(page, "feature")).toEqual([]);
    expect(await draftsOn(page, "main", 540)).toEqual([]);
    expect(await shownSource(page)).not.toContain("studio-desk");
    await expect(finishedCount(page)).toHaveText("1");
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
}

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
    await switchTo(page, baseURL, to);
    placing.release();
    await expect.poll(async () => (await draftsOn(page, "main")).filter(draft => draft.path === "index.html").map(draft => draft.content.includes('src="/images/studio-desk.svg"')), { timeout: 20_000 }).toEqual([true]);
    // Its toast says where it landed (the repository too, when another is shown); what is shown has nothing of it.
    await expect(page.locator("#status")).toHaveText(to === "branch" ? /^On main: Image replaced/ : /^On [^ ]+\/native-demo \(main\): Image replaced/);
    expect(await draftsOn(page, "feature")).toEqual([]);
    expect(await draftsOn(page, "main", 540)).toEqual([]);
    expect(await shownSource(page)).not.toContain("studio-desk");
    await expect(finishedCount(page)).toHaveText("1");
    expect(await background.opened()).toBeGreaterThan(0);
    expect(await background.measured(), "the hidden frame measured the picture").toBeGreaterThan(0);
    await expect.poll(background.open).toBe(0);
    if (to === "branch") {
      // Measured, not guessed: the same Use done on show (feature's page is main's) writes the same picture.
      const placedTag = (text: string | undefined) => text?.match(/<img\b[^>]*studio-desk[^>]*>/)?.[0];
      const away = placedTag((await draftsOn(page, "main")).find(draft => draft.path === "index.html")?.content);
      await openImagePicker(page, ".hero img");
      await picker.getByRole("button", { name: "Choose images/studio-desk.svg", exact: true }).click();
      await picker.getByRole("button", { name: "Use image", exact: true }).click();
      await expect.poll(async () => placedTag(await shownSource(page)), { timeout: 20_000 }).toBeTruthy();
      expect(away).toBe(placedTag(await shownSource(page)));
    }
    // Opened again, main's page has the picture placed.
    await openMain(page);
    await expect(page.locator("#status")).toContainText("main", { timeout: 30_000 });
    await expect.poll(() => shownSource(page), { timeout: 20_000 }).toContain('src="/images/studio-desk.svg"');
  });
}

// A raster picture to trim (the fixture's pictures are SVGs, which cannot be): four coloured quarters.
const quarters = (page: Page) => page.evaluate(() => {
  const canvas = document.createElement("canvas");
  canvas.width = 800; canvas.height = 400;
  const context = canvas.getContext("2d")!;
  [["#d22", 0, 0], ["#2a2", 400, 0], ["#22d", 0, 200], ["#dd2", 400, 200]].forEach(([colour, x, y]) => { context.fillStyle = colour as string; context.fillRect(x as number, y as number, 400, 200); });
  return canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
});

// The image popup's Done (here a Free trim, written as the popup closes) held across a branch switch:
// the trimmed copy and the page using it land on main, nothing on feature.
test("the image popup's trim, held across a branch switch as it closes, lands on main's page", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openEditor(page, baseURL);
  // The hero's placeholder opens Add media; an ordinary picture there opens the Image popup.
  const picture = await page.request.get(`${baseURL}/__demo/file?path=images/placeholder.svg`);
  const home = await page.request.get(`${baseURL}/__demo/file?path=index.html`);
  for (const [path, content] of [["images/popup-picture.svg", await picture.text()], ["index.html", (await home.text()).replace('src="/images/placeholder.svg"', 'src="/images/popup-picture.svg"')]])
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).ok()).toBe(true);
  await page.reload();
  await expect(preview(page).locator(".hero img")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#content [role='textbox']").first()).toBeAttached({ timeout: 30_000 });
  const popup = page.getByRole("dialog", { name: "Image", exact: true }), picker = page.getByRole("dialog", { name: /^Choose image( or video)?$/ });
  const openPopup = async () => {
    await pickPicture(page, ".hero img");
    await page.getByRole("toolbar", { name: "Edit bar" }).locator(".edit-bar__media").click();
    await expect(popup).toBeVisible();
  };
  // A photo in the spot first, on main as shown.
  await openPopup();
  await popup.getByRole("button", { name: "Replace", exact: true }).click();
  await picker.locator('input[name="media-upload"]').setInputFiles({ name: "Quarters.jpg", mimeType: "image/jpeg", buffer: Buffer.from(await quarters(page), "base64") });
  await expect(picker.getByRole("button", { name: "Choose Quarters.jpg", exact: true })).toHaveAttribute("aria-pressed", "true");
  await picker.getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect.poll(() => shownSource(page)).toMatch(/src="\/media\/images\/quarters\.webp"/);
  // Free: a corner dragged in; Close writes the trim, its code held while feature opens.
  await openPopup();
  await popup.getByRole("button", { name: /^Shape:/ }).click();
  await popup.getByRole("menuitemradio", { name: "Free", exact: true }).click();
  const box = (await popup.locator(".image-popup__picbox").boundingBox())!, handle = (await popup.locator(".image-popup__corner--se").boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 - box.width * 0.5, handle.y + handle.height / 2 - box.height * 0.3, { steps: 5 });
  await page.mouse.up();
  await expect(popup.getByRole("status").filter({ hasText: "Saves a new picture for this spot" })).toBeVisible();
  const trimming = await hold(page, "/src/page-builder/place-trim.ts");
  await popup.getByRole("button", { name: "Close", exact: true }).click();
  await trimming.reached;
  await switchSiteMidUpload(page, baseURL);
  trimming.release();
  await expect.poll(async () => (await draftsOn(page, "main")).map(draft => draft.path).sort(), { timeout: 30_000 }).toContain("media/images/quarters-crop.webp");
  expect((await draftsOn(page, "main")).find(draft => draft.path === "index.html")?.content).toMatch(/src="\/media\/images\/quarters-crop\.webp"/);
  await expect(page.locator("#status")).toContainText("On main: Picture trimmed");
  await expect(finishedCount(page)).toHaveText("1");
  expect(await draftsOn(page, "feature")).toEqual([]);
  expect(await shownSource(page)).not.toContain("quarters");
});

// Another page of main opened while the Use runs: the picture lands on the page it was chosen for,
// as an unsaved change there, and Lex stays on the page he opened.
test("a picture placed with the picker's Use, held while another page of main opens, lands on its own page", async ({ page, baseURL }) => {
  await openEditor(page, baseURL);
  await expect(preview(page).locator(".hero img")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#content [role='textbox']").first()).toBeAttached({ timeout: 30_000 });
  await openImagePicker(page, ".hero img");
  const picker = page.getByRole("dialog", { name: "Choose image", exact: true });
  await picker.getByRole("button", { name: "Choose images/studio-desk.svg", exact: true }).click();
  const placing = await hold(page, "/src/page-builder/media-place.ts");
  await picker.getByRole("button", { name: "Use image", exact: true }).click();
  await placing.reached;
  await page.evaluate(() => { location.hash = "repo=501&branch=main&file=about/index.html"; });
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "about/index.html", { timeout: 30_000 });
  placing.release();
  await expect.poll(async () => (await draftsOn(page, "main")).filter(draft => draft.path === "index.html").map(draft => draft.content.includes('src="/images/studio-desk.svg"')), { timeout: 20_000 }).toEqual([true]);
  await expect(page.locator("#status")).toHaveText(/^On index.html: Image replaced/);
  // Lex stays where he went; that page has nothing of it, and no note is needed for a page of the site shown.
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "about/index.html");
  expect((await draftsOn(page, "main")).map(draft => draft.path)).toEqual(["index.html"]);
  await expect(finishedCount(page)).toBeHidden();
});

