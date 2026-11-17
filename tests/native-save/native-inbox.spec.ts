// The Inbox (site-quality slice 40, mock-up 05 v2; TOOLS-222): a tray button between History and Publish with an
// orange dot while something waits, its panel of items (what and where, a wave-off named for what it means, "All
// done" when empty), dots on the pages and pictures that have something waiting, and a row in the phone's Menu.
// Default fixture: the home page's hero picture has no alt text.
import { expect, test, type Page } from "@playwright/test";
import { openMedia } from "../support/scenarios";
import { effectiveSource } from "./drafts";

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const banner = (page: Page) => page.getByRole("banner");
const inboxButton = (page: Page) => banner(page).getByRole("button", { name: "Inbox", exact: true });
const inbox = (page: Page) => page.getByRole("dialog", { name: "Inbox", exact: true });
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar", exact: true });
const picture = (page: Page) => inbox(page).getByRole("button", { name: /^Picture without a description/ });
const dot = (page: Page, selector: string, pseudo = "::after") =>
  page.locator(selector).first().evaluate((el, which) => { const style = getComputedStyle(el, which); return style.content !== "none" && style.display !== "none" && style.scale !== "0"; }, pseudo);
// A Media tile's dot is painted on its top layer (inbox.css), sized to the tile only while its picture waits.
const tileDot = (page: Page, path: string) =>
  page.locator(`.media-library__card[data-path="${path}"]`).first().evaluate(el => getComputedStyle(el, "::after").backgroundSize !== "0px 0px" && getComputedStyle(el, "::after").backgroundImage.includes("gradient"));
