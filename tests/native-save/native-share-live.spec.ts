import { expect, test, type Browser, type Page } from "@playwright/test";
import { openEditor } from "../support/scenarios";
import { clickOnText } from "./click-text";
import { editorMounted, storedDraft } from "./drafts";

// Share to edit (slice 30; CONTEXT.md "Synced session"): Lex shares the page he shows from the project menu, and
// Anna opens the link in a browser with no sign-in, types her name and edits the heading. Her typing reaches his
// tab as his own unsaved change; her page has no Save, files, settings or agents, and calls nothing of the
// editor's API but the session's own route. Stop sharing ends her session, and the link refuses from then on.
// Default fixture group: the real Worker routes (worker/app.ts `/api/live/share`, `/api/live/guest`) and relay.
const pageErrors: string[] = [];
const heading = "A native browser preview";

const source = (page: Page) => page.evaluate(async () => (await import("/src/components/source-editor.ts")).getMountedSource("index.html") ?? "");

/** A browser with nobody signed in: a guest who only has the link. Every API path it calls is noted. */
async function guest(browser: Browser, phone = false) {
  const context = await browser.newContext(phone
    ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "reduce" }
    : { viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const calls: string[] = [];
  const note = (url: string) => {
    const path = new URL(url).pathname;
    if (/^\/(?:api|auth|mcp)\b/.test(path)) calls.push(path);
  };
  page.on("request", (request) => note(request.url()));
  page.on("websocket", (socket) => note(socket.url()));
  return { context, page, calls };
}

test.beforeEach(() => { pageErrors.length = 0; });

test("a guest edits a heading through Lex's link; Stop sharing ends it and the link refuses", async ({ page: lex, browser, baseURL, context }) => {
  test.setTimeout(150_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  lex.on("pageerror", (error) => pageErrors.push(error.message));
  await openEditor(lex, baseURL);
  await editorMounted(lex);
  await expect(lex.frameLocator(".native-preview-frame").locator(".hero h1")).toHaveText(heading);

  // Share to edit in the project menu: the link is copied, and the item says so, with the menu still open.
  await lex.locator(".repository-menu__trigger").click();
  await lex.getByRole("button", { name: "Share to edit", exact: true }).click();
  const copied = lex.locator(".repository-menu__share-item");
  await expect(copied).toHaveText("Link copied");
  await expect(copied).toBeVisible();
  await expect.poll(() => lex.evaluate(() => navigator.clipboard.readText())).toMatch(/\/live\?s=[a-f\d]{32}#k=[\w-]{43}&site=native-demo&by=/);
  const link = await lex.evaluate(() => navigator.clipboard.readText());
  await expect(copied).toHaveText("Copy edit link", { timeout: 5_000 });
  await expect(lex.getByRole("button", { name: "Stop sharing", exact: true })).toBeVisible();
  await lex.keyboard.press("Escape");

  // Anna opens it, with no account: a name, then the page.
  const anna = await guest(browser);
  await anna.page.goto(link);
  await expect(anna.page.getByRole("heading", { name: /^Edit native-demo with / })).toBeVisible();
  await anna.page.getByLabel("Your name").fill("Anna");
  await anna.page.getByRole("button", { name: "Join", exact: true }).click();
  const annaFrame = anna.page.frameLocator(".live-guest__frame");
  await expect(annaFrame.locator(".hero h1")).toHaveText(heading, { timeout: 20_000 });
  await expect(lex.locator('.repository-menu__person[aria-label="Anna, a guest"]')).toBeVisible();
  await expect(anna.page.locator(".live-guest__person").first()).toHaveAttribute("aria-label", /\(sharing\)$/);

  // She types in the heading: Lex sees it on his page, as his own unsaved change.
  const target = annaFrame.locator(".hero h1");
  await clickOnText(target);
  await expect(target).toHaveAttribute("contenteditable", /.+/);
  await anna.page.keyboard.press("End");
  await anna.page.keyboard.type(" together");
  await expect.poll(() => source(lex), { timeout: 20_000 }).toContain(`${heading} together`);
  await expect(lex.frameLocator(".native-preview-frame").locator(".hero h1")).toHaveText(`${heading} together`);
  await expect.poll(async () => (await storedDraft(lex, "index.html"))?.content ?? "", { timeout: 10_000 }).toContain(`${heading} together`);
  // Her typing stays as she typed it while his tab writes it.
  await expect(target).toHaveText(`${heading} together`);

  // Nothing of the editor is on her page, and she reached nothing of its API but the session's route.
  for (const name of [/save/i, /publish/i, /settings/i, /files/i, /agent/i, /connect/i])
    await expect(anna.page.getByRole("button", { name })).toHaveCount(0);
  await expect(anna.page.locator(".repository-menu, #explorer, .agent-menu")).toHaveCount(0);
  expect([...new Set(anna.calls)]).toEqual(["/api/live/guest"]);

  // Stop sharing: her page says the session ended, and the link refuses.
  await lex.locator(".repository-menu__trigger").click();
  await lex.getByRole("button", { name: "Stop sharing", exact: true }).click();
  await expect(anna.page.getByRole("heading", { name: "This edit link has ended." })).toBeVisible({ timeout: 15_000 });
  await expect(lex.locator(".repository-menu__person")).toHaveCount(0);
  await lex.locator(".repository-menu__trigger").click();
  await expect(lex.getByRole("button", { name: "Share to edit", exact: true })).toBeVisible();
  await lex.keyboard.press("Escape");

  const late = await guest(browser, true);
  const token = new URL(link).searchParams.get("s")!;
  expect((await late.page.request.get(`${baseURL}/api/live/guest?session=${token}`)).status()).toBe(410);
  await late.page.goto(link);
  await late.page.getByLabel("Your name").fill("Sam");
  await late.page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(late.page.getByRole("heading", { name: "This edit link has ended." })).toBeVisible({ timeout: 15_000 });

  await anna.context.close();
  await late.context.close();
  expect(pageErrors).toEqual([]);
});

test("an edit link that is cut short says so", async ({ browser, baseURL }) => {
  const visitor = await guest(browser);
  await visitor.page.goto(`${baseURL}/live?s=0123`);
  await expect(visitor.page.getByRole("heading", { name: "This edit link is not complete." })).toBeVisible();
  expect(visitor.calls).toEqual([]);
  await visitor.context.close();
  expect(pageErrors).toEqual([]);
});
