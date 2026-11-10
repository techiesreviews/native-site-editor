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
  // The card on the canvas carries the same list, and its frames draw the editor's real menu, open.
  await expect(page.locator("#card-row-menu").getByRole("list", { name: "Made of" }).getByRole("button", { name: "Icon" })).toBeVisible();
  await expect(page.frameLocator("#card-row-menu .cat-live iframe").locator(".row-menu")).toContainText("Rename");
  await options.getByRole("switch", { name: "Remove" }).click();
  await expect(page.frameLocator("#card-row-menu .cat-live iframe").locator(".row-menu")).not.toContainText("Remove");
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

test("Space presses a focused button on the canvas instead of panning", async ({ page, baseURL }) => {
  await openBoard(page, baseURL);
  const zoom = page.getByRole("toolbar", { name: "Zoom" });
  const percent = async () => parseInt(await zoom.locator("output").innerText(), 10);
  // The first view fits again once every part has drawn, and a menu drawing in a frame focuses itself (the board then
  // takes focus back, which drops a key press half made): wait until every frame has drawn and the zoom holds still.
  await expect.poll(async () => {
    const frames = page.frames().filter((frame) => frame !== page.mainFrame());
    const drawn = await Promise.all(frames.map((frame) => frame.evaluate(() => (document.querySelector(".cat-frame-stage")?.childElementCount ?? 0) > 0).catch(() => false)));
    return frames.length > 0 && drawn.every(Boolean);
  }).toBe(true);
  let last = -1;
  await expect.poll(async () => { const now = await percent(); const still = now === last; last = now; return still; }, { intervals: [300] }).toBe(true);
  const before = await percent();
  await zoom.getByRole("button", { name: "Zoom in" }).focus();
  await expect(zoom.getByRole("button", { name: "Zoom in" })).toBeFocused();
  await page.keyboard.press("Space");
  await expect.poll(percent).toBeGreaterThan(before);
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
  const liveMenu = page.frameLocator("#card-row-menu .cat-live iframe").locator(".row-menu");
  await expect(liveMenu).toContainText("Rename");
  await expect(liveMenu).not.toContainText("Remove");
});

test("a menu drawing in its frame leaves the board's focus where it was", async ({ page, baseURL }) => {
  // The open Row menu focuses its first item as it draws; every frame's copy of the entry script waits until released.
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
  await expect(page.frameLocator("#card-row-menu .cat-live iframe").locator(".row-menu")).toContainText("Rename");
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
