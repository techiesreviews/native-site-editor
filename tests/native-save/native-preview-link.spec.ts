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
  await expect(previewHeading(visitor)).toHaveText(`${heading} live`, { timeout: 30_000 });

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
