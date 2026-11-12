import { expect, test, webkit, type Page } from "@playwright/test";

// The catalogue board (catalogue.html, atomic catalogue ticket 05): fly to a part from the outline, change an option,
// Approve it, and the mark reaches src/catalogue/approvals.json through Save to GitHub (here the fake GitHub's demo
// repository, named on the board's address). A molecule shows where it lives and what it is made of; a link there
// flies to the part. Light and dark sit side by side in Chromium and WebKit.

const BOARD = "/catalogue.html?repo=native-demo-user/native-demo&branch=main";

async function openBoard(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}${BOARD}`);
  await expect(page.getByRole("navigation", { name: "Outline" }).getByRole("button", { name: "Button", exact: true })).toBeVisible();
}
/** Picks a part in the outline and waits for the board to settle on its card. */
async function flyTo(page: Page, name: string) {
  await page.getByRole("navigation", { name: "Outline" }).getByRole("button", { name, exact: true }).click();
  const card = page.locator(".cat-card[data-id]").filter({ has: page.locator(".cat-card__title", { hasText: new RegExp(`^${name}$`) }) });
  let last = "";
  await expect.poll(async () => { const box = JSON.stringify(await card.boundingBox()); const still = box === last; last = box; return still; }, { intervals: [150] }).toBe(true);
}
/** The card is on screen: its centre lies inside the canvas. */
async function expectInView(page: Page, id: string) {
  await expect.poll(async () => {
    const [card, canvas] = await Promise.all([page.locator(`#card-${id}`).boundingBox(), page.getByRole("region", { name: "Canvas" }).boundingBox()]);
    if (!card || !canvas) return false;
    const x = card.x + card.width / 2, y = card.y + card.height / 2;
    return x > canvas.x && x < canvas.x + canvas.width && y > canvas.y && y < canvas.y + canvas.height;
  }).toBe(true);
}

test("flies to a part from the outline, changes an option, approves it and saves approvals.json", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  const outline = page.getByRole("navigation", { name: "Outline" });
  const options = page.getByRole("complementary", { name: "Options" });
  await expect(options).toContainText("Approved 0 of");

  await outline.getByRole("button", { name: "Button", exact: true }).click();
  await expect(options.getByRole("heading", { name: "Button" })).toBeVisible();
  await expect(outline.getByRole("button", { name: "Button", exact: true })).toHaveAttribute("aria-current", "true");
  await expectInView(page, "button");

  await options.getByLabel("Label").fill("Publish");
  await expect(page.locator("#card-button .cat-live__stage button")).toHaveText("Publish");

  await options.getByRole("button", { name: "Approve" }).click();
  await expect(options.getByRole("button", { name: "Approved" })).toHaveAttribute("aria-disabled", "true");
  await expect(outline.getByRole("button", { name: /^Button/ }).getByRole("img", { name: "Approved" })).toBeVisible();
  await expect(page.locator("#card-button .cat-card__title").getByRole("img", { name: "Approved" })).toBeVisible();

  const saved = await page.request.get(`${baseURL}/__demo/file?repo=native-demo&path=src/catalogue/approvals.json`);
  expect(saved.status()).toBe(200);
  const approvals = JSON.parse(await saved.text());
  expect(approvals.approved.button).toEqual({ on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), by: "native-demo-user" });

  // A second approval adds to the same file in a new commit.
  await outline.getByRole("button", { name: "Icon", exact: true }).click();
  await options.getByRole("button", { name: "Approve" }).click();
  await expect(options.getByRole("button", { name: "Approved" })).toBeVisible();
  const both = JSON.parse(await (await page.request.get(`${baseURL}/__demo/file?repo=native-demo&path=src/catalogue/approvals.json`)).text());
  expect(Object.keys(both.approved)).toEqual(["button", "icon"]);
});

test("a molecule shows its files and what it is made of, and a link flies to the atom", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  await page.getByRole("navigation", { name: "Outline" }).getByRole("button", { name: "Row menu", exact: true }).click();
  const options = page.getByRole("complementary", { name: "Options" });
  await expect(options.getByRole("heading", { name: "Row menu" })).toBeVisible();
  await expect(options.getByText("src/components/row-menu.ts · src/components/row-menu.css", { exact: true })).toBeVisible();
  const madeOf = options.getByRole("list", { name: "Made of" });
  await expect(madeOf.getByRole("button", { name: "Button" })).toBeVisible();
  await expect(madeOf.getByRole("button", { name: "Icon" })).toBeVisible();
  await expect(madeOf.getByRole("listitem").filter({ hasText: "Untraced" })).toContainText("row-menu.css");
  // The card on the canvas carries the same list, and its fixed frames draw the editor's real menu, open.
  await expect(page.locator("#card-row-menu").getByRole("list", { name: "Made of" }).getByRole("button", { name: "Icon" })).toBeVisible();
  await expect(page.frameLocator('#card-row-menu .cat-half[data-theme="light"] iframe').first().locator(".row-menu")).toContainText("Rename");
  // The live menu follows the options: opened after Remove is switched off, it has no Remove.
  await options.getByRole("switch", { name: "Remove" }).click();
  const live = page.frameLocator('#card-row-menu [data-cell="live"] iframe');
  await live.getByRole("button", { name: "Actions" }).click();
  await expect(live.locator(".row-menu")).toContainText("Rename");
  await expect(live.locator(".row-menu")).not.toContainText("Remove");
  await expect(page.frameLocator('#card-row-menu .cat-half[data-theme="dark"] iframe').first().locator(".row-menu")).toContainText("Remove");

  await madeOf.getByRole("button", { name: "Icon" }).click();
  await expect(options.getByRole("heading", { name: "Icon" })).toBeVisible();
  await expect(page.locator("#card-icon")).toHaveClass(/is-selected/);
  await expectInView(page, "icon");
});

/** The two halves of the Button card: their background, and the colour a token resolves to in each. */
async function halves(page: Page) {
  return page.locator("#card-button").evaluate((card) => {
    const read = (half: Element) => {
      const probe = half.appendChild(document.createElement("span"));
      probe.style.color = "var(--panel-surface)";
      const token = getComputedStyle(probe).color;
      probe.remove();
      return { scheme: getComputedStyle(half).colorScheme, background: getComputedStyle(half).backgroundColor, token };
    };
    const [light, dark] = [...card.querySelectorAll(".cat-halves > .cat-half")];
    // What the whole page shows for the token in each scheme, for comparison.
    const box = document.body.appendChild(document.createElement("div"));
    const reference = (scheme: string) => { box.style.colorScheme = scheme; box.style.color = "var(--panel-surface)"; return getComputedStyle(box).color; };
    const result = { light: read(light), dark: read(dark), pageLight: reference("light"), pageDark: reference("dark") };
    box.remove();
    return result;
  });
}
function expectSideBySide(found: Awaited<ReturnType<typeof halves>>) {
  expect(found.light.scheme).toBe("light");
  expect(found.dark.scheme).toBe("dark");
  expect(found.dark.background).not.toBe(found.light.background);
  expect(found.light.token).toBe(found.pageLight);
  expect(found.dark.token).toBe(found.pageDark);
}

test("light and dark sit side by side in Chromium", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  expectSideBySide(await halves(page));
});

test("light and dark sit side by side in WebKit", async ({ baseURL }) => {
  // WebKit needs system libraries (`npx playwright install-deps webkit`); a machine without them says so here.
  const browser = await webkit.launch().catch((error: Error) => error);
  test.skip(browser instanceof Error, `WebKit cannot start here: ${browser instanceof Error ? /error while loading shared libraries: [^\n]*/.exec(browser.message)?.[0] ?? browser.message.split("\n")[0] : ""}`);
  if (browser instanceof Error) return;
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
    const other = await context.newPage();
    await openBoard(other, baseURL);
    expectSideBySide(await halves(other));
  } finally {
    await browser.close();
  }
});

test("forced states draw: hover changes the button's colour and focus draws its ring", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  // The Primary row of the light half: Normal, Hover, Pressed, Focus, Disabled.
  const cells = page.locator('#card-button .cat-half[data-theme="light"] .cat-cell button');
  await expect(cells).toHaveCount(10);
  const look = (index: number) => cells.nth(index).evaluate((button) => ({ background: getComputedStyle(button).backgroundColor, outline: getComputedStyle(button).outlineStyle }));
  const [normal, hover, focus] = [await look(0), await look(1), await look(3)];
  expect(hover.background).not.toBe(normal.background);
  expect(normal.outline).toBe("none");
  expect(focus.outline).not.toBe("none");
});

