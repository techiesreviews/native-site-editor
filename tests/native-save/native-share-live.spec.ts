import { expect, test, type Browser, type Page } from "@playwright/test";
import { openEditor, openPages } from "../support/scenarios";
import { clickOnText } from "./click-text";
import { editorMounted, storedDraft } from "./drafts";

// Edit together (slice 30, ticket 58; CONTEXT.md "Synced session"): Lex shares the page he shows from the project
// menu's Edit together row (one row, as Connect to MCP: its dot and label are the state, the row the only control), and
// Anna opens the link in a browser with no sign-in, types her name and edits the heading. Her typing reaches his
// tab as his own unsaved change; her page has no Save, files, settings or agents, and calls nothing of the
// editor's API but the session's own route. Pressing the row again ends her session, and the link refuses from then on.
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

// The project menu's Edit together row: the row (pressed to share or stop), its label, its dot and its copy icon.
const editRow = (page: Page) => page.locator('[data-share="edit"] .link-row__main');
const editLabel = (page: Page) => page.locator('[data-share="edit"] .link-row__label');
const editDot = (page: Page) => page.locator('[data-share="edit"] .link-row');
/** Lex shares from the project menu: the row says "Link copied" with the menu still open, then waits for a
 * collaborator; the link from the clipboard. */
