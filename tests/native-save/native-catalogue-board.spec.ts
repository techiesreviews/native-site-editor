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
  await expect(options.getByRole("button", { name: "Approved" })).toHaveAttribute("aria-pressed", "true");
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