const percent = async (page: Page) => parseInt(await page.getByRole("toolbar", { name: "Zoom" }).locator("output").innerText(), 10);
/** Every frame has drawn, the camera holds still (the first view fits again once every part has drawn) and keys reach the board. */
async function settled(page: Page) {
  await expect.poll(async () => {
    // The board's own frames (an editor screen's page frame inside one is the sample site's).
    const frames = page.frames().filter((frame) => frame.parentFrame() === page.mainFrame());
    const drawn = await Promise.all(frames.map((frame) => frame.evaluate(() => (document.querySelector(".cat-frame-stage")?.childElementCount ?? 0) > 0).catch(() => false)));
    return frames.length > 0 && drawn.every(Boolean);
  }).toBe(true);
  let last = "";
  const camera = () => page.locator(".cat-world").evaluate((world) => world.style.transform);
  await expect.poll(async () => { const now = await camera(); const still = now === last; last = now; return still; }, { intervals: [300] }).toBe(true);
  // A state cell's menu or dialog that focused itself as it came into view has given the keyboard back to the board.
  await expect.poll(() => page.evaluate(() => { const a = document.activeElement as HTMLIFrameElement; return a?.tagName === "IFRAME" ? `iframe inert=${a.inert} ${a.dataset.frame?.slice(0, 50)}` : "ok"; })).toBe("ok");
}

test("Space presses a focused button on the canvas instead of panning", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  const zoom = page.getByRole("toolbar", { name: "Zoom" });
  // A menu drawing in a frame focuses itself (the board then takes focus back, which drops a key press half made).
  await settled(page);
  const before = await percent(page);
  await zoom.getByRole("button", { name: "Zoom in" }).focus();
  await expect(zoom.getByRole("button", { name: "Zoom in" })).toBeFocused();
  await page.keyboard.press("Space");
  await expect.poll(() => percent(page)).toBeGreaterThan(before);
});

test("an option set while a frame is still loading is the one it draws", async ({ page, baseURL }) => {
  // The board's own entry script loads; every frame's copy waits until released.
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  let first = true;
  await page.route(/\/(src\/catalogue\/main\.ts|assets\/catalogue-[\w-]+\.js)(\?|$)/, async (route) => {
    if (first) { first = false; await route.continue(); return; }
    await released;
    await route.continue();
  });
  await openBoard(page, baseURL);
  await page.getByRole("navigation", { name: "Outline" }).getByRole("button", { name: "Row menu", exact: true }).click();
  const options = page.getByRole("complementary", { name: "Options" });
  await options.getByRole("switch", { name: "Remove" }).click();
  release();
  const live = page.frameLocator('#card-row-menu [data-cell="live"] iframe');
  await live.getByRole("button", { name: "Actions" }).click();
  const liveMenu = live.locator(".row-menu");
  await expect(liveMenu).toContainText("Rename");
  await expect(liveMenu).not.toContainText("Remove");
});

test("a menu drawing in its frame leaves the board's focus where it was", async ({ page, baseURL }) => {
  // The fixed Row menu frames draw it open, focusing its first item; every frame's copy of the entry script waits until released.
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  let first = true;
  await page.route(/\/(src\/catalogue\/main\.ts|assets\/catalogue-[\w-]+\.js)(\?|$)/, async (route) => {
    if (first) { first = false; await route.continue(); return; }
    await released;
    await route.continue();
  });
  await openBoard(page, baseURL);
  await page.getByRole("navigation", { name: "Outline" }).getByRole("button", { name: "Row menu", exact: true }).click();
  const zoomIn = page.getByRole("toolbar", { name: "Zoom" }).getByRole("button", { name: "Zoom in" });
  await zoomIn.focus();
  release();
  await expect(page.frameLocator('#card-row-menu .cat-half[data-theme="light"] iframe').first().locator(".row-menu")).toContainText("Rename");
  await expect(zoomIn).toBeFocused();
});