async function share(lex: Page) {
  // Emptied first, so only this press's link can satisfy the poll below.
  await lex.evaluate(() => navigator.clipboard.writeText(""));
  await lex.locator(".repository-menu__trigger").click();
  await lex.getByRole("button", { name: "Edit together", exact: true }).click();
  await expect(editLabel(lex)).toHaveText("Link copied");
  await expect(editLabel(lex)).toBeVisible();
  await expect.poll(() => lex.evaluate(() => navigator.clipboard.readText())).toMatch(/\/live\?s=[a-f\d]{64}#k=[\w-]{43}&site=native-demo&by=/);
  const link = await lex.evaluate(() => navigator.clipboard.readText());
  await expect(editLabel(lex)).toHaveText("Waiting for collaborator", { timeout: 5_000 });
  await expect(editDot(lex)).toHaveAttribute("data-dot", "wait");
  await expect(lex.locator("#repository-actions").getByRole("textbox")).toHaveCount(0);
  await expect(lex.getByRole("button", { name: /Stop sharing|Copy edit link/ })).toHaveCount(0);
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

test("guests edit a heading through Lex's link; his Undo takes it back, they follow his page, and pressing the row again ends it", async ({ page: lex, browser, baseURL, context }) => {
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
  // Lex's row names her, with her initial at its end, and its dot and the tile's turn green; the copy icon copies the
  // link again.
  await lex.locator(".repository-menu__trigger").click();
  await expect(editLabel(lex)).toHaveText("Editing with Anna", { timeout: 20_000 });
  await expect(lex.locator('[data-share="edit"] .link-row__end .person-chip')).toHaveText(["A"]);
  await expect(editDot(lex)).toHaveAttribute("data-dot", "on");
  await expect(lex.locator(".repository-menu__trigger")).toHaveAttribute("data-shared", "on");
  await lex.evaluate(() => navigator.clipboard.writeText(""));
  await editRow(lex).hover();
  await lex.locator('[data-share="edit"]').getByRole("button", { name: "Copy link" }).click();
  await expect(editLabel(lex)).toHaveText("Link copied");
  await expect.poll(() => lex.evaluate(() => navigator.clipboard.readText())).toBe(link);
  await lex.keyboard.press("Escape");
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
  await lex.locator(".repository-menu__trigger").click();
  await expect(editLabel(lex)).toHaveText(/^Editing with (Anna, Ben|Ben, Anna)$/, { timeout: 20_000 });
  const colour = await lex.locator('[data-share="edit"] .link-row__end .person-chip', { hasText: "A" }).getAttribute("data-colour");
  await lex.keyboard.press("Escape");
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

  // Pressing the row stops: their pages say the session ended, and the link refuses.
  await lex.locator(".repository-menu__trigger").click();
  await editRow(lex).click();
  for (const visitor of [anna, ben]) await expect(ended(visitor.page)).toBeVisible({ timeout: 15_000 });
  await expect(lex.getByRole("button", { name: "Edit together", exact: true })).toBeVisible();
  await expect(lex.locator(".repository-menu__trigger")).not.toHaveAttribute("data-shared");
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

// The guest's edit bar (TOOLS-185): on a picture, Replace (the site's pictures, or an upload) and Focus and crop (the
// editor's own image popup); on a link, its Address. Each change is Lex's own unsaved change, which his Undo takes back.
// On a computer the bar floats by the selection; on a phone it sits docked under the page, and its panels open there too.
const guestBar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const heroTag = async (page: Page) => (await source(page)).match(/<img\b[^>]*class="hero-image"[^>]*>/)?.[0] ?? "";
// A guest's upload: a photo of four coloured quarters (a photo can be trimmed; the fixture's SVGs cannot).
const quarters = (page: Page) => page.evaluate(() => {
  const canvas = document.createElement("canvas");
  canvas.width = 800; canvas.height = 400;
  const context = canvas.getContext("2d")!;
  [["#d22", 0, 0], ["#2a2", 400, 0], ["#22d", 0, 200], ["#dd2", 400, 200]].forEach(([colour, x, y]) => { context.fillStyle = colour as string; context.fillRect(x as number, y as number, 400, 200); });
  return canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
});

test("guests swap, upload and crop a picture and change a link from the edit bar; Lex's Undo takes it all back", async ({ page: lex, browser, baseURL, context }) => {
  test.setTimeout(180_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  lex.on("pageerror", (error) => pageErrors.push(error.message));
  await openEditor(lex, baseURL);
  await editorMounted(lex);
  // A button-style link on the page itself (the starter's links are all in its shared header, which guests leave alone).
  await lex.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const before = editor.getMountedSource("index.html")!;
    const at = before.indexOf('<img class="hero-image"');
    if (at < 0) throw new Error("The fixture's hero picture was not found");
    editor.replaceActiveRange({ path: "index.html", start: at, end: at, expected: "", text: '<a class="hero-link" href="/about/" data-key="hero-link">Read more</a>\n    ' });
  });
  await expect(lex.frameLocator(".native-preview-frame").locator(".hero-link")).toHaveText("Read more");
  const start = await source(lex);
  const link = await share(lex);

  // Anna, on a computer: the bar floats by the picture she picks.
  const anna = await guest(browser);
  const annaFrame = await joins(anna, link, "Anna");
  // A guest's page shows the site's pictures as Lex's tab sends them (data addresses), not their paths.
  const shown = (await annaFrame.locator(".hero-image").getAttribute("src"))!;
  await annaFrame.locator(".hero-image").click();
  const bar = guestBar(anna.page);
  await expect(bar.locator(".edit-bar__kind")).toHaveText("Image");
  await expect(bar).not.toHaveAttribute("data-side", "docked");

  // Replace lists the site's pictures, the one shown ticked; a pick is his change at once.
  await bar.getByRole("button", { name: "Replace the picture" }).click();
  const panel = anna.page.getByRole("dialog", { name: "Replace the picture" });
  await expect(panel.getByRole("button", { name: "placeholder.svg" })).toHaveAttribute("aria-pressed", "true");
  await panel.getByRole("button", { name: "studio-desk.svg" }).click();
  await expect(panel).toBeHidden();
  await expect.poll(() => heroTag(lex), { timeout: 20_000 }).toContain('src="/images/studio-desk.svg"');
  await expect(annaFrame.locator(".hero-image")).not.toHaveAttribute("src", shown, { timeout: 20_000 });

  // Or a picture from her computer: it lands in the site's pictures folder and on the page.
  await bar.getByRole("button", { name: "Replace the picture" }).click();
  await expect(panel.getByRole("button", { name: "studio-desk.svg" })).toHaveAttribute("aria-pressed", "true");
  // A file that is not a picture is refused, with the reason beside Upload…, and the panel stays.
  await expect(panel.getByRole("status")).toHaveText("");
  await panel.locator('input[type="file"]').setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(panel.getByRole("status")).toHaveText("That file is not a picture");
  await panel.locator('input[type="file"]').setInputFiles({ name: "guest-quarters.jpg", mimeType: "image/jpeg", buffer: Buffer.from(await quarters(anna.page), "base64") });
  await expect(panel).toBeHidden({ timeout: 20_000 });
  await expect.poll(() => heroTag(lex), { timeout: 20_000 }).toMatch(/src="\/images\/guest-quarters[^"]*\.(?:jpe?g|webp)"/);
  const uploaded = /src="([^"]+)"/.exec(await heroTag(lex))![1];

  // Focus and crop opens the editor's own image popup; a shape and a zoom, then Close, is his change: a trimmed copy.
  await annaFrame.locator(".hero-image").click();
  await bar.getByRole("button", { name: "Focus and crop" }).click();
  const popup = anna.page.getByRole("dialog", { name: "Image", exact: true });
  await expect(popup).toBeVisible({ timeout: 20_000 });
  await expect(bar.getByRole("button", { name: "Focus and crop" })).toHaveAttribute("aria-expanded", "true");
  await popup.getByRole("button", { name: /^Shape:/ }).click();
  await popup.getByRole("menuitemradio", { name: "Square", exact: true }).click();
  await popup.getByRole("slider", { name: "Zoom" }).fill("200");
  await anna.page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
  await expect.poll(() => heroTag(lex), { timeout: 30_000 }).toMatch(/aspect-ratio: 1 \/ 1/);
  await expect.poll(async () => /src="([^"]+)"/.exec(await heroTag(lex))?.[1], { timeout: 30_000 }).toMatch(/^\/[\w/]+\/guest-quarters[^"/]*-crop\.\w+$/);
  const cropped = /src="([^"]+)"/.exec(await heroTag(lex))![1];
  expect(cropped).not.toBe(uploaded);
  // A second crop is made on the picture her popup showed, the cropped copy (her page was never sent the original):
  // a new shape keeps that copy, never the original swapped back in under it.
  await annaFrame.locator(".hero-image").click();
  await bar.getByRole("button", { name: "Focus and crop" }).click();
  await expect(popup).toBeVisible({ timeout: 20_000 });
  await popup.getByRole("button", { name: /^Shape:/ }).click();
  await popup.getByRole("menuitemradio", { name: "16:9", exact: true }).click();
  await anna.page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
  await expect.poll(() => heroTag(lex), { timeout: 30_000 }).toMatch(/aspect-ratio: 16 \/ 9/);
  expect(/src="([^"]+)"/.exec(await heroTag(lex))![1]).toBe(cropped);

  // Ben, on a phone: one bar docked under the page; its picture panel and the popup open there too.
  const ben = await guest(browser, true);
  const benFrame = await joins(ben, link, "Ben");
  const benBar = guestBar(ben.page);
  await benFrame.locator(".hero-image").click();
  await expect(benBar).toHaveAttribute("data-side", "docked");
  await benBar.getByRole("button", { name: "Replace the picture" }).click();
  const benPanel = ben.page.getByRole("dialog", { name: "Replace the picture" });
  await expect(benPanel.getByRole("button", { name: "studio-desk.svg" })).toBeVisible();
  await expect(benPanel.getByRole("button", { name: "Upload…" })).toBeVisible();
  await ben.page.keyboard.press("Escape");
  await expect(benPanel).toBeHidden();
  await benBar.getByRole("button", { name: "Focus and crop" }).click();
  const benPopup = ben.page.getByRole("dialog", { name: "Image", exact: true });
  await expect(benPopup).toBeVisible({ timeout: 20_000 });
  // While his crop is open, Anna picks another picture there: his crop, made on the old one, is not put on hers.
  await bar.getByRole("button", { name: "Replace the picture" }).click();
  await panel.getByRole("button", { name: "studio-desk.svg" }).click();
  await expect(panel).toBeHidden();
  await expect.poll(() => heroTag(lex), { timeout: 20_000 }).toContain('src="/images/studio-desk.svg"');
  const picked = await heroTag(lex);
  await benPopup.getByRole("button", { name: /^Shape:/ }).click();
  await benPopup.getByRole("menuitemradio", { name: "16:9", exact: true }).click();
  await ben.page.keyboard.press("Escape");
  await expect(benPopup).toBeHidden();
  // Refused, and his picture panel opens saying so.
  await expect(benPanel).toContainText("The page changed meanwhile", { timeout: 20_000 });
  await ben.page.keyboard.press("Escape");
  await expect(benPanel).toBeHidden();

  // He changes the button's address there: Enter takes it, and it is Lex's change.
  await benFrame.locator(".hero-link").click();
  await expect(benBar.locator(".edit-bar__kind")).toHaveText("Link");
  await expect(benBar).toHaveAttribute("data-side", "docked");
  await benBar.getByRole("button", { name: "Address" }).click();
  const address = ben.page.locator(".edit-bar__popover").getByRole("combobox", { name: "Address" });
  await expect(address).toHaveValue("/about/");
  await address.fill("https://example.test/");
  await address.press("Enter");
  await expect.poll(() => source(lex), { timeout: 20_000 }).toContain('<a class="hero-link" href="https://example.test/" data-key="hero-link">');
  // Ben's crop was refused: Anna's picked picture is as she left it (the Undo count below would catch a late one).
  expect(await heroTag(lex)).toBe(picked);
  // A pick from his docked panel is Lex's change too.
  await benFrame.locator(".hero-image").click();
  await benBar.getByRole("button", { name: "Replace the picture" }).click();
  await expect(benPanel.getByRole("button", { name: "placeholder.svg" })).toHaveAttribute("aria-pressed", "false");
  await benPanel.getByRole("button", { name: "placeholder.svg" }).click();
  await expect(benPanel).toBeHidden();
  await expect.poll(() => heroTag(lex), { timeout: 20_000 }).toContain("placeholder.svg");

  // Still nothing of the editor on a guest's page, and no editor API reached.
  for (const visitor of [anna, ben]) {
    for (const name of [/save/i, /publish/i, /settings/i, /files/i, /agent/i, /connect/i])
      await expect(visitor.page.getByRole("button", { name })).toHaveCount(0);
    expect([...new Set(visitor.calls)]).toEqual(["/api/live/guest"]);
  }

  // Lex's Undo takes the seven guest changes back, one step each, to the page he shared (and no further: his own link
  // stays): Ben's pick and address, then Anna's second pick, two crops, upload (its file and its place in one step) and first pick.
  const undo = lex.getByRole("banner").getByRole("button", { name: "Undo", exact: true });
  const steps: string[] = [];
  for (let step = 0; step < 7; step++) {
    const before = await source(lex);
    await undo.click();
    await expect.poll(() => source(lex), { timeout: 10_000, message: `Undo ${step + 1} changed the page\n${steps.join("\n")}` }).not.toBe(before);
    steps.push(await heroTag(lex));
  }
  expect(await source(lex), steps.join("\n")).toBe(start);
  for (const frame of [annaFrame, benFrame]) await expect(frame.locator(".hero-image")).toHaveAttribute("src", shown, { timeout: 20_000 });

  for (const visitor of [anna, ben]) await visitor.context.close();
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

  // Lex's row says it is reconnecting meanwhile, then names Anna again.
  await lex.locator(".repository-menu__trigger").click();
  await expect(editLabel(lex)).toHaveText("Editing with Anna", { timeout: 20_000 });
  await servers.at(-1)!.close({ code: 4000 });
  await expect(editLabel(lex)).toHaveText("Reconnecting…");
  await expect(editDot(lex)).toHaveAttribute("data-dot", "busy");
  await expect(status).toHaveText("Waiting for native-demo-user…");
  await expect(anna.page.locator(".live-guest__canvas")).toHaveAttribute("inert", "");
  await expect(status).toBeHidden({ timeout: 25_000 });
  await expect(editLabel(lex)).toHaveText("Editing with Anna", { timeout: 25_000 });
  await lex.keyboard.press("Escape");
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
