import { expect, test, type Page, type Request } from "@playwright/test";
import { openEditor } from "../support/scenarios";
import { clickOnText } from "./click-text";
import { editorMounted } from "./drafts";

// Share preview (slice 35; CONTEXT.md "Preview link"): Lex shares a preview from the project menu and a customer opens
// the link in another browser, on the preview Worker's own address (worker/preview-host.ts; `localhost` here, the
// editor on 127.0.0.1). The real site shows there, its own scripts running, and Lex's typing arrives as he types.
// Closing his editor shows "Not running"; opening it again brings the site back; turning the preview off refuses the
// link. No request to the preview's address carries the editor's cookie, and every answer there says noindex.
const pageErrors: string[] = [];
const heading = "A native browser preview";
// The frame on show (a page drawn again loads behind it first).
const previewHeading = (page: Page) => page.frameLocator(".preview-visit__frame:not(.is-loading)").locator(".hero h1");

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

  // Share preview: the link is copied, and the menu shows it, when it ends and Turn preview off.
  await lex.locator(".repository-menu__trigger").click();
  await lex.getByRole("button", { name: "Share preview", exact: true }).click();
  const copy = lex.locator(".repository-menu__preview-copy");
  await expect(copy).toHaveText("Copied");
  await expect.poll(() => lex.evaluate(() => navigator.clipboard.readText())).toMatch(/^http:\/\/localhost:\d+\/s\/native-demo-[a-f\d]{72}\/#k=[\w-]{43}$/);
  const link = await lex.evaluate(() => navigator.clipboard.readText());
  await expect(lex.getByRole("textbox", { name: "Preview link" })).toHaveValue(link);
  await expect(lex.locator(".repository-menu__preview-ends")).toHaveText(/^Works while your editor is open · ends /);
  await expect(copy).toHaveText("Copy", { timeout: 5_000 });
  await expect(lex.getByRole("button", { name: "Turn preview off", exact: true })).toBeVisible();
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

  // He turns it off: the customer's page says so, and the link refuses from then on.
  await back.locator(".repository-menu__trigger").click();
  await back.getByRole("button", { name: "Turn preview off", exact: true }).click();
  await expect(back.getByRole("button", { name: "Share preview", exact: true })).toBeVisible();
  await expect(visitor.getByRole("heading", { name: "This preview link is turned off." })).toBeVisible({ timeout: 20_000 });
  const later = await customer.newPage();
  await later.goto(link);
  await expect(later.getByRole("heading", { name: "This preview link is turned off." })).toBeVisible({ timeout: 20_000 });
  expect((await customer.request.get(new URL("live", link.replace(/#.*$/, "")).href)).status()).toBe(410);

  context.off("request", watch);
  await customer.close();
  expect(pageErrors).toEqual([]);
});

test("on a phone, Share preview, the link's field, Copy and Turn preview off are full tap targets", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
  await phone.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await phone.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openEditor(page, baseURL);
  await editorMounted(page);
  const height = async (target: ReturnType<Page["locator"]>) => (await target.boundingBox())?.height ?? 0;
  await page.locator(".repository-menu__trigger").tap();
  const share = page.getByRole("button", { name: "Share preview", exact: true });
  await expect(share).toBeVisible({ timeout: 15_000 });
  expect(await height(share)).toBeGreaterThanOrEqual(44);
  await share.tap();
  await expect(page.getByRole("button", { name: "Turn preview off", exact: true })).toBeVisible();
  for (const target of [page.getByRole("textbox", { name: "Preview link" }), page.locator(".repository-menu__preview-copy"), page.getByRole("button", { name: "Turn preview off", exact: true })])
    expect(await height(target)).toBeGreaterThanOrEqual(44);
  await page.getByRole("button", { name: "Turn preview off", exact: true }).tap();
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
  await lex.locator(".repository-menu__trigger").click();
  await lex.getByRole("button", { name: "Share preview", exact: true }).click();
  await expect(lex.getByRole("button", { name: "Turn preview off", exact: true })).toBeVisible();
  const link = await lex.getByRole("textbox", { name: "Preview link" }).inputValue();
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
  await lex.getByRole("button", { name: "Turn preview off", exact: true }).click();
  await expect(lex.getByRole("button", { name: "Share preview", exact: true })).toBeVisible();
  await customer.close();
  expect(pageErrors).toEqual([]);
});

test("the visitor's page carries on after Lex's connection drops and comes back", async ({ page: lex, browser, baseURL, context }) => {
  test.setTimeout(120_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  lex.on("pageerror", (error) => pageErrors.push(error.message));
  // Lex's preview socket, through a route whose page side the test cuts, as when a network drops. (The copy needs the
  // clipboard permission to say Copied.)
  const pages: { close(options?: { code?: number }): Promise<void> }[] = [];
  await lex.routeWebSocket(/\/api\/live\/preview/, (socket) => { socket.connectToServer(); pages.push(socket); });
  await openEditor(lex, baseURL);
  await editorMounted(lex);
  const lexHeading = lex.frameLocator(".native-preview-frame").locator(".hero h1");
  await lex.locator(".repository-menu__trigger").click();
  await lex.getByRole("button", { name: "Share preview", exact: true }).click();
  await expect(lex.locator(".repository-menu__preview-copy")).toHaveText("Copied");
  const link = await lex.getByRole("textbox", { name: "Preview link" }).inputValue();
  await lex.keyboard.press("Escape");

  const customer = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const visitor = await customer.newPage();
  visitor.on("pageerror", (error) => pageErrors.push(error.message));
  await visitor.goto(link);
  await expect(previewHeading(visitor)).toHaveText(heading, { timeout: 20_000 });

  // His tab joins again, and the room hears the old socket leave and the new one join: the visitor takes the site
  // from the new one and follows its edits.
  const sockets = pages.length;
  await pages.at(-1)!.close({ code: 4000 });
  await expect.poll(() => pages.length, { timeout: 20_000 }).toBeGreaterThan(sockets);
  await clickOnText(lexHeading);
  await expect(lexHeading).toHaveAttribute("contenteditable", /.+/);
  await lex.keyboard.press("End");
  await lex.keyboard.type(" back");
  await expect(previewHeading(visitor)).toHaveText(`${heading} back`, { timeout: 20_000 });
  await lex.keyboard.press("Escape");

  await customer.close();
  expect(pageErrors).toEqual([]);
});

test("in a 390 px window with a mouse (as the screenshots take it), Share preview is a full tap target too", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const narrow = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await narrow.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openEditor(page, baseURL);
  await editorMounted(page);
  await page.locator(".repository-menu__trigger").click();
  const share = page.getByRole("button", { name: "Share preview", exact: true });
  await expect(share).toBeVisible({ timeout: 15_000 });
  expect((await share.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await narrow.close();
  expect(pageErrors).toEqual([]);
});