test("on a phone, a part chosen in the outline sheet sits above the options sheet", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseURL}${BOARD}`);
  await expect(page.locator('.cat-outline__item[data-id="row-menu"]')).toBeAttached();
  await page.getByRole("button", { name: "Outline" }).click();
  await page.getByRole("navigation", { name: "Outline" }).getByRole("button", { name: "Row menu", exact: true }).click();
  const options = page.getByRole("complementary", { name: "Options" });
  await expect(options.getByRole("heading", { name: "Row menu" })).toBeVisible();
  await expect.poll(async () => {
    const [card, sheet] = await Promise.all([page.locator("#card-row-menu").boundingBox(), options.boundingBox()]);
    return card && sheet ? card.y + card.height / 2 < sheet.y && card.y + card.height / 2 > 0 : false;
  }).toBe(true);
});

test("every card and every live cell carries its part's name", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  const cards = await page.locator(".cat-card[data-id]").evaluateAll((list) => list.map((card) => {
    const element = card as HTMLElement;
    const lives = [...element.querySelectorAll<HTMLElement>('[data-cell="live"]')];
    return { id: element.dataset.id, part: element.dataset.part, lives: lives.map((cell) => cell.dataset.part), hasLive: Boolean(element.querySelector(".cat-live")) };
  }));
  expect(cards.length).toBeGreaterThan(10);
  for (const card of cards) {
    expect(card.part).toBe(card.id);
    if (card.hasLive) expect(card.lives).toEqual([card.id]);
  }
  // Each mock-up frame works, so each is a live cell of its own.
  expect(cards.find((card) => card.id === "sharing-panel")?.lives).toEqual(["sharing-panel", "sharing-panel", "sharing-panel", "sharing-panel"]);
});

test("a preview annotation on a card names its files and its stylesheet, inside a frame too", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  const button = page.locator("#card-button");
  await expect(button).toHaveAttribute("data-css", "src/ui/parts/button.css");
  await expect(button).toHaveAttribute("data-files", "src/ui/parts/button.css src/ui/dom.ts");
  // Off screen a card is not drawn: in view, it is an article named by its title.
  await flyTo(page, "Button");
  await expect(page.getByRole("article", { name: "Button" })).toHaveAttribute("data-part", "button");
  await expect(page.locator("#card-badge")).toHaveAttribute("data-css", "src/ui/parts/badge.css");
  // Every card names a stylesheet, and it is one of its files.
  const sheets = await page.locator(".cat-card[data-id]").evaluateAll((cards) => cards.map((card) => [(card as HTMLElement).dataset.css ?? "", (card as HTMLElement).dataset.files ?? ""]));
  for (const [css, files] of sheets) { expect(css).toMatch(/\.css$/); expect(files.split(" ")).toContain(css); }
  const stage = page.locator("#card-row-menu .cat-live__stage iframe").contentFrame().locator(".cat-frame-stage");
  await expect(stage).toHaveAttribute("data-files", "src/components/row-menu.ts src/components/row-menu.css");
});

test("a card dragged by its title moves, Escape puts a drag back, the arrows nudge it, and its place outlasts a reload", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  const card = page.locator("#card-button"), title = card.locator(".cat-card__title");
  await expect(card).not.toHaveAttribute("style", /translate/);
  await flyTo(page, "Button");
  const drag = async (dx: number, dy: number, end: () => Promise<void>) => {
    const box = (await title.boundingBox())!;
    await page.mouse.move(box.x + 10, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 10 + dx / 2, box.y + box.height / 2 + dy / 2, { steps: 4 });
    await page.mouse.move(box.x + 10 + dx, box.y + box.height / 2 + dy, { steps: 4 });
    await end();
  };
  const before = (await card.boundingBox())!;
  await drag(160, 90, () => page.mouse.up());
  const after = (await card.boundingBox())!;
  expect(after.x - before.x).toBeGreaterThan(100);
  expect(after.y - before.y).toBeGreaterThan(50);
  // Dragging selects the card; its Place fields say where it is.
  const x = page.getByRole("complementary", { name: "Options" }).getByRole("spinbutton", { name: "X" });
  await expect(x).toBeVisible();
  const placed = await card.evaluate((element) => (element as HTMLElement).style.translate);
  expect(placed).toMatch(/px/);

  // A state cell's frame drawing as the board opens may hold the keys for a moment; the board takes them back.
  await drag(-300, 0, async () => { await expect(page.getByRole("region", { name: "Canvas" })).toBeFocused(); await page.keyboard.press("Escape"); await page.mouse.up(); });
  await expect.poll(() => card.evaluate((element) => (element as HTMLElement).style.translate)).toBe(placed);

  const xBefore = Number(await x.inputValue());
  await page.keyboard.press("Shift+ArrowRight");
  await expect(x).toHaveValue(String(xBefore + 10));
  const nudged = await card.evaluate((element) => (element as HTMLElement).style.translate);
  expect(nudged).not.toBe(placed);

  await page.reload();
  await expect(page.locator("#card-button")).toHaveAttribute("style", new RegExp(nudged.replace(/[.]/g, "\\.")));
  // Picked in the outline, the arrows move it straight away.
  await page.getByRole("navigation", { name: "Outline" }).getByRole("button", { name: "Button", exact: true }).click();
  const shown = page.getByRole("complementary", { name: "Options" }).getByRole("spinbutton", { name: "Y" });
  const yBefore = Number(await shown.inputValue());
  await page.keyboard.press("Shift+ArrowDown");
  await expect(shown).toHaveValue(String(yBefore + 10));
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("catalogue:places") ?? "{}").button?.y as number)).toBeGreaterThan(0);
  const typed = page.getByRole("complementary", { name: "Options" }).getByRole("spinbutton", { name: "X" });
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("catalogue:places") ?? "{}").button?.x as number);
  const savedBefore = await saved();
  await typed.fill(String(xBefore - 40));
  await expect.poll(saved).toBe(savedBefore - 50);
  await expect(page.locator("#card-button")).not.toHaveAttribute("style", new RegExp(nudged.replace(/[.]/g, "\\.")));
});

test("a dragged card snaps to another's edge with a guide, and nothing else on the board moves", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  // The whole board in view, so both cards are on screen.
  await page.getByRole("region", { name: "Canvas" }).focus();
  await page.keyboard.press("Shift+Digit1");
  const button = page.locator("#card-button"), badge = page.locator("#card-badge"), icon = page.locator("#card-icon");
  let last = "";
  await expect.poll(async () => { const box = JSON.stringify(await button.boundingBox()); const still = box === last; last = box; return still; }, { intervals: [150] }).toBe(true);
  const [from, to, iconBefore] = [(await button.boundingBox())!, (await badge.boundingBox())!, (await icon.boundingBox())!];
  const title = (await button.locator(".cat-card__title").boundingBox())!;
  // Dropped 3 px right of the Badge's left edge, well below it: within reach (6 px on screen), so it snaps.
  const start = { x: title.x + 4, y: title.y + title.height / 2 };
  const end = { x: start.x + (to.x - from.x) + 3, y: start.y + (to.y + to.height + 60 - from.y) };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 4 });
  await page.mouse.move(end.x, end.y, { steps: 4 });
  const guide = page.locator(".cat-guide[data-axis='x']");
  await expect(guide).toHaveCount(1);
  // Zoomed out this far other edges are in reach too: the card lands on whichever is nearest, along its guide.
  const line = (await guide.boundingBox())!.x;
  await page.mouse.up();
  await expect(page.locator(".cat-guide")).toHaveCount(0);
  const placed = (await button.boundingBox())!;
  expect(Math.min(...[placed.x, placed.x + placed.width / 2, placed.x + placed.width].map((edge) => Math.abs(edge - line)))).toBeLessThan(1);
  expect(Math.abs(placed.x - end.x + start.x - from.x)).toBeLessThan(8);
  expect(await badge.boundingBox()).toEqual(to);
  expect(await icon.boundingBox()).toEqual(iconBefore);
});

test("a drag whose pointer is cancelled puts the card back, and a zoom mid-drag keeps the card under the pointer", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  await flyTo(page, "Button");
  const card = page.locator("#card-button"), title = card.locator(".cat-card__title"), board = page.locator(".cat-board");
  const box = (await title.boundingBox())!;
  const at = { x: box.x + 6, y: box.y + box.height / 2 };
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 40, at.y + 20, { steps: 4 });
  await expect(board).toHaveClass(/is-moving/);
  await page.getByRole("region", { name: "Canvas" }).evaluate((canvas) => canvas.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1, bubbles: true })));
  await expect(board).not.toHaveClass(/is-moving/);
  await expect(card).not.toHaveAttribute("style", /translate/);
  expect(await page.evaluate(() => localStorage.getItem("catalogue:places"))).toBeNull();
  await page.mouse.up();

  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 40, at.y + 20, { steps: 4 });
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, 200);
  await page.keyboard.up("Control");
  await page.mouse.move(at.x + 41, at.y + 20);
  const after = (await title.boundingBox())!;
  expect(at.x + 41).toBeGreaterThanOrEqual(after.x);
  expect(at.x + 41).toBeLessThanOrEqual(after.x + after.width);
  expect(at.y + 20).toBeGreaterThanOrEqual(after.y - 6);
  expect(at.y + 20).toBeLessThanOrEqual(after.y + after.height + 6);
  await page.mouse.up();

  // A release the board never heard (a mouse moving with no button held) ends the drag and keeps the card there.
  const before = await page.evaluate(() => localStorage.getItem("catalogue:places"));
  const now = (await title.boundingBox())!;
  const grip = { x: now.x + 6, y: now.y + now.height / 2 };
  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  await page.mouse.move(grip.x + 30, grip.y + 30, { steps: 4 });
  await expect(board).toHaveClass(/is-moving/);
  await page.getByRole("region", { name: "Canvas" }).evaluate((canvas, point) => canvas.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, pointerType: "mouse", buttons: 0, bubbles: true, clientX: point.x, clientY: point.y })), { x: grip.x + 31, y: grip.y + 30 });
  await expect(board).not.toHaveClass(/is-moving/);
  expect(await page.evaluate(() => localStorage.getItem("catalogue:places"))).not.toBe(before);
  await page.mouse.up();
});

test("a second finger on a title being dragged turns the drag into a pinch", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  await flyTo(page, "Button");
  const card = page.locator("#card-button");
  const title = (await card.locator(".cat-card__title").boundingBox())!;
  const zoom = page.getByRole("toolbar", { name: "Zoom" }).locator("output");
  const before = await zoom.textContent();
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: string, points: { x: number; y: number; id: number }[]) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  const a = { x: title.x + 6, y: title.y + title.height / 2, id: 1 };
  await touch("touchStart", [a]);
  await touch("touchMove", [{ ...a, x: a.x + 20 }]);
  await expect(page.locator(".cat-board")).toHaveClass(/is-moving/);
  const b = { x: a.x + 120, y: a.y + 160, id: 2 };
  await touch("touchStart", [{ ...a, x: a.x + 20 }, b]);
  await expect(page.locator(".cat-board")).not.toHaveClass(/is-moving/);
  for (let step = 1; step <= 4; step++) await touch("touchMove", [{ ...a, x: a.x + 20 - step * 20, y: a.y - step * 20 }, { ...b, x: b.x + step * 20, y: b.y + step * 20 }]);
  await touch("touchEnd", []);
  await expect(zoom).not.toHaveText(before ?? "");
  await expect(card).not.toHaveAttribute("style", /translate/);
});

test("a tap on a card's title selects it and a double tap brings it close", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  await flyTo(page, "Badge");
  await page.getByRole("button", { name: "Close" }).click();
  const card = page.locator("#card-badge"), title = card.locator(".cat-card__title");
  await title.click();
  await expect(card).toHaveClass(/is-selected/);
  await expect(card).not.toHaveAttribute("style", /translate/);
  await page.keyboard.press("Minus");
  await page.keyboard.press("Minus");
  let last = "";
  await expect.poll(async () => { const box = JSON.stringify(await card.boundingBox()); const still = box === last; last = box; return still; }, { intervals: [150] }).toBe(true);
  const before = (await card.boundingBox())!;
  await title.dblclick();
  await expect.poll(async () => (await card.boundingBox())!.width).toBeGreaterThan(before.width * 1.2);
  await expect(card).not.toHaveAttribute("style", /translate/);
});

test("the live Button reacts to a real hover, press and keyboard, and the board stays put", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  await page.getByRole("navigation", { name: "Outline" }).getByRole("button", { name: "Button", exact: true }).click();
  await expectInView(page, "button");
  await settled(page);
  const button = page.locator('#card-button [data-part="button"][data-cell="live"] button');
  const look = () => button.evaluate((element) => ({ background: getComputedStyle(element).backgroundColor, outline: getComputedStyle(element).outlineStyle, pressed: element.matches(":active") }));
  const camera = () => page.locator(".cat-world").evaluate((world) => world.style.transform);
  const normal = await look();
  const before = await camera();

  await button.hover();
  await expect.poll(async () => (await look()).background).not.toBe(normal.background);
  // A press, and a drag that starts on the button, press it and never pan the board.
  const box = (await button.boundingBox())!;
  await page.mouse.down();
  await expect.poll(async () => (await look()).pressed).toBe(true);
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 60, { steps: 6 });
  await page.mouse.up();
  expect(await camera()).toBe(before);

  // The keyboard reaches it and draws its focus ring.
  await button.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(button).toBeFocused();
  expect((await look()).outline).not.toBe("none");
  // Space and Enter press it, and the board stays put.
  await button.evaluate((element: HTMLElement) => element.addEventListener("click", () => { element.dataset.presses = String(Number(element.dataset.presses ?? 0) + 1); }));
  await page.keyboard.press("Space");
  await page.keyboard.press("Enter");
  await expect(button).toHaveAttribute("data-presses", "2");
  expect(await camera()).toBe(before);
});

test("the keyboard reaching a live Button already in view leaves the board where it is", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  await page.getByRole("navigation", { name: "Outline" }).getByRole("button", { name: "Button", exact: true }).click();
  await expectInView(page, "button");
  await settled(page);
  // Moved off the card's centre, the Button still in view: only a control out of view brings the camera along.
  const canvas = (await page.getByRole("region", { name: "Canvas" }).boundingBox())!;
  await page.mouse.move(canvas.x + 20, canvas.y + canvas.height - 20);
  await page.mouse.wheel(30, 30);
  const camera = () => page.locator(".cat-world").evaluate((world) => world.style.transform);
  let last = "";
  await expect.poll(async () => { const now = await camera(); const still = now === last; last = now; return still; }, { intervals: [300] }).toBe(true);
  const before = await camera();
  await expectInView(page, "button");
  await page.keyboard.press("Shift");
  const button = page.locator('#card-button [data-cell="live"] button');
  await button.focus();
  await expect(button).toBeFocused();
  // fixed-wait: a flight to the card starts on focus; its absence has no state to poll, so the camera is read after it would have moved.
  await page.waitForTimeout(400);
  expect(await camera()).toBe(before);
});

test("the keyboard reaching a live cell too small to see selects its card and brings it into view", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  // The whole board in view: every card drawn, each too small to use.
  await page.getByRole("toolbar", { name: "Zoom" }).getByRole("button", { name: "Fit" }).click();
  await settled(page);
  await expect.poll(() => percent(page)).toBeLessThan(50);
  await page.keyboard.press("Shift");
  await page.locator('#card-button [data-cell="live"] button').focus();
  await expect(page.locator("#card-button")).toHaveClass(/is-selected/);
  await expectInView(page, "button");
});

test("a press on a live frame selects its card and leaves the board where it is", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  await page.getByRole("navigation", { name: "Outline" }).getByRole("button", { name: "Row menu", exact: true }).click();
  await expectInView(page, "row-menu");
  await settled(page);
  await page.keyboard.press("Escape");
  await expect(page.locator("#card-row-menu")).not.toHaveClass(/is-selected/);
  const camera = () => page.locator(".cat-world").evaluate((world) => world.style.transform);
  const before = await camera();
  await page.frameLocator('#card-row-menu [data-cell="live"] iframe').getByRole("button", { name: "Actions" }).click();
  await expect(page.locator("#card-row-menu")).toHaveClass(/is-selected/);
  expect(await camera()).toBe(before);
});

test("a mock-up frame works: real hover, and the keyboard reaching it selects its card", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  await page.getByRole("navigation", { name: "Outline" }).getByRole("button", { name: "Sharing, one panel", exact: true }).click();
  await expectInView(page, "sharing-panel");
  await settled(page);
  const frame = page.frameLocator('#card-sharing-panel [data-cell="live"][data-width="1280"][data-theme="light"] iframe');
  const done = frame.getByRole("button", { name: "Done" });
  const background = () => done.evaluate((element) => getComputedStyle(element).backgroundColor);
  const normal = await background();
  await done.hover();
  await expect.poll(background).not.toBe(normal);
  await page.keyboard.press("Escape");
  await expect(page.locator("#card-sharing-panel")).not.toHaveClass(/is-selected/);
  // Tab reaching the frame focuses it on the board's page, then the part inside it.
  await page.locator('#card-sharing-panel [data-cell="live"][data-width="1280"][data-theme="light"] iframe').focus();
  await expect(page.locator("#card-sharing-panel")).toHaveClass(/is-selected/);
  await page.keyboard.press("Tab");
  await expect(frame.getByRole("button", { name: "Close" })).toBeFocused();
  // A click reaches the part (its buttons do nothing yet), and the board stays put.
  const camera = () => page.locator(".cat-world").evaluate((world) => world.style.transform);
  const before = await camera();
  await done.evaluate((element: HTMLElement) => element.addEventListener("click", () => { element.dataset.presses = String(Number(element.dataset.presses ?? 0) + 1); }));
  await done.click();
  await expect(done).toHaveAttribute("data-presses", "1");
  expect(await camera()).toBe(before);
});

test("the live Row menu and Confirm dialog open and close in their frames, by pointer and keyboard", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  const outline = page.getByRole("navigation", { name: "Outline" });
  await outline.getByRole("button", { name: "Row menu", exact: true }).click();
  await expectInView(page, "row-menu");
  await settled(page);
  const menuFrame = page.frameLocator('#card-row-menu [data-part="row-menu"][data-cell="live"] iframe');
  const actions = menuFrame.getByRole("button", { name: "Actions" });
  const menu = menuFrame.getByRole("menu");
  await expect(actions).toBeVisible();
  await expect(menu).toBeHidden();
  // The menu's button opens and closes it; so does a press outside it in the frame.
  await actions.click();
  await expect(menu).toBeVisible();
  await actions.click();
  await expect(menu).toBeHidden();
  await actions.click();
  await expect(menu).toBeVisible();
  const box = (await page.locator('#card-row-menu [data-cell="live"] iframe').boundingBox())!;
  await page.mouse.click(box.x + 8, box.y + box.height - 8);
  await expect(menu).toBeHidden();
  // A drag that starts in the live frame uses the part and never pans the board.
  const camera = () => page.locator(".cat-world").evaluate((world) => world.style.transform);
  const before = await camera();
  await page.mouse.move(box.x + 20, box.y + box.height - 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + box.height - 80, { steps: 6 });
  await page.mouse.up();
  expect(await camera()).toBe(before);
  await actions.click();
  await expect(menu).toBeVisible();
  await expect(menuFrame.getByRole("menuitem", { name: "Rename" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menuFrame.getByRole("menuitem", { name: "Duplicate" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(actions).toBeFocused();
  // Escape in the frame closed only the menu: the board kept its selection.
  await expect(page.locator("#card-row-menu")).toHaveClass(/is-selected/);
  await page.keyboard.press("Enter");
  await expect(menu).toBeVisible();
  await menuFrame.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(menu).toBeHidden();

  await outline.getByRole("button", { name: "Confirm dialog", exact: true }).click();
  await expectInView(page, "confirm-dialog");
  await settled(page);
  const dialogFrame = page.frameLocator('#card-confirm-dialog [data-part="confirm-dialog"][data-cell="live"] iframe');
  const open = dialogFrame.getByRole("button", { name: "Delete…" });
  const dialog = dialogFrame.getByRole("dialog");
  await expect(dialog).toBeHidden();
  await open.click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Delete “About us”?");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
});

test("a mouse wheel over a live frame still zooms the board", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  await page.getByRole("navigation", { name: "Outline" }).getByRole("button", { name: "Row menu", exact: true }).click();
  await expectInView(page, "row-menu");
  await settled(page);
  const box = (await page.locator('#card-row-menu [data-cell="live"] iframe').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const before = await percent(page);
  await page.mouse.wheel(0, -100);
  await expect.poll(() => percent(page)).toBeGreaterThan(before);
});

test("after a click in a live frame, a key there and then Tab into the next card's frame brings that card into view", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  // The whole board in view, every card too small to use.
  await page.getByRole("toolbar", { name: "Zoom" }).getByRole("button", { name: "Fit" }).click();
  await settled(page);
  await expect.poll(() => percent(page)).toBeLessThan(50);
  // A click in a mock-up frame, then a key pressed in it: the keyboard is in use again, though the board's page saw no key.
  await page.frameLocator('#card-sharing-panel [data-cell="live"][data-width="390"][data-theme="light"] iframe').getByRole("button", { name: "Done" }).click();
  await page.keyboard.press("Shift");
  // Focus reaching the Row menu's live frame, as Tab out of the mock-up would, flies there.
  await page.locator('#card-row-menu [data-cell="live"] iframe').focus();
  await expect(page.locator("#card-row-menu")).toHaveClass(/is-selected/);
  await expect.poll(() => percent(page)).toBeGreaterThan(50);
  await expectInView(page, "row-menu");
});

// The Tweak section (Orbit TOOLS-204): the selected part's real CSS values as fields, which change its live cell
// only (never the state cells or the editor's own styles), per theme for colours; Reset; and "Send to agent", which
// copies a plain-text change request and says Copied on the button. A part with its own component CSS file shows
// that file instead (the CSS section, below).
test("Tweak edits the live Badge's CSS in light and dark, resets it, and Send to agent copies the change request", async ({ page, baseURL }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await openBoard(page, baseURL);
  // A menu or dialog drawing in a state frame takes focus for a moment, which would take a field's typing with it.
  await settled(page);
  await page.getByRole("navigation", { name: "Outline" }).getByRole("button", { name: "Badge", exact: true }).click();
  const options = page.getByRole("complementary", { name: "Options" });
  const tweak = options.getByRole("region", { name: "Tweak" });
  const send = tweak.getByRole("button", { name: /^(Send to agent|Copied)$/ });
  const reset = tweak.getByRole("button", { name: "Reset" });
  await expect(send).toBeDisabled();
  await expect(reset).toBeDisabled();

  const liveBadge = page.locator('#card-badge [data-cell="live"] .ui-badge');
  const stateBadge = page.locator('#card-badge .cat-half[data-theme="light"] .cat-cell .ui-badge[data-kind="tag"]').first();
  const css = (badge: typeof liveBadge, property: string) => badge.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);

  // The real values: a rule of the badge's own and the theme tokens its rules use.
  const dotPadding = tweak.getByRole("textbox", { name: '.ui-badge[data-kind="dot"] { padding }', exact: true });
  const space = tweak.getByRole("textbox", { name: "--space-xs", exact: true });
  await expect(dotPadding).toHaveValue("0px");
  await expect(space).toHaveValue("8px");
  // A value that would break out of its declaration is marked and changes nothing.
  await dotPadding.fill("1px; } body { display: none");
  await expect(dotPadding).toHaveAttribute("aria-invalid", "true");
  expect(await css(liveBadge, "padding-inline-start")).toBe("8px");
  await expect(send).toBeDisabled();
  // A slider beside a single length moves the value from the keyboard.
  await tweak.getByRole("slider", { name: "--space-xs", exact: true }).press("ArrowRight");
  await expect(space).toHaveValue("9px");
  await expect.poll(() => css(liveBadge, "padding-inline-start")).toBe("9px");
  await dotPadding.fill("2px");
  await expect(dotPadding).toHaveAttribute("aria-invalid", "false");
  await space.fill("12px");
  await expect.poll(() => css(liveBadge, "padding-inline-start")).toBe("12px");
  expect(await css(stateBadge, "padding-inline-start")).toBe("8px");
  await expect(space.locator("xpath=ancestor::*[@data-changed][1]")).toBeVisible();

  // A colour changes only the theme on show: dark here, and light keeps its own.
  const lightBackground = await css(liveBadge, "background-color");
  await options.getByRole("group", { name: "Colours" }).getByRole("button", { name: "Dark" }).click();
  const surface = tweak.getByRole("textbox", { name: "--surface-subtle", exact: true });
  await surface.fill("rgb(255, 0, 0)");
  await expect.poll(() => css(liveBadge, "background-color")).toBe("rgb(255, 0, 0)");
  await options.getByRole("group", { name: "Colours" }).getByRole("button", { name: "Light" }).click();
  await expect.poll(() => css(liveBadge, "background-color")).toBe(lightBackground);
  await expect(surface).not.toHaveValue("rgb(255, 0, 0)");
  await expect(space).toHaveValue("12px");

  await expect(send).toBeEnabled();
  await send.click();
  await expect(send).toHaveText("Copied");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("8px → 12px");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("Part: Badge (data-part=\"badge\")");
  expect(copied).toContain('- .ui-badge[data-kind="dot"] { padding }, light and dark: 0px → 2px');
  expect(copied).toMatch(/- --space-xs \(theme token in src\/theme\.css, used by [^)]*\{ padding-inline \}[^)]*\), light and dark: 8px → 12px/);
  expect(copied).toMatch(/- --surface-subtle \(theme token in src\/theme\.css, used by [^)]*\), dark: \S.* → rgb\(255, 0, 0\)/);
  expect(copied).not.toMatch(/--surface-subtle.*, light:/);

  // A clipboard that refuses: the button says so for a moment, then offers itself again.
  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error("refused"));
    document.execCommand = () => false;
  });
  await send.click();
  const refused = tweak.getByRole("button", { name: "Couldn't copy" });
  await expect(refused).toHaveAttribute("data-problem", "");
  await expect(page.locator('p[role="status"]')).toHaveText("Couldn't copy the change request");
  await expect(send).toHaveText("Send to agent");
  await expect(send).not.toHaveAttribute("data-problem");

  await reset.click();
  await expect.poll(() => css(liveBadge, "padding-inline-start")).toBe("8px");
  await expect(space).toHaveValue("8px");
  await expect(send).toBeDisabled();
  await expect(reset).toBeDisabled();
});

// The CSS section (Orbit TOOLS-207): a part with its own component CSS file shows that file in the right panel, in
// place of the Tweak fields. Edits show on its live cell only, in both themes; a deleted declaration is gone there
// too; a file that would reach past the cell is refused beside the field; Reset; "Send to agent" copies the change.
test("the Button's own CSS file edits its live cell only, resets, and Send to agent copies the changed CSS", async ({ page, baseURL }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await openBoard(page, baseURL);
  await settled(page);
  const outline = page.getByRole("navigation", { name: "Outline" });
  await outline.getByRole("button", { name: "Button", exact: true }).click();
  const options = page.getByRole("complementary", { name: "Options" });
  const section = options.getByRole("region", { name: "CSS" });
  await expect(options.getByRole("region", { name: "Tweak" })).toHaveCount(0);
  const file = section.getByRole("textbox", { name: "src/ui/parts/button.css", exact: true });
  const send = section.getByRole("button", { name: /^(Send to agent|Copied)$/ });
  const reset = section.getByRole("button", { name: "Reset" });
  await expect(file).toHaveValue(/@layer components \{/);
  await expect(file).toHaveValue(/--btn-radius: var\(--radius\);/);
  const original = await file.inputValue();
  await expect(send).toBeDisabled();
  await expect(reset).toBeDisabled();

  const liveButton = page.locator('#card-button [data-cell="live"] button');
  const stateButton = page.locator('#card-button .cat-half[data-theme="light"] .cat-cell button').first();
  const css = (button: typeof liveButton, property: string) => button.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
  expect(await css(liveButton, "border-radius")).toBe("6px");

  // A changed default and a deleted declaration: both on the live cell, neither on a state cell or the panel's buttons.
  const edited = original.replace("--btn-radius: var(--radius);", "--btn-radius: 16px;").replace(/\n\s*font-weight: var\(--btn-font-weight\);/, "");
  await file.fill(edited);
  await expect.poll(() => css(liveButton, "border-radius")).toBe("16px");
  await expect.poll(() => css(liveButton, "font-weight")).toBe("400");
  expect(await css(stateButton, "border-radius")).toBe("6px");
  expect(await css(stateButton, "font-weight")).toBe("600");
  expect(await reset.evaluate((element) => getComputedStyle(element).fontWeight)).toBe("600");
  await expect(section).toHaveAttribute("data-changed", "");

  // A stray brace would reach the whole board: refused beside the field, the cell keeps the last good file.
  await file.fill(`${edited}\n}`);
  await expect(file).toHaveAttribute("aria-invalid", "true");
  await expect(section.getByText("A } closes a rule that was never opened")).toBeVisible();
  await expect(send).toBeDisabled();
  expect(await css(liveButton, "border-radius")).toBe("16px");
  // As the browser reads it: an escaped ")" keeps the url open, so its brace is text and the next "}" is a stray.
  await file.fill(`${edited}\n.button { background: url(a\\){) } } body { display: none }`);
  await expect(file).toHaveAttribute("aria-invalid", "true");
  await expect(send).toBeDisabled();
  await expect(page.locator("body")).toBeVisible();
  expect(await css(liveButton, "border-radius")).toBe("16px");
  await file.fill(edited);
  await expect(file).toHaveAttribute("aria-invalid", "false");
  await expect(section.getByText("A } closes a rule that was never opened")).toBeHidden();

  // The State option forces the live cell's hover from the file as edited.
  const state = options.getByRole("combobox", { name: "State" });
  const hoverCell = page.locator('#card-button .cat-half[data-theme="light"] .cat-cell[data-state="hover"] button').first();
  await state.selectOption("hover");
  await expect.poll(() => css(liveButton, "background-color")).toBe(await css(hoverCell, "background-color"));
  await file.fill(edited.replace("--btn-hover-background: var(--primary-hover);", "--btn-hover-background: rgb(0, 128, 0);"));
  await expect.poll(() => css(liveButton, "background-color")).toBe("rgb(0, 128, 0)");
  await file.fill(edited);
  await state.selectOption("normal");

  // The live cell shows the file as edited, alone: a deleted hover rule leaves the hover on the normal fill.
  const fill = await css(liveButton, "background-color");
  await liveButton.hover();
  await expect.poll(() => css(liveButton, "background-color")).not.toBe(fill);
  await page.mouse.move(0, 0);
  await file.fill(edited.replace(/\n\s*@media \(hover: hover\) and \(pointer: fine\) \{[^{}]*\{[^{}]*\}\s*\}/, ""));
  await liveButton.hover();
  await expect.poll(() => css(liveButton, "background-color")).toBe(fill);
  await page.mouse.move(0, 0);
  // A selector that names other buttons still reaches only the live cell: never a state cell or the panel's buttons.
  const secondaryCell = page.locator('#card-button .cat-half[data-theme="light"] .cat-cell button.secondary').first();
  const [cellFill, resetFill] = await Promise.all([css(secondaryCell, "background-color"), css(reset, "background-color")]);
  await file.fill(edited.replace("&:active:not(:disabled) {", ":is(&, .secondary) { background: rgb(255, 0, 0); }\n    &:active:not(:disabled) {"));
  await expect.poll(() => css(liveButton, "background-color")).toBe("rgb(255, 0, 0)");
  expect(await css(secondaryCell, "background-color")).toBe(cellFill);
  expect(await css(reset, "background-color")).toBe(resetFill);
  await file.fill(edited);

  // The file holds both themes: the edit stays in dark, and the selection keeps it on the way back.
  await options.getByRole("group", { name: "Colours" }).getByRole("button", { name: "Dark" }).click();
  await expect.poll(() => css(liveButton, "border-radius")).toBe("16px");
  await outline.getByRole("button", { name: "Badge", exact: true }).click();
  await outline.getByRole("button", { name: "Button", exact: true }).click();
  await expect(file).toHaveValue(edited);

  await expect(send).toBeEnabled();
  await send.click();
  await expect(send).toHaveText("Copied");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("File: src/ui/parts/button.css");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("Part: Button (data-part=\"button\")");
  expect(copied).toContain("\n-    --btn-radius: var(--radius);\n+    --btn-radius: 16px;\n");
  expect(copied).toContain("\n-    font-weight: var(--btn-font-weight);\n");
  expect(copied).toContain(`\`\`\`css\n${edited.trimEnd()}\n\`\`\``);

  await reset.click();
  await expect(file).toHaveValue(original);
  await expect.poll(() => css(liveButton, "border-radius")).toBe("6px");
  await expect.poll(() => css(liveButton, "font-weight")).toBe("600");
  await expect(send).toBeDisabled();
  await expect(reset).toBeDisabled();
  await expect(page.locator('p[role="status"]')).toHaveText("Button reset");
});

