import { expect, test, type Browser, type Page } from "@playwright/test";
import { openEditor, openPages } from "../support/scenarios";
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

/** Lex shares from the project menu: the item says "Link copied" with the menu still open; the link from the clipboard. */
async function share(lex: Page) {
  await lex.locator(".repository-menu__trigger").click();
  await lex.getByRole("button", { name: "Share to edit", exact: true }).click();
  const copied = lex.locator(".repository-menu__share-item");
  await expect(copied).toHaveText("Link copied");
  await expect(copied).toBeVisible();
  await expect.poll(() => lex.evaluate(() => navigator.clipboard.readText())).toMatch(/\/live\?s=[a-f\d]{64}#k=[\w-]{43}&site=native-demo&by=/);
  const link = await lex.evaluate(() => navigator.clipboard.readText());
  await expect(copied).toHaveText("Copy edit link", { timeout: 5_000 });
  await expect(lex.getByRole("button", { name: "Stop sharing", exact: true })).toBeVisible();
  await lex.keyboard.press("Escape");
  return link;
}
/** A guest opens the link, types a name and joins; resolves with the page's frame once it shows the heading. */
async function joins(visitor: Awaited<ReturnType<typeof guest>>, link: string, name: string, shows = heading) {
  await visitor.page.goto(link);
  await expect(visitor.page.getByRole("heading", { name: /^Edit native-demo with / })).toBeVisible();
  await visitor.page.getByLabel("Your name").fill(name);
  await visitor.page.getByRole("button", { name: "Join", exact: true }).click();
  const frame = visitor.page.frameLocator(".live-guest__frame");
  await expect(frame.locator(".hero h1")).toHaveText(shows, { timeout: 20_000 });
  return frame;
}
const ended = (page: Page) => page.getByRole("heading", { name: "This edit link has ended." });

test("guests edit a heading through Lex's link; his Undo takes it back, they follow his page, and Stop sharing ends it", async ({ page: lex, browser, baseURL, context }) => {
  test.setTimeout(180_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  lex.on("pageerror", (error) => pageErrors.push(error.message));
  await openEditor(lex, baseURL);
  await editorMounted(lex);
  await expect(lex.frameLocator(".native-preview-frame").locator(".hero h1")).toHaveText(heading);
  const link = await share(lex);

  // Anna opens it, with no account: a name, then the page.
  const anna = await guest(browser);
  const annaFrame = await joins(anna, link, "Anna");
  await expect(lex.locator('.repository-menu__people .person-chip[aria-label="Anna, a guest"]')).toBeVisible();
  await expect(anna.page.locator(".live-guest__people .person-chip").first()).toHaveAttribute("aria-label", /\(sharing\)$/);

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

  // Ben joins too and sees her words, and her next letters as she types them; both in the same colour on each page.
  const ben = await guest(browser, true);
  const benFrame = await joins(ben, link, "Ben", `${heading} together`);
  // With Lex's tab in the background (no animation frames come), her letters still reach Ben.
  await lex.evaluate(() => {
    const scope = window as typeof window & { shownFrame?: typeof requestAnimationFrame };
    scope.shownFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = () => 1;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  });
  await anna.page.keyboard.type(" today");
  await expect(benFrame.locator(".hero h1")).toHaveText(`${heading} together today`, { timeout: 20_000 });
  await lex.evaluate(() => {
    const scope = window as typeof window & { shownFrame?: typeof requestAnimationFrame };
    window.requestAnimationFrame = scope.shownFrame!;
    Reflect.deleteProperty(document, "hidden");
  });
  await anna.page.keyboard.press("Escape");
  await expect(target).not.toHaveAttribute("contenteditable", /.+/);
  const colour = await lex.locator('.repository-menu__people .person-chip[aria-label="Anna, a guest"]').getAttribute("data-colour");
  await expect(ben.page.locator('.live-guest__people .person-chip[aria-label="Anna"]')).toHaveAttribute("data-colour", colour!);

  // Nothing of the editor is on a guest's page, and they reached nothing of its API but the session's route.
  for (const name of [/save/i, /publish/i, /settings/i, /files/i, /agent/i, /connect/i])
    await expect(anna.page.getByRole("button", { name })).toHaveCount(0);
  await expect(anna.page.locator(".repository-menu, #explorer, .agent-menu")).toHaveCount(0);
  expect([...new Set(anna.calls)]).toEqual(["/api/live/guest"]);

  // Lex's Undo takes the guest's typing back, on his page, in his draft and on theirs.
  await lex.getByRole("banner").getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => source(lex), { timeout: 20_000 }).not.toContain(`${heading} together`);
  await expect.poll(async () => (await storedDraft(lex, "index.html"))?.content ?? "", { timeout: 10_000 }).not.toContain(`${heading} together`);
  for (const frame of [annaFrame, benFrame]) await expect(frame.locator(".hero h1")).toHaveText(heading, { timeout: 20_000 });

  // The guests follow the page Lex shows.
  const explorer = await openPages(lex);
  await explorer.getByRole("treeitem", { name: /^About/ }).locator(":scope > .pages-row > .pages-label").click();
  await expect(lex.locator("#current-page")).toHaveAttribute("data-path", "about/index.html");
  for (const frame of [annaFrame, benFrame]) await expect(frame.locator("h1")).toHaveText("About this project", { timeout: 20_000 });

  // Stop sharing: their pages say the session ended, and the link refuses.
  await lex.locator(".repository-menu__trigger").click();
  await lex.getByRole("button", { name: "Stop sharing", exact: true }).click();
  for (const visitor of [anna, ben]) await expect(ended(visitor.page)).toBeVisible({ timeout: 15_000 });
  await expect(lex.locator(".repository-menu__people .person-chip")).toHaveCount(0);
  await lex.locator(".repository-menu__trigger").click();
  await expect(lex.getByRole("button", { name: "Share to edit", exact: true })).toBeVisible();
  await lex.keyboard.press("Escape");

  const late = await guest(browser, true);
  const token = new URL(link).searchParams.get("s")!;
  expect((await late.page.request.get(`${baseURL}/api/live/guest?session=${token}`)).status()).toBe(410);
  await late.page.goto(link);
  await late.page.getByLabel("Your name").fill("Sam");
  await late.page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(ended(late.page)).toBeVisible({ timeout: 15_000 });

  for (const visitor of [anna, ben, late]) await visitor.context.close();
  expect(pageErrors).toEqual([]);
});

test("closing Lex's tab ends the session: the guest's page says so and the link refuses", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const lexContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
  const lex = await lexContext.newPage();
  lex.on("pageerror", (error) => pageErrors.push(error.message));
  await openEditor(lex, baseURL);
  const link = await share(lex);
  const anna = await guest(browser);
  await joins(anna, link, "Anna");
  await lex.close();
  await expect(ended(anna.page)).toBeVisible({ timeout: 15_000 });
  const token = new URL(link).searchParams.get("s")!;
  expect((await anna.page.request.get(`${baseURL}/api/live/guest?session=${token}`)).status()).toBe(410);
  await anna.context.close();
  await lexContext.close();
  expect(pageErrors).toEqual([]);
});

