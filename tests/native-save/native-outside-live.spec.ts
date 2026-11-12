import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { openEditor } from "../support/scenarios";
import { pushDelivery } from "./fake-webhook";
import { publishButton } from "./publish";

// Outside changes into a page typed on together (ticket am-59): Anna and Lex have the page open in a live room, each
// in a browser of their own (their own drafts), on one GitHub. A commit Sam makes on GitHub enters the room's one copy
// once, whichever tab takes it first: both pages show Sam's words once next to everyone's typing, with no reload.
// The fake GitHub keeps one repository per signed-in session (server.ts), so Lex's browser signs in as Anna's session:
// both see the same commits, as two people on one real repository do.
const file = "index.html";
const pageErrors: string[] = [];

const source = (page: Page) => page.evaluate(async (path) => (await import("/src/components/source-editor.ts")).getMountedSource(path) ?? "", file);
/** Inserts `text` after the first `after` in the open page, as the editor's own edits do. */
const insert = (page: Page, after: string, text: string) => page.evaluate(async ({ path, after, text }) => {
  const editor = await import("/src/components/source-editor.ts");
  const now = editor.getMountedSource(path)!;
  const at = now.indexOf(after) + after.length;
  editor.replaceActiveRange({ path, start: at, end: at, expected: "", text });
}, { path: file, after, text });
const count = (text: string, part: string) => text.split(part).length - 1;
/** Marks the workspace's content: a reload of the branch replaces it. */
const markContent = (page: Page) => page.locator("#content > *").first().evaluate((el) => el.setAttribute("data-fold-mark", ""));
const stillMarked = (page: Page) => expect(page.locator("#content > [data-fold-mark]")).toHaveCount(1);

async function browserTab(browser: Browser, signedInAs?: BrowserContext) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  if (signedInAs) await context.addCookies(await signedInAs.cookies());
  await context.addInitScript(() => { if (window === window.top) localStorage.setItem("native-site-editor:live-sharing", "on"); });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return { context, page };
}
async function head(page: Page, baseURL: string | undefined) {
  return ((await (await page.request.get(`${baseURL}/__demo/head`)).json()) as { commit: string }).commit;
}
/** Sam commits `content` on GitHub; the push is delivered until the room heard it, and every tab shows the commit. */
async function samPushes(pages: Page[], baseURL: string | undefined, content: string) {
  const [page] = pages;
  expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: file, content, author: "Sam" } })).status()).toBe(204);
  const commit = await head(page, baseURL);
  await expect.poll(async () => {
    const response = await page.request.post(`${baseURL}/api/github/webhook`, pushDelivery(commit));
    expect(response.status()).toBe(200);
    return ((await response.json()) as { told: number }).told;
  }, { timeout: 15_000 }).toBeGreaterThan(0);
  for (const each of pages) await expect(each.locator("#revision")).toHaveText(commit.slice(0, 7), { timeout: 20_000 });
  return commit;
}

test.beforeEach(() => { pageErrors.length = 0; });
test.afterEach(() => { expect(pageErrors).toEqual([]); });

test("a commit on GitHub enters the page Anna and Lex type on together once, in both tabs, with no reload", async ({ browser, baseURL }) => {
  const anna = await browserTab(browser);
  const tabs = [anna];
  try {
    await openEditor(anna.page, baseURL);
    const lex = await browserTab(browser, anna.context);
    tabs.push(lex);
    await openEditor(lex.page, baseURL);
    await insert(anna.page, '<h1 data-key="hero-title">', "Fresh bread: ");
    await expect.poll(() => source(lex.page), { timeout: 20_000 }).toContain("Fresh bread: A native browser preview");
    await markContent(anna.page);
    await markContent(lex.page);

    // Sam changes another line on GitHub, from the text GitHub has (without the room's unsaved words).
    const github = ((await (await anna.page.request.get(`${baseURL}/__demo/file?path=${file}`)).text()));
    expect(github).toContain("Edit plain HTML");
    await samPushes([anna.page, lex.page], baseURL, github.replace("Edit plain HTML", "Edit plain HTML with Sam"));
    for (const tab of [anna, lex]) await expect.poll(() => source(tab.page), { timeout: 20_000 }).toContain("Edit plain HTML with Sam");
    // Lex types while it lands: his words, Anna's and Sam's each once, the same in both tabs.
    await insert(lex.page, "Fresh bread: ", "warm ");
    await expect.poll(() => source(anna.page), { timeout: 20_000 }).toContain("Fresh bread: warm A native");
    await expect.poll(() => source(lex.page)).toBe(await source(anna.page));
    const after = await source(anna.page);
    for (const part of ["Fresh bread: ", "warm ", "with Sam"]) expect(count(after, part), part).toBe(1);
    await expect(lex.page.frameLocator(".native-preview-frame").locator("p.lead")).toContainText("Edit plain HTML with Sam");
    // Folded in place: neither tab loaded the branch again.
    await stillMarked(anna.page);
    await stillMarked(lex.page);
  } finally {
    for (const tab of tabs) await tab.context.close();
  }
});