test("Tweak reaches a part drawn in a live frame, and leaves its state frames as they are", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  await page.getByRole("navigation", { name: "Outline" }).getByRole("button", { name: "Row menu", exact: true }).click();
  await settled(page);
  const tweak = page.getByRole("complementary", { name: "Options" }).getByRole("region", { name: "Tweak" });
  const corner = tweak.getByRole("textbox", { name: "--radius-panel", exact: true });
  await expect(corner).toHaveValue("8px");
  await corner.fill("20px");
  const live = page.frameLocator('#card-row-menu [data-cell="live"] iframe');
  await live.getByRole("button", { name: "Actions" }).click();
  await expect.poll(() => live.locator(".row-menu").evaluate((menu) => getComputedStyle(menu).borderRadius)).toBe("20px");
  const fixed = page.frameLocator('#card-row-menu .cat-half[data-theme="light"] iframe').first().locator(".row-menu");
  expect(await fixed.evaluate((menu) => getComputedStyle(menu).borderRadius)).toBe("8px");
  // Dark makes the live frame anew: the edit is still there.
  await page.getByRole("complementary", { name: "Options" }).getByRole("group", { name: "Colours" }).getByRole("button", { name: "Dark" }).click();
  await expect(page.locator('#card-row-menu [data-cell="live"] iframe')).toHaveAttribute("data-theme", "dark");
  await live.getByRole("button", { name: "Actions" }).click();
  await expect.poll(() => live.locator(".row-menu").evaluate((menu) => getComputedStyle(menu).borderRadius)).toBe("20px");
});

