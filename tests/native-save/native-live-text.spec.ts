import { expect, test, type Browser, type Page } from "@playwright/test";
import { openEditor } from "../support/scenarios";
import { clickOnText } from "./click-text";

// The open file's shared copy (ticket am-21, ADR 0003): two browsers signed in
// to the same repository and branch, each with its own drafts, share the page
// they both have open through its live room (the real Worker route and relay
// rooms, src/live-text.ts over src/live-room.ts). Live sharing is off by default
// (the Tuesday pack decides); these browsers switch it on. Default fixture group.
const pageErrors: string[] = [];
const file = "index.html";

const source = (page: Page) => page.evaluate(async (path) => (await import("/src/components/source-editor.ts")).getMountedSource(path) ?? "", file);
/** Inserts `text` after the first `after` in the open page, as the editor's own edits do. */
const insert = (page: Page, after: string, text: string) => page.evaluate(async ({ path, after, text }) => {
  const editor = await import("/src/components/source-editor.ts");
  const now = editor.getMountedSource(path)!;
  const at = now.indexOf(after) + after.length;
  editor.replaceActiveRange({ path, start: at, end: at, expected: "", text });
}, { path: file, after, text });
const count = (text: string, part: string) => text.split(part).length - 1;

async function browserTab(browser: Browser, sharing = true) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  // The dev server loads hundreds of modules: room in the resource list to see the lazy chunks arrive.
  await context.addInitScript(() => { if (window === window.top) performance.setResourceTimingBufferSize(10_000); });
  if (sharing) await context.addInitScript(() => { if (window === window.top) localStorage.setItem("native-site-editor:live-sharing", "on"); });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return { context, page };
}

test.beforeEach(() => { pageErrors.length = 0; });
test.afterEach(() => { expect(pageErrors).toEqual([]); });