test("Publish right after Lex reloads waits until his page caught up with the room, says so on the button, and the save is the room's own", async ({ browser, baseURL }) => {
  const anna = await browserTab(browser);
  const tabs = [anna];
  try {
    await openEditor(anna.page, baseURL);
    const lex = await browserTab(browser, anna.context);
    tabs.push(lex);
    // Lex's room socket: the others' frames (catch-up answers, typing) are held while `holding`, as a slow catch-up after
    // a reload; who is in the room still comes through.
    let holding = false;
    const held: (() => void)[] = [];
    let routed = 0, asked = 0;
    await lex.context.routeWebSocket(/\/api\/live\/room/, ws => {
      routed++;
      const server = ws.connectToServer();
      ws.onMessage(message => { if (holding && typeof message !== "string") asked++; server.send(message); });
      server.onMessage(message => { if (holding && typeof message !== "string") held.push(() => ws.send(message)); else ws.send(message); });
    });
    await openEditor(lex.page, baseURL);
    await insert(anna.page, '<h1 data-key="hero-title">', "Fresh bread: ");
    await expect.poll(() => source(lex.page), { timeout: 20_000 }).toContain("Fresh bread: A native browser preview");
    await insert(lex.page, "Fresh bread: ", "warm ");
    await expect.poll(() => source(anna.page), { timeout: 20_000 }).toContain("Fresh bread: warm A native");
    await markContent(anna.page);

    // Lex reloads; the room has not caught his page up yet when he presses Publish.
    holding = true;
    await lex.page.reload();
    await expect(lex.page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
    // His page has joined the room again (live text loads a beat after the first paint) and sent it frames (its request
    // to be caught up among them).
    await expect.poll(() => routed, { timeout: 20_000 }).toBe(2);
    await expect.poll(() => asked, { timeout: 20_000 }).toBeGreaterThan(0);
    await expect.poll(() => source(lex.page), { timeout: 20_000 }).toContain("Fresh bread: warm A native");
    const before = await head(lex.page, baseURL);
    let sentWhileHeld = 0;
    lex.page.on("request", request => { if (holding && request.url().includes("/api/publish")) sentWhileHeld++; });
    await publishButton(lex.page).click();
    const trigger = lex.page.locator(".publish-menu__trigger");
    await expect(trigger).toHaveText("Catching up…", { timeout: 2_000 });
    await expect(trigger).toBeDisabled();
    // Released well within the wait (about 5 s): the save goes out once the page caught up, not when the wait ran out.
    holding = false;
    for (const send of held.splice(0)) send();
    await expect(trigger).not.toHaveText("Catching up…", { timeout: 2_000 });
    await expect(lex.page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
    expect(sentWhileHeld, "nothing sent while the catch-up was held").toBe(0);
    const saved = await head(lex.page, baseURL);
    expect(saved).not.toBe(before);
    // Anna hears the save: the room's own text, so the words stay once, the same in both tabs, with no reload.
    await expect.poll(async () => (await anna.page.request.post(`${baseURL}/api/github/webhook`, pushDelivery(saved))).status()).toBe(200);
    await expect(anna.page.locator("#revision")).toHaveText(saved.slice(0, 7), { timeout: 20_000 });
    await expect.poll(() => source(lex.page)).toBe(await source(anna.page));
    const after = await source(anna.page);
    for (const part of ["Fresh bread: ", "warm "]) expect(count(after, part), part).toBe(1);
    await stillMarked(anna.page);
  } finally {
    for (const tab of tabs) await tab.context.close();
  }
});

test("Anna's tab takes Sam's commit while Lex's tab hears nothing from the room; Lex types meanwhile; released, the words are once in both, with no reload", async ({ browser, baseURL }) => {
  const anna = await browserTab(browser);
  const tabs = [anna];
  try {
    await openEditor(anna.page, baseURL);
    const lex = await browserTab(browser, anna.context);
    tabs.push(lex);
    // Lex's room socket: the room's frames to him are held while `holding` (who is here and push notices still come).
    let holding = false;
    const held: (() => void)[] = [];
    await lex.context.routeWebSocket(/\/api\/live\/room/, ws => {
      const server = ws.connectToServer();
      ws.onMessage(message => server.send(message));
      server.onMessage(message => { if (holding && typeof message !== "string") held.push(() => ws.send(message)); else ws.send(message); });
    });
    await openEditor(lex.page, baseURL);
    await insert(anna.page, '<h1 data-key="hero-title">', "Fresh bread: ");
    await expect.poll(() => source(lex.page), { timeout: 20_000 }).toContain("Fresh bread: A native browser preview");
    await markContent(anna.page);
    await markContent(lex.page);

    holding = true;
    const github = await (await anna.page.request.get(`${baseURL}/__demo/file?path=${file}`)).text();
    await samPushes([anna.page, lex.page], baseURL, github.replace("Edit plain HTML", "Edit plain HTML with Sam"));
    // Each tab took the commit on its own: Lex's from GitHub, as Anna's frames have not reached him.
    for (const tab of [anna, lex]) await expect.poll(() => source(tab.page), { timeout: 20_000 }).toContain("Edit plain HTML with Sam");
    await insert(lex.page, "Fresh bread: ", "warm ");
    await insert(anna.page, "with Sam", " daily");
    holding = false;
    for (const send of held.splice(0)) send();
    await expect.poll(() => source(lex.page), { timeout: 20_000 }).toContain("with Sam daily");
    await expect.poll(() => source(anna.page), { timeout: 20_000 }).toContain("Fresh bread: warm A native");
    await expect.poll(() => source(lex.page)).toBe(await source(anna.page));
    const after = await source(anna.page);
    for (const part of ["Fresh bread: ", "warm ", "with Sam", " daily"]) expect(count(after, part), part).toBe(1);
    await stillMarked(anna.page);
    await stillMarked(lex.page);
  } finally {
    for (const tab of tabs) await tab.context.close();
  }
});