test("the Icon's live cell puts its words on the side Place says, and draws a bare icon alone", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  await page.getByRole("navigation", { name: "Outline" }).getByRole("button", { name: "Icon", exact: true }).click();
  const options = page.getByRole("complementary", { name: "Options" });
  const stage = page.locator("#card-icon .cat-live__stage");
  await expect(stage.locator("> svg.icon")).toHaveCount(1);

  await options.getByRole("combobox", { name: /^Size/ }).selectOption("24");
  const alone = stage.locator("> svg.icon");
  await expect(alone).toHaveAttribute("data-size", "24");
  await expect(alone).not.toHaveAttribute("data-place", /.*/);
  await expect(alone).toHaveAttribute("aria-hidden", "true");
  // The board's zoom may leave a fraction of a pixel.
  expect(await alone.evaluate((svg) => parseFloat(getComputedStyle(svg).width))).toBeCloseTo(24, 0);
  expect(await alone.evaluate((svg) => parseFloat(getComputedStyle(svg).height))).toBeCloseTo(24, 0);

  await options.getByRole("textbox", { name: "Words" }).fill("Save");
  await options.getByRole("combobox", { name: /^Place/ }).selectOption("before");
  const line = stage.locator(".icon-line");
  await expect(line).toHaveText("Save");
  await expect(line.locator("> :first-child")).toHaveJSProperty("localName", "svg");
  await expect(line.locator("> svg")).toHaveAttribute("data-place", "before");
  // The gap is the shared small space, on the line, not a margin on the icon.
  const gap = () => line.evaluate((element) => ({
    gap: parseFloat(getComputedStyle(element).columnGap),
    token: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--space-3xs")),
    margin: parseFloat(getComputedStyle(element.querySelector("svg")!).marginInlineStart) + parseFloat(getComputedStyle(element.querySelector("svg")!).marginInlineEnd),
  }));
  const before = await gap();
  expect(before.gap).toBe(before.token);
  expect(before.margin).toBe(0);
  // A text node (nodeType 3) after the icon.
  expect(await line.evaluate((element) => element.lastChild?.nodeType)).toBe(3);

  await options.getByRole("combobox", { name: /^Place/ }).selectOption("after");
  await expect(line.locator("> svg")).toHaveAttribute("data-place", "after");
  await expect(line.locator("> :last-child")).toHaveJSProperty("localName", "svg");
  expect(await line.evaluate((element) => element.firstChild?.nodeType)).toBe(3);
  expect((await gap()).gap).toBe(before.token);

  // Right to left: Before words puts the icon on the right.
  await options.getByRole("combobox", { name: /^Place/ }).selectOption("before");
  await stage.evaluate((element) => element.setAttribute("dir", "rtl"));
  await expect(line.locator("> :first-child")).toHaveJSProperty("localName", "svg");
  const [iconBox, lineBox] = await Promise.all([line.locator("> svg").boundingBox(), line.boundingBox()]);
  expect(iconBox && lineBox && iconBox.x + iconBox.width > lineBox.x + lineBox.width - 1).toBe(true);
  await stage.evaluate((element) => element.removeAttribute("dir"));
  await options.getByRole("combobox", { name: /^Place/ }).selectOption("after");

  // Nothing to stand beside (no words, or only spaces): the icon is drawn alone, with no wrapper.
  for (const blank of ["", "   "]) {
    await options.getByRole("textbox", { name: "Words" }).fill(blank);
    await expect(stage.locator("> svg.icon")).toHaveCount(1);
    await expect(stage.locator("> svg.icon")).not.toHaveAttribute("data-place", /.*/);
  }

  // The part itself: words may be an element, and Alone drops them.
  const drawn = await page.evaluate(async () => {
    const { iconPart } = await import("/src/ui/parts/icon.ts");
    const strong = document.createElement("strong");
    strong.textContent = "Next";
    const withElement = iconPart("check", { place: "after", words: strong });
    const alone = iconPart("check", { place: "alone", words: "Save" });
    return {
      lineClass: withElement.getAttribute("class"),
      order: [...withElement.children].map((child) => child.localName),
      aloneName: alone.localName,
      alonePlace: alone.getAttribute("data-place"),
    };
  });
  expect(drawn).toEqual({ lineClass: "icon-line", order: ["strong", "svg"], aloneName: "svg", alonePlace: null });
});