test("a guest waits while Lex's connection drops and carries on when he is back; past 30 s the link has ended", async ({ browser, baseURL }) => {
  test.setTimeout(150_000);
  const lexContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
  const lex = await lexContext.newPage();
  lex.on("pageerror", (error) => pageErrors.push(error.message));
  // Lex's session socket, through a route the test can cut as a network would (no clean close) and keep closed.
  let refuse = false;
  const servers: { close(options?: { code?: number }): Promise<void> }[] = [];
  await lex.routeWebSocket(/\/api\/live\/share/, (socket) => {
    if (refuse) { void socket.close({ code: 1011 }); return; }
    servers.push(socket.connectToServer());
  });
  await openEditor(lex, baseURL);
  await editorMounted(lex);
  const link = await share(lex);
  const anna = await guest(browser);
  const frame = await joins(anna, link, "Anna");
  const status = anna.page.locator(".live-guest__status");

  await servers.at(-1)!.close({ code: 4000 });
  await expect(status).toHaveText("Waiting for native-demo-user…");
  await expect(anna.page.locator(".live-guest__canvas")).toHaveAttribute("inert", "");
  await expect(status).toBeHidden({ timeout: 25_000 });
  const target = frame.locator(".hero h1");
  await clickOnText(target);
  await expect(target).toHaveAttribute("contenteditable", /.+/);
  await anna.page.keyboard.press("End");
  await anna.page.keyboard.type(" again");
  await expect.poll(() => source(lex), { timeout: 20_000 }).toContain(`${heading} again`);

  refuse = true;
  await servers.at(-1)!.close({ code: 4000 });
  await expect(status).toBeVisible();
  await expect(ended(anna.page)).toBeVisible({ timeout: 45_000 });
  await anna.context.close();
  await lexContext.close();
  expect(pageErrors).toEqual([]);
});

test("a join that cannot reach the session gives up and offers Join again", async ({ browser, baseURL }) => {
  test.setTimeout(60_000);
  const visitor = await guest(browser);
  // The socket opens but nothing ever answers, as on a connection that went away.
  await visitor.page.routeWebSocket(/\/api\/live\/guest/, () => undefined);
  await visitor.page.goto(`${baseURL}/live?s=${"a".repeat(64)}#k=${"A".repeat(43)}&site=native-demo&by=lex`);
  await visitor.page.getByLabel("Your name").fill("Anna");
  const join = visitor.page.getByRole("button", { name: /^Join/ });
  await join.click();
  await expect(join).toHaveText("Joining…");
  await expect(visitor.page.getByText("Couldn't join. Check your connection and try again.")).toBeVisible({ timeout: 15_000 });
  await expect(join).toHaveText("Join");
  await expect(join).toBeEnabled();
  await visitor.context.close();
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