test("two people editing one page end identical, and a late joiner catches up", async ({ browser, baseURL }) => {
  const anna = await browserTab(browser), lex = await browserTab(browser);
  const tabs = [anna, lex];
  try {
    await openEditor(anna.page, baseURL);
    await openEditor(lex.page, baseURL);
    // Each one's edit reaches the other's page: in the source and in the preview.
    await insert(anna.page, '<h1 data-key="hero-title">', "Fresh bread: ");
    await expect.poll(() => source(lex.page), { timeout: 20_000 }).toContain("Fresh bread: A native browser preview");
    await insert(lex.page, "Edit plain HTML", ", together,");
    await expect.poll(() => source(anna.page)).toContain("Edit plain HTML, together,");
    await expect(lex.page.frameLocator(".native-preview-frame").locator("h1")).toHaveText("Fresh bread: A native browser preview");
    await expect(anna.page.frameLocator(".native-preview-frame").locator("p.lead")).toContainText("Edit plain HTML, together,");
    expect(await source(anna.page)).toBe(await source(lex.page));

    // Sam opens the page later: the copy comes from the two who are online (nothing is stored on the server).
    const sam = await browserTab(browser);
    tabs.push(sam);
    await openEditor(sam.page, baseURL);
    await expect.poll(() => source(sam.page), { timeout: 20_000 }).toBe(await source(anna.page));
    await expect(sam.page.frameLocator(".native-preview-frame").locator("h1")).toHaveText("Fresh bread: A native browser preview");
    // Its own edit reaches both.
    await insert(sam.page, "Fresh bread: ", "warm ");
    for (const other of [anna, lex]) await expect.poll(() => source(other.page)).toContain("Fresh bread: warm A native");

    // Anna reloads while Lex types: she comes back from the copy this browser kept (IndexedDB), so nothing she shared goes in twice.
    await anna.page.reload();
    await insert(lex.page, "Fresh bread: warm ", "and fresh ");
    await expect(anna.page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
    await expect.poll(() => source(anna.page), { timeout: 20_000 }).toContain("Fresh bread: warm and fresh A native");
    await expect.poll(() => source(lex.page)).toBe(await source(anna.page));
    const after = await source(anna.page);
    for (const part of ["Fresh bread: ", "warm ", "and fresh ", ", together,"]) expect(count(after, part), part).toBe(1);
  } finally {
    for (const tab of tabs) await tab.context.close();
  }
});

test("two people opening a page nobody has open, at once, do not double its text", async ({ browser, baseURL }) => {
  const anna = await browserTab(browser), lex = await browserTab(browser);
  try {
    await Promise.all([openEditor(anna.page, baseURL, "about/index.html"), openEditor(lex.page, baseURL, "about/index.html")]);
    const sourceOf = (page: Page) => page.evaluate(async () => (await import("/src/components/source-editor.ts")).getMountedSource("about/index.html") ?? "");
    const original = await sourceOf(anna.page);
    const heading = /<h1[^>]*>/.exec(original)![0];
    await anna.page.evaluate(async (heading) => {
      const editor = await import("/src/components/source-editor.ts");
      const now = editor.getMountedSource("about/index.html")!;
      const at = now.indexOf(heading) + heading.length;
      editor.replaceActiveRange({ path: "about/index.html", start: at, end: at, expected: "", text: "Hello: " });
    }, heading);
    await expect.poll(() => sourceOf(lex.page), { timeout: 20_000 }).toContain(`${heading}Hello: `);
    const shared = await sourceOf(lex.page);
    expect(shared).toBe(await sourceOf(anna.page));
    expect(count(shared, heading)).toBe(count(original, heading));
    expect(shared.length).toBe(original.length + "Hello: ".length);
  } finally {
    await anna.context.close();
    await lex.context.close();
  }
});

test("a joiner whose only other tab leaves before answering goes on from its own changes, and a later joiner gets them", async ({ browser, baseURL }) => {
  const anna = await browserTab(browser), lex = await browserTab(browser);
  const tabs = [anna, lex];
  try {
    // Anna's answers never reach the room: her binary frames are dropped once Lex is coming.
    let dropping = false;
    await anna.page.routeWebSocket(/\/api\/live\/room/, ws => {
      const server = ws.connectToServer();
      ws.onMessage(message => { if (!dropping || typeof message === "string") server.send(message); });
      server.onMessage(message => ws.send(message));
    });
    await openEditor(anna.page, baseURL);
    dropping = true;
    await openEditor(lex.page, baseURL);
    await expect.poll(() => lex.page.evaluate(() => performance.getEntriesByType("resource").some(entry => /yjs/.test(entry.name))), { timeout: 20_000 }).toBe(true);
    // Lex types while still waiting to be caught up; then Anna closes her page without having answered.
    await insert(lex.page, '<h1 data-key="hero-title">', "Waiting: ");
    expect(await source(anna.page)).not.toContain("Waiting: ");
    await anna.context.close();
    tabs.shift();
    // Sam opens the page: the copy comes from Lex, with what he typed.
    const sam = await browserTab(browser);
    tabs.push(sam);
    await openEditor(sam.page, baseURL);
    await expect.poll(() => source(sam.page), { timeout: 20_000 }).toContain("Waiting: A native browser preview");
    expect(await source(sam.page)).toBe(await source(lex.page));
    expect(count(await source(sam.page), "Waiting: ")).toBe(1);
  } finally {
    for (const tab of tabs) await tab.context.close();
  }
});

test("with live sharing switched off (the default), a page opens no room socket", async ({ browser, baseURL }) => {
  const anna = await browserTab(browser, false);
  try {
    const sockets: string[] = [];
    anna.page.on("websocket", socket => sockets.push(socket.url()));
    await openEditor(anna.page, baseURL);
    // The shared copy's module loads after the first paint and stops there.
    await expect.poll(() => anna.page.evaluate(() => performance.getEntriesByType("resource").some(entry => /live-text/.test(entry.name))), { timeout: 20_000 }).toBe(true);
    await insert(anna.page, '<h1 data-key="hero-title">', "Alone: ");
    expect(sockets.filter(url => url.includes("/api/live/room"))).toEqual([]);
  } finally {
    await anna.context.close();
  }
});

test("Lex's Undo takes back only his words, on the page and in the code pane, and Anna's change no longer clears it", async ({ browser, baseURL }) => {
  const anna = await browserTab(browser), lex = await browserTab(browser);
  try {
    await openEditor(anna.page, baseURL);
    await openEditor(lex.page, baseURL);
    // On the page: Lex types into the heading, then Anna changes the lead paragraph.
    const heading = lex.page.frameLocator(".native-preview-frame").locator(".hero h1");
    await clickOnText(heading);
    await expect(heading).toHaveAttribute("contenteditable", /.+/);
    await lex.page.keyboard.press("Home");
    await lex.page.keyboard.type("Lex ");
    await lex.page.keyboard.press("Escape");
    await expect.poll(() => source(anna.page), { timeout: 20_000 }).toContain(">Lex A native browser preview");
    await insert(anna.page, "Edit plain HTML", " with Anna");
    await expect.poll(() => source(lex.page), { timeout: 20_000 }).toContain("Edit plain HTML with Anna");
    await lex.page.getByRole("banner").getByRole("button", { name: "Undo", exact: true }).click();
    for (const tab of [lex, anna]) {
      await expect.poll(() => source(tab.page), { timeout: 20_000 }).not.toContain("Lex A native");
      expect(await source(tab.page)).toContain("Edit plain HTML with Anna");
    }
    await expect(anna.page.frameLocator(".native-preview-frame").locator(".hero h1")).toHaveText("A native browser preview");

    // In the code pane: Lex types at the end, Anna changes the lead again, and Lex's Ctrl+Z takes back only his.
    await lex.page.getByRole("region", { name: "Source editor" }).first().getByRole("textbox", { name: "File source" }).focus();
    await lex.page.keyboard.press("ControlOrMeta+End");
    await lex.page.keyboard.type("<!-- Lex -->");
    await expect.poll(() => source(anna.page), { timeout: 20_000 }).toContain("<!-- Lex -->");
    await insert(anna.page, "Edit plain HTML with Anna", " again");
    await expect.poll(() => source(lex.page), { timeout: 20_000 }).toContain("with Anna again");
    await lex.page.keyboard.press("ControlOrMeta+z");
    for (const tab of [lex, anna]) {
      await expect.poll(() => source(tab.page), { timeout: 20_000 }).not.toContain("<!-- Lex -->");
      expect(await source(tab.page)).toContain("Edit plain HTML with Anna again");
    }
    // Redo puts his words back where they were, on both.
    await lex.page.keyboard.press("ControlOrMeta+Shift+z");
    await expect.poll(() => source(anna.page), { timeout: 20_000 }).toContain("<!-- Lex -->");
    expect(await source(lex.page)).toBe(await source(anna.page));
    expect(count(await source(anna.page), "with Anna again")).toBe(1);
  } finally {
    await anna.context.close();
    await lex.context.close();
  }
});