test("the Spinner's live cell follows Size and Place, and the Progress bar's follows Amount", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  const outline = page.getByRole("navigation", { name: "Outline" });
  const options = page.getByRole("complementary", { name: "Options" });

  await outline.getByRole("button", { name: "Spinner", exact: true }).click();
  const ring = page.locator("#card-spinner .cat-live__stage .spinner");
  await expect(ring).toHaveAttribute("data-size", "medium");
  await expect(ring).toHaveAttribute("role", "img");
  await expect(ring).toHaveAttribute("aria-label", "Loading");
  await options.getByRole("combobox", { name: /^Size/ }).selectOption("large");
  await expect(ring).toHaveAttribute("data-size", "large");
  // The ring is drawn on the element's ::before, a token wide (--space-l); the board's zoom may leave a fraction.
  expect(await ring.evaluate((el) => parseFloat(getComputedStyle(el, "::before").width))).toBeCloseTo(24, 0);
  expect(await ring.evaluate((el) => getComputedStyle(el, "::before").animationName)).toBe("spinner-turn");
  await options.getByRole("textbox", { name: "Label" }).fill("Saving");
  await expect(ring).toHaveAttribute("aria-label", "Saving");
  await options.getByRole("combobox", { name: /^Place/ }).selectOption("overlay");
  const overlay = page.locator("#card-spinner .cat-live__stage .cat-overlay-host > .spinner");
  await expect(overlay).toHaveAttribute("data-place", "overlay");
  // It covers the block it is over, corner to corner.
  const [host, over] = await Promise.all([overlay.locator("xpath=..").boundingBox(), overlay.boundingBox()]);
  expect(host && over).toBeTruthy();
  expect(Math.abs(host!.width - over!.width)).toBeLessThan(2);
  expect(Math.abs(host!.height - over!.height)).toBeLessThan(2);

  await outline.getByRole("button", { name: "Progress bar", exact: true }).click();
  const bar = page.locator("#card-progress .cat-live__stage .progress");
  await expect(bar).toHaveAttribute("data-mode", "known");
  await expect(bar).toHaveAttribute("aria-valuenow", "60");
  await expect(bar).toHaveAttribute("aria-label", "Adding pictures");
  const fill = (el: Element) => parseFloat(getComputedStyle(el, "::before").width) / parseFloat(getComputedStyle(el).width);
  await expect.poll(() => bar.evaluate(fill)).toBeCloseTo(0.6, 1);
  await options.getByRole("combobox", { name: /^Amount/ }).selectOption("unknown");
  await expect(bar).toHaveAttribute("data-mode", "unknown");
  await expect(bar).not.toHaveAttribute("aria-valuenow", /.*/);
  expect(await bar.evaluate((el) => getComputedStyle(el, "::before").animationName)).toBe("progress-slide");
});

