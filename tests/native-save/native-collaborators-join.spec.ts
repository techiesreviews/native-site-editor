import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { openEditor } from "../support/scenarios";
import { clickOnText } from "./click-text";
import { editorMounted } from "./drafts";

// GitHub collaborators join automatically (ticket am-31): two people signed in to GitHub under their own names, the demo
// account's owner and anna-collab, a collaborator on its repository, open the same site and branch. Neither switches
// anything on or shares a link: live sharing is on by default, so each sees the other's caret on the page and the
// other's typing. Anna's project menu lists the owner's repository as one she cannot take the editor's access from.
// Default fixture group: the real Worker route, relay and live rooms.
const pageErrors: string[] = [];
const OWNER = "native-demo-user", COLLABORATOR = "anna-collab";

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const source = (page: Page) => page.evaluate(async () => (await import("/src/components/source-editor.ts")).getMountedSource("index.html") ?? "");
/** A caret's tag drawn on the page, by the name it shows. */
const pageFlag = (page: Page, name: string) => page.locator(`.live-carets-page .live-caret__flag[aria-label="${name}"]`);
const words = (locator: Locator) => locator.textContent().then(text => text?.replace(/\s+/g, " ").trim());

/** A browser signed in as `login`: the fake GitHub's own account by default, or a collaborator on its repositories. */
async function person(browser: Browser, baseURL: string, login?: string) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  if (login) await context.addCookies([{ name: "ase_demo_login", value: login, url: baseURL }]);
  const page = await context.newPage();
  page.on("pageerror", error => pageErrors.push(error.message));
  return { context, page };
}

/** Starts typing in `target` on the page, the caret at its text's end or start. */
async function typeIn(page: Page, target: Locator, at: "End" | "Home") {
  await clickOnText(target);
  await expect(target).toHaveAttribute("contenteditable", /.+/);
  await page.keyboard.press(`Control+${at}`);
}

test.beforeEach(() => { pageErrors.length = 0; });
test.afterEach(() => { expect(pageErrors).toEqual([]); });

test("two people signed in to GitHub on the same repository and branch see each other's carets and typing with no link", async ({ browser, baseURL }) => {
  const lex = await person(browser, baseURL!), anna = await person(browser, baseURL!, COLLABORATOR);
  try {
    for (const tab of [lex, anna]) {
      await openEditor(tab.page, baseURL);
      await editorMounted(tab.page);
    }
    // Each is signed in as themselves, not shared through a link.
    for (const [tab, login] of [[lex, OWNER], [anna, COLLABORATOR]] as const)
      expect(await tab.page.evaluate(async () => (await (await fetch("/api/session")).json() as { user: { login: string } }).user.login)).toBe(login);
    expect(await anna.page.evaluate(() => localStorage.getItem("native-site-editor:live-sharing"))).toBeNull();

    const lead = (page: Page) => frame(page).locator(".hero .lead");
    const before = (await words(lead(lex.page))) ?? "";
    await expect.poll(() => words(lead(anna.page))).toBe(before);

    // Anna types at the paragraph's start; Lex sees her words letter by letter and her caret by her own GitHub name.
    const annaTyped = "Anna was here. ";
    await typeIn(anna.page, lead(anna.page), "Home");
    await anna.page.keyboard.type(annaTyped, { delay: 40 });
    await expect.poll(() => words(lead(lex.page)), { timeout: 20_000 }).toBe(`${annaTyped}${before}`.trim());
    const annaAtLex = pageFlag(lex.page, COLLABORATOR);
    await expect(annaAtLex).toBeVisible({ timeout: 20_000 });
    await expect(annaAtLex.locator(".live-caret__mark b")).toHaveText("A");

    // Lex types at its end; Anna sees his words and his caret.
    const lexTyped = " Lex adds this.";
    await typeIn(lex.page, lead(lex.page), "End");
    await lex.page.keyboard.type(lexTyped, { delay: 40 });
    const both = `${annaTyped}${before}${lexTyped}`.replace(/\s+/g, " ").trim();
    for (const tab of [lex, anna]) await expect.poll(() => words(lead(tab.page)), { timeout: 20_000 }).toBe(both);
    await expect(pageFlag(anna.page, OWNER)).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => await source(anna.page) === await source(lex.page), { timeout: 20_000 }).toBe(true);
    expect(await source(lex.page)).toContain(annaTyped.trim());

    // Anna's own menu: the owner's repository is open, and she has no Remove for it (only its owner controls access).
    await anna.page.locator(".repository-menu__trigger").click();
    const row = anna.page.locator(".repository-menu__item").filter({ has: anna.page.locator('.repository-menu__repo[aria-current="true"]') });
    await expect(row).toBeVisible();
    await expect(row.locator(".repository-menu__repo-owner")).toContainText(OWNER);
    await expect(row.locator(".repository-menu__remove")).toHaveCount(0);
  } finally {
    await lex.context.close();
    await anna.context.close();
  }
});
