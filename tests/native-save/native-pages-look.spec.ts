import { expect, test, type Page } from "@playwright/test";

// The Pages tab's look (media ticket 125, after Framer, Squarespace and Notion): a calm head with
// the page count, 32 px rows on desktop and 44 px on touch, the site's name left off titles,
// guide lines under open rows, URLs in one column, the current page marked, + and ⋯ on hover on
// desktop and only ⋯ on touch. Default fixture group (the frozen native starter).
test.beforeEach(({ page }) => page.setDefaultTimeout(15_000));

const explorer = (page: Page) => page.locator("#explorer");
const item = (page: Page, name: string) => explorer(page).getByRole("treeitem", { name: new RegExp(`^${name}( ·|$)`) });
const row = (page: Page, name: string) => item(page, name).locator(":scope > .pages-row");

/** The starter with a Journal and two posts, all titled "… · Studio", and a Notes folder with no page; Spring planting open. */
async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  const about = await (await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent("about/index.html")}`)).text();
  const titled = (title: string) => about.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
  for (const [path, title] of [["blog/index.html", "Journal · Studio"], ["blog/spring-planting/index.html", "Spring planting · Studio"],
    ["blog/winter-pruning/index.html", "Winter pruning · Studio"], ["notes/first/index.html", "First note"]] as const)
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content: titled(title) } })).ok()).toBe(true);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent("blog/spring-planting/index.html")}`);
  await page.reload();
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await page.locator("#explorer-toggle").click();
  await explorer(page).getByRole("tab", { name: "Pages", exact: true }).click();
  await expect(item(page, "Spring planting")).toBeVisible();
  // The titles arrive after first paint and redraw the rows; measure after that.
  await expect(item(page, "About this project")).toBeVisible();
}

const background = (page: Page, name: string) => row(page, name).evaluate(element => getComputedStyle(element).backgroundColor);

test("desktop: calm head, 32px rows, names without the site's name, guide lines, one URL column, the current page marked", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, baseURL);
  await expect(explorer(page).locator("#pages-heading")).toHaveText("Pages");
  await expect(explorer(page).locator(".pages-heading")).toHaveCSS("text-transform", "none");
  // Home, About, Journal, its two posts and the first note: six pages.
  await expect(explorer(page).locator(".pages-total")).toHaveText("6");
  await expect(explorer(page).getByRole("tree", { name: "Pages", exact: true })).toBeVisible();

  for (const name of ["Home", "Journal", "Spring planting", "Notes"])
    expect((await row(page, name).boundingBox())!.height).toBe(32);

  // The shared " · Studio" is left off the row; the tree item keeps the full title for screen readers.
  await expect(row(page, "Spring planting").locator(".pages-label")).toHaveText("Spring planting");
  await expect(item(page, "Spring planting")).toHaveAttribute("aria-label", "Spring planting · Studio");
  // A URL with pages but no page of its own: a folder row, muted.
  await expect(row(page, "Notes")).toHaveClass(/pages-row--empty/);

  // The open page: selected, tinted, bold.
  await expect(item(page, "Spring planting")).toHaveAttribute("aria-selected", "true");
  await expect(row(page, "Spring planting")).toHaveClass(/is-current/);
  await expect(row(page, "Spring planting")).toHaveCSS("font-weight", "600");
  expect(await background(page, "Spring planting")).not.toBe(await background(page, "Winter pruning"));

  // A guide line under Journal's chevron runs down its posts.
  const group = item(page, "Journal").locator(":scope > [role='group']");
  await expect(group).toHaveCSS("background-image", /linear-gradient/);
  const chevron = (await row(page, "Journal").locator(".pages-twisty").boundingBox())!;
  const line = await group.evaluate(element => element.getBoundingClientRect().left + parseFloat(getComputedStyle(element).backgroundPositionX));
  expect(Math.abs(line - (chevron.x + chevron.width / 2))).toBeLessThanOrEqual(1.5);

  // URLs start in one column, whatever the nesting, after the title.
  const starts = await Promise.all(["Home", "Journal", "Spring planting"].map(async name => (await row(page, name).locator(".pages-url").boundingBox())!.x));
  expect(Math.max(...starts) - Math.min(...starts)).toBeLessThanOrEqual(1);
  const title = (await row(page, "Spring planting").locator(".pages-label").boundingBox())!;
  expect(starts[0]).toBeGreaterThan(title.x + title.width);

  // + and ⋯ rest hidden, and show on hover with a gentle tint.
  const add = row(page, "Journal").getByRole("button", { name: /^Add subpage to Journal/ });
  const more = row(page, "Journal").getByRole("button", { name: /^Actions for Journal/ });
  await page.mouse.move(5, 5);
  await expect(add).toHaveCSS("opacity", "0");
  const rest = await background(page, "Journal");
  await row(page, "Journal").locator(".pages-label").hover();
  await expect(add).toHaveCSS("opacity", "1");
  await expect(more).toHaveCSS("opacity", "1");
  expect(await background(page, "Journal")).not.toBe(rest);
  await more.click();
  await expect(page.getByRole("menuitem", { name: "Change URL…" })).toBeVisible();
});

