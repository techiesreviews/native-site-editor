import { expect, test, type Page, type Request } from "@playwright/test";
import { openEditor } from "../support/scenarios";
import { clickOnText } from "./click-text";
import { editorMounted } from "./drafts";

// Preview link (slice 35, ticket 58; CONTEXT.md "Preview link"): Lex shares a preview from the project menu's Preview
// link row (one row, as Connect to MCP: its dot and label are the state, and the row is the only control) and a customer opens
// the link in another browser, on the preview Worker's own address (worker/preview-host.ts; `localhost` here, the
// editor on 127.0.0.1). The real site shows there, its own scripts running, and Lex's typing arrives as he types.
// Closing his editor shows "Not running"; opening it again brings the site back; turning the preview off refuses the
// link. No request to the preview's address carries the editor's cookie, and every answer there says noindex.
const pageErrors: string[] = [];
const heading = "A native browser preview";
// The frame on show (a page drawn again loads behind it first).
const previewHeading = (page: Page) => page.frameLocator(".preview-visit__frame:not(.is-loading)").locator(".hero h1");
// The project menu's Preview link row: the row (pressed to make a link or turn it off), its label and its copy icon.
const previewRow = (page: Page) => page.locator('[data-share="preview"] .share-row__main');
const previewLabel = (page: Page) => page.locator('[data-share="preview"] .share-row__label');
const previewCopy = (page: Page) => page.locator('[data-share="preview"]').getByRole("button", { name: "Copy link" });
/** Opens the project menu and makes a link: the row says it copied it, then waits for a customer. Returns the link. */
async function makeLink(page: Page) {
  // Emptied first, so only this press's link can satisfy the poll below.
  await page.evaluate(() => navigator.clipboard.writeText(""));
  await page.locator(".repository-menu__trigger").click();
  await page.getByRole("button", { name: "Preview link", exact: true }).click();
  await expect(previewLabel(page)).toHaveText("Link copied");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/^http:\/\/localhost:\d+\/s\/[\w-]+\/#k=[\w-]{43}$/);
  return page.evaluate(() => navigator.clipboard.readText());
}

