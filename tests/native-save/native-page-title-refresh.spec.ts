import { expect, test, type Page } from "@playwright/test";

// The unchanged routing fixture's Fern page is read by the post-paint text index.
const fernSha = "6495540c3bd630735784d86969aab911a84fe352";
const explorer = (page: Page) => page.locator("#explorer");
const item = (page: Page, name: string) => explorer(page).getByRole("treeitem", { name, exact: true });

async function holdPageTitles(page: Page) {
  let release!: () => void;
  let held!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const requested = new Promise<void>(resolve => { held = resolve; });
  const matches = (url: string) => new URL(url).searchParams.get("shas")?.split(",").includes(fernSha) ?? false;
  await page.route(/\/api\/files\?/, async route => {
    if (!matches(route.request().url())) { await route.continue(); return; }
    const response = await route.fetch();
    held();
    await gate;
    await route.fulfill({ response });
  });
  return {
    requested,
    async release() {
      const received = page.waitForResponse(response => matches(response.url()));
      release();
      const response = await received;
      expect((await response.json()).files[fernSha]).toContain("<title>Fern &amp; Kettle</title>");
      // Let the application consume the completed response and run its render work.
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    },
  };
}

async function openRouting(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=530&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await expect(page.locator("#status")).toContainText("Up to date with main");
  if (!await explorer(page).isVisible()) await page.locator("#explorer-toggle").click();
  await explorer(page).getByRole("tab", { name: "Pages", exact: true }).click();
  await item(page, "Work").focus();
  await page.keyboard.press("ArrowRight");
  await expect(item(page, "Work")).toHaveAttribute("aria-expanded", "true");
  await expect(item(page, "Fern and kettle")).toBeVisible();
}

async function expectRefreshed(page: Page) {
  await expect(item(page, "Fern & Kettle")).toBeVisible();
  await expect(item(page, "Notes")).toBeFocused();
  await expect(explorer(page)).toBeVisible();
}

test("titles arriving during a row menu preserve its focus and refresh after Escape", async ({ page, baseURL }) => {
  const titles = await holdPageTitles(page);
  await openRouting(page, baseURL);
  await item(page, "Notes").focus();
  await page.keyboard.press("Shift+F10");
  const menu = page.getByRole("menu", { name: "Actions for Notes", exact: true });
  await expect(menu).toBeVisible();
  const first = menu.getByRole("menuitem").first();
  await expect(first).toBeFocused();
  await titles.requested;
  await titles.release();
  await expect(menu).toBeVisible();
  await expect(first).toBeFocused();
  await expect(item(page, "Fern and kettle")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expectRefreshed(page);
});

test("titles arriving during Rename keep the draft input and refresh after cancellation", async ({ page, baseURL }) => {
  const titles = await holdPageTitles(page);
  await openRouting(page, baseURL);
  await item(page, "Notes").focus();
  await page.keyboard.press("F2");
  const title = explorer(page).getByRole("textbox", { name: "Title of Notes", exact: true });
  await title.fill("Notes in progress");
  await titles.requested;
  await titles.release();
  await expect(title).toBeFocused();
  await expect(title).toHaveValue("Notes in progress");
  await expect(item(page, "Fern and kettle")).toBeVisible();
  await title.press("Escape");
  await expect(title).toHaveCount(0);
  await expectRefreshed(page);
});

test("titles arriving during URL editing keep the typed URL and refresh after cancellation", async ({ page, baseURL }) => {
  const titles = await holdPageTitles(page);
  await openRouting(page, baseURL);
  await explorer(page).getByRole("button", { name: "Change the URL of Notes, /work/notes.html", exact: true }).click();
  const url = explorer(page).getByRole("textbox", { name: "URL of Notes", exact: true });
  await url.fill("/work/notes-in-progress.html");
  await titles.requested;
  await titles.release();
  await expect(url).toBeFocused();
  await expect(url).toHaveValue("/work/notes-in-progress.html");
  await expect(item(page, "Fern and kettle")).toBeVisible();
  await url.press("Escape");
  await expect(url).toHaveCount(0);
  await expectRefreshed(page);
});

test("titles arriving during a new subpage keep its typed title and refresh after Escape", async ({ page, baseURL }) => {
  const titles = await holdPageTitles(page);
  await openRouting(page, baseURL);
  await item(page, "Fern and kettle").hover();
  await explorer(page).getByRole("button", { name: "Add subpage to Fern and kettle", exact: true }).click();
  const title = explorer(page).getByRole("textbox", { name: "New subpage of Fern and kettle, title", exact: true });
  await title.fill("Draft in progress");
  await titles.requested;
  await titles.release();
  await expect(title).toBeFocused();
  await expect(title).toHaveValue("Draft in progress");
  await expect(item(page, "Fern and kettle")).toBeVisible();
  await title.press("Escape");
  await expect(title).toHaveCount(0);
  await expect(item(page, "Fern & Kettle")).toBeVisible();
  await expect(item(page, "Fern & Kettle")).toBeFocused();
  await expect(explorer(page)).toBeVisible();
});
