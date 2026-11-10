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
/** Every frame has drawn and the camera holds still (the first view fits again once every part has drawn). */
async function settled(page: Page) {
  await expect.poll(async () => {
    const frames = page.frames().filter((frame) => frame !== page.mainFrame());
    const drawn = await Promise.all(frames.map((frame) => frame.evaluate(() => (document.querySelector(".cat-frame-stage")?.childElementCount ?? 0) > 0).catch(() => false)));
    return frames.length > 0 && drawn.every(Boolean);
  }).toBe(true);
  let last = "";
  const camera = () => page.locator(".cat-world").evaluate((world) => world.style.transform);
  await expect.poll(async () => { const now = await camera(); const still = now === last; last = now; return still; }, { intervals: [300] }).toBe(true);
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