test("a visitor sees Lex's edits live; closing his editor shows not running; turning it off refuses the link", async ({ page: lex, browser, baseURL, context }) => {
  test.setTimeout(180_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  lex.on("pageerror", (error) => pageErrors.push(error.message));
  // Every request Lex's own browser sends to the preview's address, with the cookies it carried.
  const previewRequests: Promise<{ url: string; cookie?: string }>[] = [];
  const watch = (request: Request) => {
    if (new URL(request.url()).hostname === "localhost") previewRequests.push(request.allHeaders().then((headers) => ({ url: request.url(), cookie: headers.cookie })));
  };
  context.on("request", watch);
  await openEditor(lex, baseURL);
  await editorMounted(lex);
  const lexHeading = lex.frameLocator(".native-preview-frame").locator(".hero h1");
  await expect(lexHeading).toHaveText(heading);

  // Preview link: pressed, the row makes the link and copies it ("Link copied"), then waits for a customer. No link
  // field, Copy or Turn off button, and no explainer.
  const link = await makeLink(lex);
  expect(link).toMatch(/^http:\/\/localhost:\d+\/s\/native-demo-[a-f\d]{72}\/#k=[\w-]{43}$/);
  await expect(previewLabel(lex)).toHaveText("Waiting for customer", { timeout: 5_000 });
  await expect(lex.locator('[data-share="preview"] .share-row')).toHaveAttribute("data-dot", "wait");
  await expect(lex.locator("#repository-actions").getByRole("textbox")).toHaveCount(0);
  await expect(lex.getByRole("button", { name: /Turn preview off|Copy$/ })).toHaveCount(0);
  await expect(lex.locator(".repository-menu__trigger")).toHaveAttribute("data-shared", "wait");
  await lex.keyboard.press("Escape");

  // A customer opens it in another browser: the real site, told to search engines to stay out.
  const customer = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const visitor = await customer.newPage();
  visitor.on("pageerror", (error) => pageErrors.push(error.message));
  const opened = await visitor.goto(link);
  expect(opened?.headers()["x-robots-tag"]).toContain("noindex");
  expect(opened?.headers()["set-cookie"]).toBeUndefined();
  await expect(previewHeading(visitor)).toHaveText(heading, { timeout: 20_000 });
  // The site's own files, root-relative addresses included (`/styles/site.css`, `/components/components.js`), come on
  // the preview's address: its stylesheet applies, and its script is the repository's.
  await expect(visitor).toHaveTitle("Native Studio");
  const site = visitor.frames().find((frame) => frame.url().includes("/site/"))!;
  expect(new URL(site.url()).origin).toBe(new URL(link).origin);
  await expect.poll(() => site.evaluate(() => [...document.styleSheets].reduce((sum, sheet) => sum + sheet.cssRules.length, 0))).toBeGreaterThan(0);
  expect(await site.evaluate(async () => (await fetch("/components/components.js")).text())).toContain("component loader");
  expect(await site.evaluate(async () => (await fetch("/no-such-file.txt")).status)).toBe(404);
  expect((await customer.request.get(new URL("/robots.txt", link).href)).headers()["x-robots-tag"]).toContain("noindex");

  // Lex's row counts the customer, its dot and the tile's green; the copy icon copies the link again.
  await lex.locator(".repository-menu__trigger").click();
  await expect(previewLabel(lex)).toHaveText("1 watching", { timeout: 20_000 });
  await expect(lex.locator('[data-share="preview"] .share-row')).toHaveAttribute("data-dot", "on");
  await expect(lex.locator(".repository-menu__trigger")).toHaveAttribute("data-shared", "on");
  await lex.evaluate(() => navigator.clipboard.writeText(""));
  await previewRow(lex).hover();
  await previewCopy(lex).click();
  await expect(previewLabel(lex)).toHaveText("Link copied");
  await expect.poll(() => lex.evaluate(() => navigator.clipboard.readText())).toBe(link);
  await lex.keyboard.press("Escape");

  // Lex types in his heading: the customer sees each change arrive.
  await clickOnText(lexHeading);
  await expect(lexHeading).toHaveAttribute("contenteditable", /.+/);
  await lex.keyboard.press("End");
  await lex.keyboard.type(" live");
  await expect(previewHeading(visitor)).toHaveText(`${heading} live`, { timeout: 20_000 });
  await lex.keyboard.press("Escape");

  // Lex opens the link in his own browser too: the preview's address never gets the editor's cookie.
  const own = await context.newPage();
  await own.goto(link);
  await expect(previewHeading(own)).toHaveText(`${heading} live`, { timeout: 20_000 });
  await own.close();
  const sent = await Promise.all(previewRequests);
  expect(sent.length).toBeGreaterThan(2);
  expect(sent.filter((request) => request.cookie)).toEqual([]);
  expect((await context.cookies("http://localhost")).length).toBe(0);
  expect((await context.cookies(baseURL)).length).toBeGreaterThan(0);

  // Lex closes his editor: the link shows a plain "not running" page.
  await lex.close();
  await expect(visitor.getByRole("heading", { name: "Not running" })).toBeVisible({ timeout: 20_000 });
  await expect(visitor.getByText("This preview shows edits while the editor is open.")).toBeVisible();

  // He opens it again: the preview runs again by itself, with his unsaved words.
  const back = await context.newPage();
  back.on("pageerror", (error) => pageErrors.push(error.message));
  await openEditor(back, baseURL);
  await editorMounted(back);
  // (The preview Worker answers "not running" from memory for up to 20 s, and the page looks again ever more rarely.)
  await expect(previewHeading(visitor)).toHaveText(`${heading} live`, { timeout: 60_000 });

  // He presses the row: the link is off, the customer's page says so, and the link refuses from then on.
  await back.locator(".repository-menu__trigger").click();
  await expect(previewLabel(back)).toHaveText("1 watching", { timeout: 20_000 });
  await previewRow(back).click();
  await expect(back.getByRole("button", { name: "Preview link", exact: true })).toBeVisible();
  await expect(back.locator(".repository-menu__trigger")).not.toHaveAttribute("data-shared");
  await expect(visitor.getByRole("heading", { name: "This preview link is turned off." })).toBeVisible({ timeout: 20_000 });
  const later = await customer.newPage();
  await later.goto(link);
  await expect(later.getByRole("heading", { name: "This preview link is turned off." })).toBeVisible({ timeout: 20_000 });
  expect((await customer.request.get(new URL("live", link.replace(/#.*$/, "")).href)).status()).toBe(410);

  context.off("request", watch);
  await customer.close();
  expect(pageErrors).toEqual([]);
});

test("on a phone, the Preview link row and its copy icon are full tap targets, and the icon always shows", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
  await phone.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await phone.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openEditor(page, baseURL);
  await editorMounted(page);
  const height = async (target: ReturnType<Page["locator"]>) => (await target.boundingBox())?.height ?? 0;
  await page.locator(".repository-menu__trigger").tap();
  const share = page.getByRole("button", { name: "Preview link", exact: true });
  await expect(share).toBeVisible({ timeout: 15_000 });
  expect(await height(share)).toBeGreaterThanOrEqual(44);
  await share.tap();
  await expect(previewLabel(page)).toHaveText("Waiting for customer", { timeout: 10_000 });
  await expect(previewCopy(page)).toBeVisible();
  expect(await height(previewCopy(page))).toBeGreaterThanOrEqual(44);
  expect((await previewCopy(page).boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(44);
  await previewRow(page).tap();
  await expect(share).toBeVisible();
  await phone.close();
  expect(pageErrors).toEqual([]);
});

// A site in a folder of its address (fixtures/native-subfolder: https://user.github.io/my-site/) writes its addresses
// with that folder: the preview takes it off to find the file, keeps the link's moves in the folder, and still answers
// the same address without it (the fixture's `/components/components.js`).
test("a site in a sub-folder previews with its folder's stylesheet, picture and page links", async ({ page: lex, browser, baseURL, context }) => {
  test.setTimeout(120_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  lex.on("pageerror", (error) => pageErrors.push(error.message));
  await lex.goto(`${baseURL}/#repo=532&branch=main&file=index.html`);
  await expect(lex.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await expect(lex.frameLocator(".native-preview-frame").locator("h1")).toHaveText("Found where they are");
  const link = await makeLink(lex);
  await lex.keyboard.press("Escape");

  const customer = await browser.newContext();
  const visitor = await customer.newPage();
  visitor.on("pageerror", (error) => pageErrors.push(error.message));
  await visitor.goto(link);
  const site = visitor.frameLocator(".preview-visit__frame:not(.is-loading)");
  await expect(site.locator("h1")).toHaveText("Found where they are", { timeout: 20_000 });
  const frame = () => visitor.frames().find((each) => each.url().includes("/site/"))!;
  // The stylesheet and the picture at /my-site/…, and the script without the folder.
  await expect.poll(() => frame().evaluate(() => [...document.styleSheets].reduce((sum, sheet) => sum + sheet.cssRules.length, 0))).toBeGreaterThan(0);
  await expect.poll(() => frame().evaluate(() => (document.querySelector("img") as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(await frame().evaluate(async () => (await fetch("/components/components.js")).status)).toBe(200);
  // A move stays in the folder.
  expect(await frame().evaluate(async () => { const answer = await fetch("/my-site/notes/first-note", { redirect: "manual" }); return answer.type === "opaqueredirect" || answer.redirected ? "moved" : String(answer.status); })).toBe("moved");
  // The page link with the folder opens the note.
  await site.getByRole("link", { name: "First note" }).click();
  await expect(site.locator("h1")).toHaveText("First note", { timeout: 20_000 });
  expect(new URL(frame().url()).pathname).toMatch(/\/site\/my-site\/notes\/first-note\/$/);

  await lex.locator(".repository-menu__trigger").click();
  await previewRow(lex).click();
  await expect(lex.getByRole("button", { name: "Preview link", exact: true })).toBeVisible();
  await customer.close();
  expect(pageErrors).toEqual([]);
});

test("the visitor's page carries on after Lex's connection drops and comes back", async ({ page: lex, browser, baseURL, context }) => {
  test.setTimeout(120_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  lex.on("pageerror", (error) => pageErrors.push(error.message));
  // Lex's preview socket, through a route whose page side the test cuts, as when a network drops. (The copy needs the
  // clipboard permission to say Link copied.)
  const pages: { close(options?: { code?: number }): Promise<void> }[] = [];
  await lex.routeWebSocket(/\/api\/live\/preview/, (socket) => { socket.connectToServer(); pages.push(socket); });
  await openEditor(lex, baseURL);
  await editorMounted(lex);
  const lexHeading = lex.frameLocator(".native-preview-frame").locator(".hero h1");
  const link = await makeLink(lex);
  await lex.keyboard.press("Escape");

  const customer = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const visitor = await customer.newPage();
  visitor.on("pageerror", (error) => pageErrors.push(error.message));
  await visitor.goto(link);
  await expect(previewHeading(visitor)).toHaveText(heading, { timeout: 20_000 });

  // His tab joins again, and the room hears the old socket leave and the new one join: the visitor takes the site
  // from the new one and follows its edits. Meanwhile his row says it is reconnecting, then counts the visitor again.
  await lex.locator(".repository-menu__trigger").click();
  await expect(previewLabel(lex)).toHaveText("1 watching", { timeout: 20_000 });
  const sockets = pages.length;
  await pages.at(-1)!.close({ code: 4000 });
  await expect(previewLabel(lex)).toHaveText("Reconnecting…");
  await expect(lex.locator('[data-share="preview"] .share-row')).toHaveAttribute("data-dot", "busy");
  await expect.poll(() => pages.length, { timeout: 20_000 }).toBeGreaterThan(sockets);
  await expect(previewLabel(lex)).toHaveText("1 watching", { timeout: 20_000 });
  await lex.keyboard.press("Escape");
  await clickOnText(lexHeading);
  await expect(lexHeading).toHaveAttribute("contenteditable", /.+/);
  await lex.keyboard.press("End");
  await lex.keyboard.type(" back");
  await expect(previewHeading(visitor)).toHaveText(`${heading} back`, { timeout: 20_000 });
  await lex.keyboard.press("Escape");

  await customer.close();
  expect(pageErrors).toEqual([]);
});

test("in a 390 px window with a mouse (as the screenshots take it), Preview link is a full tap target too", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const narrow = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await narrow.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openEditor(page, baseURL);
  await editorMounted(page);
  await page.locator(".repository-menu__trigger").click();
  const share = page.getByRole("button", { name: "Preview link", exact: true });
  await expect(share).toBeVisible({ timeout: 15_000 });
  expect((await share.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await narrow.close();
  expect(pageErrors).toEqual([]);
});

test("a second visitor opening the link leaves the first one's page as it is", async ({ page: lex, browser, baseURL, context }) => {
  test.setTimeout(120_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  lex.on("pageerror", (error) => pageErrors.push(error.message));
  await openEditor(lex, baseURL);
  await editorMounted(lex);
  const link = await makeLink(lex);
  await lex.keyboard.press("Escape");

  const customers = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const first = await customers.newPage();
  first.on("pageerror", (error) => pageErrors.push(error.message));
  await first.goto(link);
  await expect(previewHeading(first)).toHaveText(heading, { timeout: 20_000 });
  // A mark in the first visitor's page: a page drawn again would not carry it.
  const shown = first.locator(".preview-visit__frame:not(.is-loading)");
  await shown.evaluate((frame: HTMLIFrameElement) => { (frame.contentWindow as Window & { mark?: number }).mark = 1; });

  const second = await customers.newPage();
  second.on("pageerror", (error) => pageErrors.push(error.message));
  await second.goto(link);
  await expect(previewHeading(second)).toHaveText(heading, { timeout: 20_000 });
  // The second visitor's hello reached the first one's page too by now (it goes to the whole room).
  await second.waitForTimeout(1_000); // fixed-wait: proving a redraw never comes (a negative)
  expect(await shown.evaluate((frame: HTMLIFrameElement) => (frame.contentWindow as Window & { mark?: number }).mark)).toBe(1);
  await expect(first.locator(".preview-visit__frame")).toHaveCount(1);

  await customers.close();
  expect(pageErrors).toEqual([]);
});

test("a file the visitor's page asks for while its connection drops is asked for again once it is back", async ({ page: lex, browser, baseURL, context }) => {
  test.setTimeout(120_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  lex.on("pageerror", (error) => pageErrors.push(error.message));
  await openEditor(lex, baseURL);
  await editorMounted(lex);
  const link = await makeLink(lex);
  await lex.keyboard.press("Escape");

  const customer = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const visitor = await customer.newPage();
  visitor.on("pageerror", (error) => pageErrors.push(error.message));
  // The visitor's room socket, through a route the test cuts as a network would.
  const sockets: { close(options?: { code?: number }): Promise<void> }[] = [];
  await visitor.routeWebSocket(/\/live(\?|$)/, (socket) => { socket.connectToServer(); sockets.push(socket); });
  await visitor.goto(link);
  await expect(previewHeading(visitor)).toHaveText(heading, { timeout: 20_000 });
  const site = visitor.frames().find((frame) => frame.url().includes("/site/"))!;

  // The page asks for a file while its socket is gone; Lex's tab answers it once the room is back (a 404 here,
  // not the 504 of an ask that waited in vain).
  await sockets.at(-1)!.close({ code: 4000 });
  const status = site.evaluate(async () => (await fetch("/not-asked-before.txt")).status);
  expect(await status).toBe(404);
  await expect(previewHeading(visitor)).toHaveText(heading);

  await customer.close();
  expect(pageErrors).toEqual([]);
});