const homeSource = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html") ?? "");

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero img")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the tray sits between History and Publish with a dot; its item goes to the picture, and a description clears it", async ({ page, baseURL }) => {
    await open(page, baseURL);
    const history = banner(page).getByRole("button", { name: "History", exact: true });
    const publish = banner(page).getByRole("button", { name: "Publish", exact: true });
    await expect(inboxButton(page)).toBeVisible();
    const [h, i, p] = [await history.boundingBox(), await inboxButton(page).boundingBox(), await publish.boundingBox()];
    expect(i!.x).toBeGreaterThan(h!.x + h!.width - 1);
    expect(p!.x).toBeGreaterThan(i!.x + i!.width - 1);
    expect(Math.round(i!.height)).toBe(28);
    // Something waits: the dot, never a number.
    await expect.poll(() => dot(page, "#inbox-button")).toBe(true);
    await expect(inboxButton(page)).toHaveText("");

    await inboxButton(page).click();
    await expect(inbox(page)).toBeVisible();
    await expect(inbox(page).getByRole("heading", { name: "Inbox" })).toBeVisible();
    await expect(picture(page)).toHaveText(/Picture without a description\s*Home page/);
    await expect(picture(page)).toHaveAccessibleName("Picture without a description, Home page");
    await expect(inbox(page).getByRole("button", { name: /^Decorative: Picture without a description/ })).toBeVisible();
    await expect(picture(page)).toBeFocused();
    // Escape closes it and gives the keyboard back to the tray.
    await page.keyboard.press("Escape");
    await expect(inbox(page)).toBeHidden();
    await expect(inboxButton(page)).toBeFocused();

    // The page with something waiting wears a dot in Pages.
    await page.locator("#explorer-toggle").click();
    await expect.poll(() => dot(page, '#explorer .pages-item[data-file="index.html"] > .pages-row .pages-icon')).toBe(true);
    await expect.poll(() => dot(page, '#explorer .pages-item[data-file="about/index.html"] > .pages-row .pages-icon')).toBe(false);
    // So does its picture on its Media tile, and only that one.
    await openMedia(page);
    await expect.poll(() => tileDot(page, "images/placeholder.svg")).toBe(true);
    expect(await page.locator('.media-library__card[data-path]:not([data-path="images/placeholder.svg"])').evaluateAll(cards => cards.some(card => getComputedStyle(card, "::after").backgroundSize !== "0px 0px"))).toBe(false);
    await page.keyboard.press("Escape");

    // The item opens its spot: the picture selected, the edit bar on its missing alt text.
    await inboxButton(page).click();
    await picture(page).click();
    await expect(inbox(page)).toBeHidden();
    await bar(page).getByRole("button", { name: "Alt text missing", exact: true }).click();
    await page.getByRole("textbox", { name: "Alt text", exact: true }).fill("A desk with a laptop");
    await page.keyboard.press("Enter");
    // Fixed: the item goes by itself, the dot with it.
    await expect.poll(() => dot(page, "#inbox-button")).toBe(false);
    await inboxButton(page).click();
    await expect(inbox(page)).toContainText("All done");
    await expect(picture(page)).toHaveCount(0);
  });

  test("Decorative marks the picture as Media does and stays after a reload", async ({ page, baseURL }) => {
    await open(page, baseURL);
    await expect.poll(() => dot(page, "#inbox-button")).toBe(true);
    await inboxButton(page).click();
    await inbox(page).getByRole("button", { name: /^Decorative: / }).click();
    await expect(picture(page)).toHaveCount(0);
    await expect(inbox(page)).toContainText("All done");
    // The last row gone, the keyboard stays in the panel, and Escape hands it back to the tray.
    await expect(inbox(page).getByRole("heading", { name: "Inbox" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(inboxButton(page)).toBeFocused();
    await expect.poll(() => dot(page, "#inbox-button")).toBe(false);
    await expect.poll(() => homeSource(page)).toMatch(/<img alt="" class="hero-image" src="\/images\/placeholder.svg"|<img class="hero-image" src="\/images\/placeholder.svg"[^>]*alt=""/);
    await page.reload();
    await expect(frame(page).locator(".hero img")).toBeVisible({ timeout: 30_000 });
    await inboxButton(page).click();
    await expect(inbox(page)).toContainText("All done");
    expect(await dot(page, "#inbox-button")).toBe(false);
  });

  test("after a Ctrl+click took the canvas to another page, an item still goes back to its own page's picture", async ({ page, baseURL }) => {
    await open(page, baseURL);
    await expect.poll(() => dot(page, "#inbox-button")).toBe(true);
    // The canvas follows the link alone: the open file stays Home.
    await frame(page).locator("site-header [data-key='nav-about']").click({ modifiers: ["ControlOrMeta"] });
    await expect(frame(page).locator(".hero img")).toHaveCount(0);
    await inboxButton(page).click();
    await picture(page).click();
    await expect(inbox(page)).toBeHidden();
    await expect(frame(page).locator(".hero img")).toBeVisible();
    await expect(bar(page).getByRole("button", { name: "Alt text missing", exact: true })).toBeVisible();
  });

  test("a page whose title is removed waits in the Inbox, and its item opens the page's details", async ({ page, baseURL }) => {
    await open(page, baseURL);
    await page.locator("#explorer-toggle").click();
    const about = page.locator("#explorer").getByRole("treeitem", { name: /About/ }).first();
    await about.focus();
    await about.press("F2");
    await about.getByRole("textbox").fill("");
    await page.keyboard.press("Enter");
    await expect(page.locator("#status")).toContainText("Removed the title");
    await expect.poll(() => dot(page, '#explorer .pages-item[data-file="about/index.html"] > .pages-row .pages-icon')).toBe(true);
    await page.keyboard.press("Escape");
    await inboxButton(page).click();
    const untitled = inbox(page).getByRole("button", { name: /^Page without a title/ });
    await expect(untitled).toHaveText(/Page without a title\s*\/about\//);
    await expect(untitled).toHaveAccessibleName("Page without a title, /about/");
    await untitled.click();
    await expect(page.getByRole("dialog", { name: "Page settings", exact: true })).toBeVisible();
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", "about/index.html");
  });
});

// TOOLS-253: the four new checks, a shared part's note, and the strip under each row. Seeded per browser session
// through the fake GitHub: the header gets a picture without a description (a shared part on Home and About), and
// Home a link with no name, a "click here" link, a skipped heading and a video without subtitles. No agent is
// connected here, so Fix with AI says so on itself (the suggestion flow runs with a fake agent in tests/inbox-fixes.test.ts).
const seedHome = (home: string) => home.replace(`<h2 data-key="filler-title">Scroll to verify</h2>`, `<h2 data-key="filler-title">Scroll to verify</h2>
    <h4 data-key="skipped">Opening hours</h4>
    <p data-key="more">See <a href="/about/" data-key="vague">click here</a> or <a href="/about/" data-key="arrow"><svg width="12" height="12"><path d="M2 6h8"/></svg></a>.</p>
    <video src="/images/fit.mp4" controls data-key="fit"></video>`);
async function seed(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/`);
  const commit = async (path: string, content: string) => expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).status()).toBe(204);
  const read = async (path: string) => (await page.request.get(`${baseURL}/__demo/file?path=${path}`)).text();
  await commit("components/site-header/site-header.html", (await read("components/site-header/site-header.html")).replace(`<a class="brand" href="/" data-key="brand">Native Studio</a>`, `<img class="logo" src="/images/placeholder.svg" width="24" height="24" data-key="logo"><a class="brand" href="/" data-key="brand">Native Studio</a>`));
  await commit("index.html", seedHome(await read("index.html")));
  await open(page, baseURL);
}
const row = (page: Page, what: RegExp) => inbox(page).getByRole("listitem").filter({ has: page.getByRole("button", { name: what }) });

test.describe("new checks (TOOLS-253)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("each new kind is listed once with its strip; a shared part's row says how many pages it changes; no agent shows on the buttons", async ({ page, baseURL }) => {
    await seed(page, baseURL);
    await inboxButton(page).click();
    await expect(inbox(page).getByRole("button", { name: /^Link without a name, Home page$/ })).toBeVisible();
    await expect(inbox(page).getByRole("button", { name: /^Link that only says “click here”, Home page$/ })).toBeVisible();
    await expect(inbox(page).getByRole("button", { name: /^Heading skips a level, Home page$/ })).toBeVisible();
    await expect(inbox(page).getByRole("button", { name: /^Video without subtitles, Home page$/ })).toBeVisible();
    const shared = inbox(page).getByRole("button", { name: "Picture without a description, Site header · changes 2 pages" });
    await expect(shared).toHaveText(/Picture without a description\s*Site header · changes 2 pages/);
    // Fix with AI on the pictures and links, saying on itself that no agent is connected; the manual fixes stay.
    await expect(row(page, /^Link without a name/).getByRole("button", { name: /^Fix with AI: no agent connected/ })).toHaveAttribute("aria-disabled", "true");
    await expect(inbox(page).getByRole("button", { name: /^Fix with AI: no agent connected/ })).toHaveCount(4);
    await expect(inbox(page).getByRole("button", { name: "Fix all with AI: no agent connected" })).toHaveAttribute("aria-disabled", "true");
    await expect(row(page, /^Heading skips a level/).getByRole("button", { name: /^Use H3/ })).toBeVisible();
    await expect(row(page, /^Heading skips a level/).getByRole("button", { name: /Fix with AI/ })).toHaveCount(0);
    await expect(row(page, /^Video without subtitles/).getByRole("button", { name: /^No speech/ })).toBeVisible();
    await expect(row(page, /^Video without subtitles/).getByRole("button", { name: /Fix with AI/ })).toHaveCount(0);
    await expect(row(page, /^Picture without a description, Site header/).getByRole("button", { name: /^Decorative/ })).toBeVisible();
  });

  test("Use H3 and No speech fix their rows from the Inbox, as one Undo step each", async ({ page, baseURL }) => {
    await seed(page, baseURL);
    await inboxButton(page).click();
    await row(page, /^Heading skips a level/).getByRole("button", { name: /^Use H3/ }).click();
    await expect(inbox(page).getByRole("button", { name: /^Heading skips a level/ })).toHaveCount(0);
    await expect.poll(() => homeSource(page)).toContain(`<h3 data-key="skipped">Opening hours</h3>`);
    // One Undo puts the heading back and its row waits again.
    await banner(page).getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => homeSource(page)).toContain(`<h4 data-key="skipped">Opening hours</h4>`);
    await inboxButton(page).click();
    await expect(row(page, /^Heading skips a level/).getByRole("button", { name: /^Use H3/ })).toBeVisible();
    await row(page, /^Video without subtitles/).getByRole("button", { name: /^No speech/ }).click();
    await expect(inbox(page).getByRole("button", { name: /^Video without subtitles/ })).toHaveCount(0);
    await expect.poll(() => homeSource(page)).toContain(`<video src="/images/fit.mp4" controls data-key="fit" data-no-speech="">`);
  });

  test("a shared part's row opens the part where it stands, says it changes every page that uses it, and selects the picture", async ({ page, baseURL }) => {
    await seed(page, baseURL);
    await inboxButton(page).click();
    await inbox(page).getByRole("button", { name: "Picture without a description, Site header · changes 2 pages" }).click();
    await expect(inbox(page)).toBeHidden();
    await expect(page.getByRole("button", { name: /^Note: Site header is a shared part\. A change here shows on all 2 pages that use it\./ })).toBeVisible({ timeout: 15_000 });
    await expect(bar(page).getByRole("button", { name: "Alt text missing", exact: true })).toBeVisible();
  });

  test("Decorative on a shared part's picture marks it in the part, for every page that uses it", async ({ page, baseURL }) => {
    await seed(page, baseURL);
    await inboxButton(page).click();
    await row(page, /^Picture without a description, Site header/).getByRole("button", { name: /^Decorative/ }).click();
    await expect(inbox(page).getByRole("button", { name: /^Picture without a description, Site header/ })).toHaveCount(0);
    await expect.poll(() => effectiveSource(page, baseURL, "components/site-header/site-header.html")).toContain(`alt=""`);
  });

  test("a part inside another part opens through it; its item's pages wear the Pages dot", async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/`);
    const commit = async (path: string, content: string) => expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).status()).toBe(204);
    const header = await (await page.request.get(`${baseURL}/__demo/file?path=components/site-header/site-header.html`)).text();
    await commit("components/site-mark/site-mark.html", `<img class="mark" src="/images/placeholder.svg" width="24" height="24" data-key="mark">\n`);
    await commit("components/site-header/site-header.html", header.replace(`<a class="brand"`, `<site-mark data-key="site-mark"></site-mark><a class="brand"`));
    await open(page, baseURL);
    await page.locator("#explorer-toggle").click();
    await expect.poll(() => dot(page, '#explorer .pages-item[data-file="about/index.html"] > .pages-row .pages-icon')).toBe(true);
    await page.keyboard.press("Escape");
    await inboxButton(page).click();
    await inbox(page).getByRole("button", { name: "Picture without a description, Site mark · changes 2 pages" }).click();
    await expect(page.getByRole("button", { name: /^Note: Site mark, inside Site header, is a shared part\. A change here shows on all 2 pages that use it\./ })).toBeVisible({ timeout: 15_000 });
    await expect(bar(page).getByRole("button", { name: "Alt text missing", exact: true })).toBeVisible();
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", "components/site-mark/site-mark.html");
  });

  test("an item's row goes to its spot: the unnamed link selected, its Name field asking for one", async ({ page, baseURL }) => {
    await seed(page, baseURL);
    await inboxButton(page).click();
    await inbox(page).getByRole("button", { name: /^Link without a name/ }).click();
    await expect(inbox(page)).toBeHidden();
    await expect(bar(page).getByRole("button", { name: "Needs a name", exact: true })).toBeVisible();
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("the Inbox leaves the bar for the Menu: the Menu wears the dot and its Inbox row opens the panel", async ({ page, baseURL }) => {
    await open(page, baseURL);
    await expect(inboxButton(page)).toBeHidden();
    const menu = banner(page).getByRole("button", { name: "Menu", exact: true });
    await expect.poll(() => dot(page, "#topbar-menu")).toBe(true);
    await menu.click();
    const sheet = page.getByRole("dialog", { name: "Menu", exact: true });
    const row = sheet.getByRole("button", { name: "Inbox", exact: true });
    await expect(row).toBeVisible();
    expect(await dot(page, '.top-bar-menu__row[data-row="inbox"] .top-bar-menu__label')).toBe(true);
    await row.click();
    await expect(sheet).toBeHidden();
    await expect(inbox(page)).toBeVisible();
    await expect(picture(page)).toBeVisible();
    // Touch targets of 44 px (U6).
    expect((await inbox(page).getByRole("button", { name: /^Decorative: / }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await picture(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const box = (await inbox(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  });

  test("the new rows' strips fit the phone's panel, with 44 px actions (TOOLS-253)", async ({ page, baseURL }) => {
    await seed(page, baseURL);
    await banner(page).getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("dialog", { name: "Menu", exact: true }).getByRole("button", { name: "Inbox", exact: true }).click();
    await expect(inbox(page)).toBeVisible();
    const box = (await inbox(page).boundingBox())!;
    for (const action of await inbox(page).locator(".inbox__act").all()) {
      const at = (await action.boundingBox())!;
      expect(at.height).toBeGreaterThanOrEqual(44);
      expect(at.x + at.width).toBeLessThanOrEqual(box.x + box.width);
    }
    expect(await inbox(page).evaluate(panel => panel.scrollWidth <= panel.clientWidth)).toBe(true);
  });
});