test.describe("touch", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test("44px rows with names only and one ⋯ at the end; Add subpage and Change URL from ⋯", async ({ page, baseURL }) => {
    await open(page, baseURL);
    for (const name of ["Home", "Journal", "Spring planting"]) {
      const box = (await row(page, name).boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      await expect(row(page, name).locator(".pages-url")).toBeHidden();
      await expect(row(page, name).locator(".pages-add")).toBeHidden();
      const more = (await row(page, name).locator(".pages-more").boundingBox())!;
      expect(more.width).toBeGreaterThanOrEqual(44);
      expect(box.x + box.width - (more.x + more.width)).toBeLessThanOrEqual(8);
    }
    await expect(explorer(page).getByRole("button", { name: "+ New page" })).toHaveCSS("min-height", "44px");

    await row(page, "Journal").getByRole("button", { name: /^Actions for Journal/ }).tap();
    await page.getByRole("menuitem", { name: "Add subpage" }).tap();
    await expect(explorer(page).getByRole("textbox", { name: /^New subpage of Journal/ })).toBeFocused();
    await page.keyboard.press("Escape");

    await row(page, "Winter pruning").getByRole("button", { name: /^Actions for Winter pruning/ }).tap();
    await page.getByRole("menuitem", { name: "Change URL…" }).tap();
    await expect(explorer(page).getByRole("textbox", { name: /^URL of Winter pruning/ })).toHaveValue("/blog/winter-pruning/");
  });
});

test.describe("touch tablet", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 768, height: 1024 } });
  test("a wide touch list keeps one URL column, clear of the ⋯ at the row's end", async ({ page, baseURL }) => {
    await open(page, baseURL);
    const starts: number[] = [];
    for (const name of ["Home", "Journal", "Spring planting", "Winter pruning"]) {
      expect((await row(page, name).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      const url = (await row(page, name).locator(".pages-url").boundingBox())!;
      const more = (await row(page, name).locator(".pages-more").boundingBox())!;
      const box = (await row(page, name).boundingBox())!;
      starts.push(url.x);
      expect(url.x + url.width).toBeLessThanOrEqual(more.x + 0.5);
      expect(box.x + box.width - (more.x + more.width)).toBeLessThanOrEqual(8);
      await expect(row(page, name).locator(".pages-add")).toBeHidden();
    }
    expect(Math.max(...starts) - Math.min(...starts)).toBeLessThanOrEqual(1);
  });
});

test("in the URL column only the URL's text changes the URL; the rest of the row opens the page", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await open(page, baseURL);
  const url = (await row(page, "Winter pruning").locator(".pages-url").boundingBox())!;
  const box = (await row(page, "Winter pruning").boundingBox())!;
  await page.mouse.click(url.x + url.width + 24, box.y + box.height / 2);
  await expect(page.locator("#explorer-toggle")).toContainText("Winter pruning");
  await expect(explorer(page).locator(".pages-url-change")).toHaveCount(0);
});