test("the Progress bar's fill grows from where it was when moved, and its value follows 30, 60, unknown", async ({ page, baseURL }) => {
  // The suite runs with reduced motion on; the growing is the motion version.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openBoard(page, baseURL);
  await page.getByRole("navigation", { name: "Outline" }).getByRole("button", { name: "Progress bar", exact: true }).click();
  const drawn = await page.evaluate(async () => {
    const { progress, setProgress } = await import("/src/ui/parts/progress.ts");
    const bar = progress({ value: 30, label: "Adding" });
    bar.style.inlineSize = "200px";
    document.body.append(bar);
    const read = () => ({
      mode: bar.dataset.mode, now: bar.getAttribute("aria-valuenow"), min: bar.getAttribute("aria-valuemin"), max: bar.getAttribute("aria-valuemax"),
      fill: bar.style.getPropertyValue("--progress"), label: bar.getAttribute("aria-label"),
    });
    const first = read();
    // The bar has been drawn at 30 before it moves: a style the page has never computed has nothing to grow from.
    const start = parseFloat(getComputedStyle(bar, "::before").width);
    setProgress(bar, { value: 60, label: "Adding" });
    // The width the fill has one frame after the move: between the two, so it is growing, not jumping.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const growing = parseFloat(getComputedStyle(bar, "::before").width);
    const second = read();
    setProgress(bar, { label: "Adding" });
    const third = read();
    bar.remove();
    return { first, second, third, start, growing };
  });
  expect(drawn.first).toEqual({ mode: "known", now: "30", min: "0", max: "100", fill: "30%", label: "Adding" });
  expect(drawn.second).toEqual({ mode: "known", now: "60", min: "0", max: "100", fill: "60%", label: "Adding" });
  expect(drawn.third).toEqual({ mode: "unknown", now: null, min: null, max: null, fill: "", label: "Adding" });
  expect(drawn.start).toBeCloseTo(60, 0);
  expect(drawn.growing).toBeGreaterThan(60);
  expect(drawn.growing).toBeLessThan(120);
});

test("with reduced motion the Spinner and the unknown Progress bar slow down, and the known fill stops growing", async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openBoard(page, baseURL);
  const outline = page.getByRole("navigation", { name: "Outline" });
  const options = page.getByRole("complementary", { name: "Options" });
  const before = (selector: string, property: "animationDuration" | "animationName" | "transitionDuration") =>
    page.locator(selector).evaluate((el, name) => getComputedStyle(el, "::before")[name as "animationDuration"], property);

  await outline.getByRole("button", { name: "Spinner", exact: true }).click();
  const ring = "#card-spinner .cat-live__stage .spinner";
  await expect(page.locator(ring)).toBeVisible();
  expect(await before(ring, "animationDuration")).toBe("2.4s");
  expect(await before(ring, "animationName")).toBe("spinner-turn");

  await outline.getByRole("button", { name: "Progress bar", exact: true }).click();
  const bar = "#card-progress .cat-live__stage .progress";
  await expect(page.locator(bar)).toHaveAttribute("data-mode", "known");
  expect(await before(bar, "transitionDuration")).toBe("0s");
  await options.getByRole("combobox", { name: /^Amount/ }).selectOption("unknown");
  await expect(page.locator(bar)).toHaveAttribute("data-mode", "unknown");
  expect(await before(bar, "animationDuration")).toBe("3s");
  expect(await before(bar, "animationName")).toBe("progress-slide");
});

test("the Progress bar slides and fills from the right when the page runs right to left", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  await page.getByRole("navigation", { name: "Outline" }).getByRole("button", { name: "Progress bar", exact: true }).click();
  const options = page.getByRole("complementary", { name: "Options" });
  const stage = page.locator("#card-progress .cat-live__stage");
  const bar = stage.locator(".progress");
  const amount = options.getByRole("combobox", { name: /^Amount/ });
  await expect(bar).toHaveAttribute("data-mode", "known");
  await stage.evaluate((el) => el.setAttribute("dir", "rtl"));
  // A two pixel sample of the bar's picture, a little in from its rounded end.
  const end = async (side: "left" | "right") => {
    const box = (await bar.boundingBox())!;
    const x = side === "left" ? box.x + 5 : box.x + box.width - 7;
    return page.screenshot({ clip: { x, y: box.y + box.height / 2 - 1, width: 2, height: 2 } });
  };
  await amount.selectOption("100");
  await expect(bar).toHaveAttribute("aria-valuenow", "100");
  const filled = await end("right");
  await amount.selectOption("30");
  await expect(bar).toHaveAttribute("aria-valuenow", "30");
  expect(await bar.evaluate((el) => getComputedStyle(el).direction)).toBe("rtl");
  // The fill is on the right: its right end looks like a full bar's, its left end is the empty track.
  expect((await end("right")).equals(filled)).toBe(true);
  expect((await end("left")).equals(filled)).toBe(false);
  await amount.selectOption("unknown");
  await expect(bar).toHaveAttribute("data-mode", "unknown");
  await expect.poll(() => bar.evaluate((el) => getComputedStyle(el, "::before").animationName)).toBe("progress-slide-rtl");
});

test("the Badge, Section heading and Keyboard key draw their options in the live cell", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  const outline = page.getByRole("navigation", { name: "Outline" });
  const options = page.getByRole("complementary", { name: "Options" });

  // Badge: a count over 99 reads 99+, a dot has a name and no text, the tone is data on the one class.
  await outline.getByRole("button", { name: "Badge", exact: true }).click();
  const badge = page.locator("#card-badge .cat-live__stage > .ui-badge");
  await expect(badge).toHaveAttribute("data-kind", "tag");
  await expect(badge).toHaveText("Draft");
  await options.getByRole("combobox", { name: /^Kind/ }).selectOption("count");
  await options.getByRole("textbox", { name: "Words" }).fill("120");
  await options.getByRole("combobox", { name: /^Tone/ }).selectOption("question");
  await expect(badge).toHaveText("99+");
  await expect(badge).toHaveAttribute("data-tone", "question");
  await options.getByRole("combobox", { name: /^Kind/ }).selectOption("dot");
  await options.getByRole("textbox", { name: "Words" }).fill("Waiting");
  await expect(badge).toHaveText("");
  await expect(badge).toHaveAttribute("aria-label", "Waiting");
  await options.getByRole("combobox", { name: /^Kind/ }).selectOption("mark");
  await expect(badge.locator("svg.icon")).toHaveAttribute("data-size", "12");

  // Section heading: the words are a heading of the chosen level, the end slot follows them.
  await outline.getByRole("button", { name: "Section heading", exact: true }).click();
  const heading = page.locator("#card-section-heading .cat-live__stage > .ui-section-heading");
  await expect(heading.getByRole("heading", { level: 3, name: "Pages" })).toBeVisible();
  await expect(heading.locator("[data-slot='end']")).toHaveCount(0);
  await options.getByRole("combobox", { name: /^Level/ }).selectOption("2");
  await options.getByRole("combobox", { name: /^End slot/ }).selectOption("count");
  await expect(heading.getByRole("heading", { level: 2, name: "Pages" })).toBeVisible();
  await expect(heading.locator("[data-slot='end'] > .ui-badge")).toHaveText("12");
  await options.getByRole("combobox", { name: /^End slot/ }).selectOption("button");
  await expect(heading.locator("[data-slot='end']").getByRole("button", { name: "Add" })).toBeVisible();

  // Keyboard key: one key is one cap, several are a group of caps.
  await outline.getByRole("button", { name: "Keyboard key", exact: true }).click();
  const stage = page.locator("#card-key .cat-live__stage");
  await expect(stage.locator("kbd.ui-key[data-combo] > kbd")).toHaveText(["Ctrl", "K"]);
  await options.getByRole("textbox", { name: /^Keys/ }).fill("Esc");
  await expect(stage.locator("kbd.ui-key:not([data-combo])")).toHaveText("Esc");
  await options.getByRole("textbox", { name: /^Keys/ }).fill("");
  await expect(stage.locator("kbd")).toHaveCount(0);
  await expect(stage).toContainText("Type a key");
});

