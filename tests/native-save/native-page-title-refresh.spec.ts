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

async function pointerClick(page: Page, target: ReturnType<Page["locator"]>) {
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  // Drain pointerdown/blur microtasks before pointerup, reproducing a real gesture.
  await page.evaluate(() => Promise.resolve());
  await page.mouse.up();
}

for (const action of ["open page", "add subpage", "change URL"] as const) {
  test(`pending titles preserve the pointer click that closes a row menu: ${action}`, async ({ page, baseURL }) => {
    const titles = await holdPageTitles(page);
    await openRouting(page, baseURL);
    await item(page, "Notes").focus();
    await page.keyboard.press("Shift+F10");
    await titles.requested;
    await titles.release();
    await expect(item(page, "Fern and kettle")).toBeVisible();
    if (action === "open page") {
      await pointerClick(page, item(page, "Fern and kettle").locator(".pages-label"));
      await expect(page.locator("#current-page")).toHaveAttribute("data-path", "work/fern-and-kettle/index.html");
      // Opening a page closes Pages & files; inspect its refreshed tree after reopening.
      await page.locator("#explorer-toggle").click();
      await expect(item(page, "Fern & Kettle")).toBeVisible();
    } else {
      const button = explorer(page).getByRole("button", { name: action === "add subpage" ? "Add subpage to Fern and kettle" : "Change the URL of Fern and kettle, /work/fern-and-kettle/", exact: true });
      await pointerClick(page, button);
      const input = explorer(page).getByRole("textbox", { name: action === "add subpage" ? "New subpage of Fern and kettle, title" : "URL of Fern and kettle", exact: true });
      await expect(input).toBeFocused();
      await input.press("Escape");
      await expect(item(page, "Fern & Kettle")).toBeVisible();
    }
  });
}

test("pending titles preserve the pointer click that blurs an unchanged Rename", async ({ page, baseURL }) => {
  const titles = await holdPageTitles(page);
  await openRouting(page, baseURL);
  await item(page, "Notes").focus();
  await page.keyboard.press("F2");
  await titles.requested;
  await titles.release();
  await expect(explorer(page).getByRole("textbox", { name: "Title of Notes", exact: true })).toBeFocused();
  await pointerClick(page, item(page, "Fern and kettle").locator(".pages-label"));
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "work/fern-and-kettle/index.html");
  // Opening a page closes Pages & files; inspect its refreshed tree after reopening.
  await page.locator("#explorer-toggle").click();
  await expect(item(page, "Fern & Kettle")).toBeVisible();
});

test("a primary pointer release without click flushes titles, but another pointer cannot release it", async ({ page, baseURL }) => {
  const titles = await holdPageTitles(page);
  await openRouting(page, baseURL);
  await titles.requested;
  await explorer(page).dispatchEvent("pointerdown", { pointerId: 71, pointerType: "mouse", button: 0, bubbles: true });
  await titles.release();
  await expect(item(page, "Fern and kettle")).toBeVisible();
  await explorer(page).dispatchEvent("pointerup", { pointerId: 72, pointerType: "mouse", button: 0, bubbles: true });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(item(page, "Fern and kettle")).toBeVisible();
  // Scrollbar and cancelled gestures can release without a subsequent click.
  await explorer(page).dispatchEvent("pointerup", { pointerId: 71, pointerType: "mouse", button: 0, bubbles: true });
  await expect(item(page, "Fern & Kettle")).toBeVisible();
});

test("titles arriving during a native page drag preserve the source row and its drop", async ({ page, baseURL }) => {
  const titles = await holdPageTitles(page);
  await openRouting(page, baseURL);
  const source = item(page, "Notes").locator(".pages-row");
  const original = await source.elementHandle();
  const box = (await source.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 55, box.y + box.height / 2, { steps: 5 });
  await expect(source).toHaveClass(/is-dragging/);
  await titles.requested;
  await titles.release();
  await expect(source).toHaveClass(/is-dragging/);
  expect(await original!.evaluate(element => element.isConnected)).toBe(true);
  await expect(item(page, "Fern and kettle")).toBeVisible();
  const target = (await item(page, "Home").locator(".pages-row").boundingBox())!;
  await page.mouse.move(target.x + 40, target.y + target.height / 2, { steps: 5 });
  await page.mouse.up();
  const confirmation = page.getByRole("dialog", { name: "Move Notes to /notes.html?", exact: true });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Move", exact: true }).click();
  await expect(page.locator("#status")).toContainText("URL changed to /notes.html");
  await expect(item(page, "Fern & Kettle")).toBeVisible();
});


for (const pointerType of ["touch", "pen"] as const) {
  test(`a delayed ${pointerType} click keeps the pending-title target until its action runs`, async ({ page, baseURL }) => {
    const titles = await holdPageTitles(page);
    await openRouting(page, baseURL);
    const button = explorer(page).getByRole("button", { name: "Change the URL of Fern and kettle, /work/fern-and-kettle/", exact: true });
    const original = await button.elementHandle();
    await titles.requested;
    await button.dispatchEvent("pointerdown", { pointerId: 81, pointerType, button: 0, bubbles: true });
    await titles.release();
    await button.dispatchEvent("pointerup", { pointerId: 81, pointerType, button: 0, bubbles: true });
    // Model the browser's delayed tap/pen click in a later input task.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await original!.evaluate(element => element.isConnected)).toBe(true);
    await expect(item(page, "Fern and kettle")).toBeVisible();
    await original!.evaluate((element, type) => element.dispatchEvent(new PointerEvent("click", { pointerId: 81, pointerType: type, button: 0, bubbles: true })), pointerType);
    const input = explorer(page).getByRole("textbox", { name: "URL of Fern and kettle", exact: true });
    await expect(input).toBeFocused();
    await input.press("Escape");
    await expect(item(page, "Fern & Kettle")).toBeVisible();
  });
}
