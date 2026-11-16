import { expect, test, type Locator, type Page } from "@playwright/test";
import { openProjectMenu, phoneMenu, sheetReady } from "./phone-menu";

// Bigger tap targets on phones (TOOLS-269, Lex's approved prototype of 2026-11-16): the eight places the UX check on PR #378
// found too small for a finger take the editor's phone switch (--size-tap, 44 px). On a phone each is at least 44 x 44 px to
// tap (the style chip shows 28 px inside its 44 px tap area); on a desktop with a mouse every one keeps the size it has today.
// Default fixture group.
test.beforeEach(({ page }) => page.setDefaultTimeout(15_000));

const box = async (locator: Locator) => {
  await expect(locator).toBeVisible();
  // Measured where the element is when asked: a list drawn again in between has a new one.
  const { width, height } = await locator.evaluate((element) => { const rect = element.getBoundingClientRect(); return { width: rect.width, height: rect.height }; });
  return { width: Math.round(width), height: Math.round(height) };
};
const menu = (page: Page) => page.locator("#repository-actions");
const branches = (page: Page) => page.getByRole("menu", { name: "Branches" });
const history = (page: Page) => page.getByRole("dialog", { name: "History" });
const phone = (page: Page) => page.viewportSize()!.width <= 650;

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}

/** 1-3: the project menu's rows, its heading's Reload, its search box, Add repositories and Install on another account. */
async function projectMenu(page: Page) {
  await openProjectMenu(page, { tap: phone(page) });
  await expect(menu(page).locator(".repository-menu__repo").first()).toBeVisible();
  return {
    reload: await box(menu(page).getByRole("button", { name: "Reload repositories", exact: true })),
    search: await box(menu(page).getByRole("searchbox", { name: "Find a repository" })),
    add: await box(menu(page).locator(".repository-menu__add")),
    another: await box(menu(page).locator(".repository-menu__another")),
    addAccount: await box(menu(page).getByRole("link", { name: "+ Add another account" })),
    signOut: await box(menu(page).getByRole("button", { name: /^Sign out/ })),
  };
}

/** 4-5: the Branches flyout's rows and its Refresh from GitHub. */
async function branchFlyout(page: Page) {
  const row = menu(page).locator('.repository-menu__repo[aria-current="true"]');
  await (phone(page) ? row.tap() : row.click());
  await expect(branches(page)).toBeVisible();
  return {
    branch: await box(branches(page).getByRole("menuitemradio", { name: "main" })),
    refresh: await box(branches(page).getByRole("menuitem", { name: "Refresh from GitHub" })),
  };
}

/** 6-7: Page structure's Add, and a rule chip over the linked styles pane. */
async function structureAndCode(page: Page) {
  const hero = page.frameLocator(".native-preview-frame").locator(".hero h1");
  if (phone(page)) {
    await sheetReady(page);
    await hero.tap();
    const handle = page.getByRole("button", { name: "Page structure and code" });
    if ((await handle.getAttribute("aria-expanded")) !== "true") await handle.tap();
  } else await hero.click();
  const chip = page.locator("#secondary-rules .code-pane__rule").first();
  const add = page.locator("#add-panel-toggle");
  await add.scrollIntoViewIfNeeded();
  // The chips are drawn again as the selection settles (about a second later), so each look finds the chip afresh. The
  // look is the pill a person sees: the chip without the clear band round it that takes the finger.
  const measure = () => page.evaluate(() => {
    const element = document.querySelector("#secondary-rules .code-pane__rule")!;
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
    const look = rect.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth);
    return { width: Math.round(rect.width), height: Math.round(rect.height), look: Math.round(look) };
  });
  await expect(chip).toBeVisible();
  const { look, ...size } = await measure();
  return { add: await box(add), chip: size, chipLook: look };
}

/** 8: Whole-site history's file rows and a commit's ⋯. */
async function historyFiles(page: Page) {
  if (phone(page)) await phoneMenu(page, "History", { tap: true });
  else await page.locator("#history-button").click();
  await history(page).getByRole("tab", { name: "Whole site" }).click();
  const latest = history(page).locator(".commit-history__item").first();
  await latest.locator(".commit-history__view").click();
  await expect(latest.locator(".commit-history__view")).toHaveAttribute("aria-expanded", "true");
  await latest.hover();
  return {
    file: await box(latest.locator(".commit-history__file").first()),
    more: await box(latest.getByRole("button", { name: /^Actions for / })),
  };
}

// 390 px is the phone the prototype draws; Lex's own phone is not named, so the narrowest and widest common ones too.
for (const width of [390, 360, 430]) test.describe(`phone, ${width} px`, () => {
  test.use({ viewport: { width, height: 844 }, hasTouch: true });

  const big = (sizes: Record<string, { width: number; height: number }>) => {
    for (const [name, size] of Object.entries(sizes)) {
      expect.soft(size.height, `${name} height`).toBeGreaterThanOrEqual(44);
      expect.soft(size.width, `${name} width`).toBeGreaterThanOrEqual(44);
    }
  };

  test("the project menu's rows, Reload, search box, Add and Install rows, the branch rows and Branches refresh are 44 px to tap", async ({ page, baseURL }) => {
    await open(page, baseURL);
    big(await projectMenu(page));
    big(await branchFlyout(page));
  });

  test("Page structure's Add is 44 px; the style chip is 44 px to tap and 28 px to see", async ({ page, baseURL }) => {
    await open(page, baseURL);
    const sizes = await structureAndCode(page);
    big({ add: sizes.add, chip: sizes.chip });
    expect(sizes.chipLook).toBe(28);
  });

  test("Whole-site history's file rows and a commit's ⋯ are 44 px to tap", async ({ page, baseURL }) => {
    await open(page, baseURL);
    big(await historyFiles(page));
  });
});

test.describe("desktop, 1280 px", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the project menu and Branches keep today's sizes", async ({ page, baseURL }) => {
    await open(page, baseURL);
    const sizes = await projectMenu(page);
    expect(sizes.reload).toEqual({ width: 24, height: 24 });
    for (const name of ["search", "add", "another", "addAccount", "signOut"] as const) expect(sizes[name].height, name).toBe(32);
    const flyout = await branchFlyout(page);
    expect(flyout.branch.height).toBe(32);
    expect(flyout.refresh).toEqual({ width: 24, height: 24 });
  });

  test("Page structure's Add and the style chip keep today's sizes", async ({ page, baseURL }) => {
    await open(page, baseURL);
    const sizes = await structureAndCode(page);
    expect(sizes.add.height).toBe(30);
    expect(sizes.chip.height).toBe(20);
    expect(sizes.chipLook).toBe(20);
  });

  test("Whole-site history's file rows and ⋯ keep today's sizes", async ({ page, baseURL }) => {
    await open(page, baseURL);
    const sizes = await historyFiles(page);
    expect(sizes.file.height).toBe(28);
    expect(sizes.more).toEqual({ width: 24, height: 24 });
  });
});