test("a long badge is cut inside its stage, a mark with no icon draws the check, and a key takes the colour around it", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  const outline = page.getByRole("navigation", { name: "Outline" });
  const options = page.getByRole("complementary", { name: "Options" });

  // Long words: the badge never grows past the stage, and the words are cut with an ellipsis.
  await outline.getByRole("button", { name: "Badge", exact: true }).click();
  const stage = page.locator("#card-badge .cat-live__stage");
  await options.getByRole("combobox", { name: /^Kind/ }).selectOption("tag");
  await options.getByRole("textbox", { name: "Words" }).fill("A page title far longer than any badge should ever be, so it must be cut ".padEnd(80, "x"));
  const badge = stage.locator("> .ui-badge");
  await expect(badge).toHaveAttribute("data-kind", "tag");
  await stage.evaluate((element) => { element.style.inlineSize = "120px"; });
  const widths = await badge.evaluate((element) => ({
    badge: element.getBoundingClientRect().width,
    stage: element.parentElement!.getBoundingClientRect().width,
    cut: element.firstElementChild!.scrollWidth > element.firstElementChild!.clientWidth,
  }));
  expect(widths.badge).toBeLessThanOrEqual(widths.stage + 0.5);
  expect(widths.cut).toBe(true);

  // In a flex row beside a title the badge shrinks too, so its words are cut and the title keeps its room.
  const row = await stage.evaluate((element) => {
    element.style.display = "flex";
    const title = document.createElement("span");
    title.textContent = "Title";
    element.prepend(title);
    const badgeEl = element.querySelector<HTMLElement>(":scope > .ui-badge")!;
    const result = {
      fits: badgeEl.getBoundingClientRect().right <= element.getBoundingClientRect().right + 0.5,
      cut: badgeEl.firstElementChild!.scrollWidth > badgeEl.firstElementChild!.clientWidth,
      title: title.getBoundingClientRect().width,
    };
    title.remove();
    element.style.display = "";
    return result;
  });
  expect(row.fits).toBe(true);
  expect(row.cut).toBe(true);
  expect(row.title).toBeGreaterThan(0);

  // Only the inline axis is cut: accents and descenders keep their room (the span is as tall as its words).
  await stage.evaluate((element) => { element.style.inlineSize = ""; });
  await options.getByRole("textbox", { name: "Words" }).fill("Égypte jumpy");
  await expect(badge.locator("> span")).toHaveText("Égypte jumpy");
  const tall = await badge.locator("> span").evaluate((element) => ({ scroll: element.scrollHeight, client: element.clientHeight, clip: getComputedStyle(element).overflowY }));
  expect(tall.scroll).toBeLessThanOrEqual(tall.client);
  expect(tall.clip).toBe("visible");

  // A mark called with no icon draws the check, at the mark's size.
  const mark = await page.evaluate(async () => {
    const { badgePart } = await import("/src/ui/parts/badge.ts");
    const element = badgePart({ kind: "mark" });
    const svg = element.querySelector("svg.icon");
    return { size: svg?.getAttribute("data-size") ?? null, hidden: element.getAttribute("aria-hidden") };
  });
  expect(mark).toEqual({ size: "12", hidden: "true" });

  // The key has no colour of its own: it takes the one around it.
  await outline.getByRole("button", { name: "Keyboard key", exact: true }).click();
  const keyStage = page.locator("#card-key .cat-live__stage");
  await expect(keyStage.locator("kbd.ui-key")).toBeVisible();
  await keyStage.evaluate((element) => { element.style.color = "rgb(200, 0, 0)"; });
  await expect.poll(() => keyStage.locator("kbd.ui-key").evaluate((element) => getComputedStyle(element).color)).toBe("rgb(200, 0, 0)");
  await expect.poll(() => keyStage.locator("kbd.ui-key > kbd").first().evaluate((element) => getComputedStyle(element).color)).toBe("rgb(200, 0, 0)");
  // A single cap takes it too (it has its own border and fill, from the same colour).
  await options.getByRole("textbox", { name: /^Keys/ }).fill("K");
  const single = keyStage.locator("kbd.ui-key:not([data-combo])");
  await expect(single).toHaveText("K");
  await expect.poll(() => single.evaluate((element) => getComputedStyle(element).color)).toBe("rgb(200, 0, 0)");
  await expect.poll(() => single.evaluate((element) => getComputedStyle(element).borderTopColor)).toMatch(/ 29\.\d+ \/ 0\.28\)$/); // the red's hue, at the 28% the cap mixes in
});

test("the Editor screen is the editor's own workspace at 1280 and 390, light and dark, and it works", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  await flyTo(page, "Editor");
  const card = page.locator("#card-editor");
  await expect(card).toHaveAttribute("data-files", /src\/workspace-shell\.ts/);
  const frames = card.locator("iframe");
  await expect(frames).toHaveCount(4);
  const wide = card.locator('[data-cell="live"][data-width="1280"][data-theme="light"] iframe').contentFrame();
  // The editor's own top bar, Page structure, canvas bar and code pane, with its ids and classes.
  await expect(wide.locator(".cat-frame-stage")).toHaveAttribute("data-files", /src\/components\/page-structure\.ts/);
  await expect(wide.locator("#app .topbar .repository-menu__trigger")).toBeVisible();
  await expect(wide.locator("#app .topbar #current-page")).toHaveText("Home");
  const rows = wide.getByRole("complementary", { name: "Page structure" }).locator(".page-structure__row");
  await expect(rows.first()).toContainText("Header");
  await expect(rows.filter({ hasText: "Garden care that lasts" })).toHaveCount(1);
  await expect(wide.locator(".page-structure__row[aria-selected='true']")).toContainText("Section");
  await expect(wide.locator(".canvas-bar .canvas-crumbs")).toContainText("section.hero");
  await expect(wide.locator("#primary-title")).toHaveText("index.html");
  // Real behaviour: a row chosen in Page structure is selected; the page button opens Pages & files.
  await wide.locator(".page-structure__row", { hasText: "Main" }).click();
  await expect(wide.locator(".page-structure__row[aria-selected='true']")).toContainText("Main");
  await wide.locator("#explorer-toggle").click();
  await expect(wide.locator("#explorer")).toBeVisible();
  // A real hover: Publish takes its hover colour under the pointer.
  const publish = wide.locator(".publish-menu__trigger");
  await page.keyboard.press("Escape");
  const rest = await publish.evaluate((element) => getComputedStyle(element).backgroundColor);
  await publish.hover();
  await expect.poll(() => publish.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(rest);

  // At 390 the frame is a phone-wide window: the phone's top bar, its Menu, and the pull-up sheet.
  const phone = card.locator('[data-cell="live"][data-width="390"][data-theme="dark"] iframe').contentFrame();
  await expect(phone.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(phone.locator("#sheet-handle")).toBeVisible();
  await phone.locator("#topbar-menu").click();
  await expect(phone.getByRole("dialog", { name: "Menu" })).toBeVisible();
});

test("the Editor screen's options reach its frames: the page's name and the phone's Menu open", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  await flyTo(page, "Editor");
  const options = page.getByRole("complementary", { name: "Options" });
  await options.getByRole("textbox", { name: "Page" }).fill("Journal");
  await options.getByRole("switch", { name: "Menu open on the phone" }).check();
  const card = page.locator("#card-editor");
  await expect(card.locator('[data-width="1280"][data-theme="light"] iframe').contentFrame().locator("#current-page")).toHaveText("Journal");
  await expect(card.locator('[data-width="390"][data-theme="light"] iframe').contentFrame().getByRole("dialog", { name: "Menu" })).toBeVisible();
});
