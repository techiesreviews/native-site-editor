import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium, type Page } from "@playwright/test";
import type { createRepositoryMenu } from "../src/components/repository-menu.ts";
import type { editTile, shareItems, ShareControlPort } from "../src/components/share-menu.ts";
import type { ShareState } from "../src/share-control.ts";

// Edit together in the project menu (ticket 58, src/components/share-menu.ts on src/components/share-row.ts), drawn on
// the menu's first open, in a browser page with a stub session control: one row whose dot and label are the state,
// pressed to start (and copy) a link or to stop; who joined named on the row with their initials at its end, at most
// three and a "+N"; the project tile's dot; a load that fails is tried again on the next open.
type Scope = typeof globalThis & {
  menuFactory: typeof createRepositoryMenu; items: typeof shareItems; tile: typeof editTile;
  share: { state: ShareState; available: boolean; copies: string[]; start(): Promise<string | undefined>; set(state: ShareState): void };
  menu: ReturnType<typeof createRepositoryMenu>;
};
const guests = (...names: string[]) => names.map((name, index) => ({ name, id: String(index).repeat(32), colour: String(index % 4), peer: `p${index}` }));

async function inBrowser(run: (page: Page) => Promise<void>) {
  const bundle = await build({
    stdin: { contents: "import { createRepositoryMenu } from './src/components/repository-menu'; import { shareItems, editTile } from './src/components/share-menu'; globalThis.menuFactory = createRepositoryMenu; globalThis.items = shareItems; globalThis.tile = editTile;", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", platform: "browser", loader: { ".css": "empty", ".svg": "text" },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    await page.clock.install();
    await page.addScriptTag({ content: "globalThis.__name = (fn) => fn;" + bundle.outputFiles[0].text });
    await page.evaluate(() => {
      const scope = globalThis as Scope;
      const listeners = new Set<(state: ShareState) => void>();
      const share = scope.share = {
        state: { sharing: false } as ShareState, available: true, copies: [] as string[],
        start: (): Promise<string | undefined> => Promise.resolve(undefined),
        set(state: ShareState) { share.state = state; for (const listener of [...listeners]) listener(state); },
      };
      const port: ShareControlPort = {
        state: () => share.state, available: () => share.available, start: () => share.start(), stop: () => share.set({ sharing: false }),
        watch(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
      };
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: (text: string) => { share.copies.push(text); return Promise.resolve(); } } });
      let trigger: HTMLElement | undefined;
      const mark = scope.tile(port, () => trigger);
      scope.menu = scope.menuFactory({
        installUrl: null, accounts: [], onReload() {}, onAccessChanged() {}, onSwitchAccount() {}, onSignOut() {},
        share: { offered: () => true, draw: async (actionClass, root) => scope.items(port, actionClass, root), tile(element) { trigger = element; mark(); } },
      });
      document.body.append(scope.menu.root);
      scope.menu.setRepository({ id: 1, name: "bakery", full_name: "lex/bakery", private: false, owner: { login: "lex", type: "User" } } as never);
      scope.menu.open();
    });
    await run(page);
  } finally { await browser.close(); }
}
const main = (page: Page) => page.locator(".link-row__main");
const set = (page: Page, state: ShareState) => page.evaluate((state) => (globalThis as Scope).share.set(state), state);
const shown = (page: Page) => page.evaluate(() => {
  const host = document.querySelector<HTMLElement>(".link-row")!;
  const button = host.querySelector(".link-row__main")!;
  return { label: button.querySelector(".link-row__label")!.textContent, dot: host.dataset.dot, disabled: button.getAttribute("aria-disabled") === "true" };
});
const LINK = "https://editor.test/live?s=1#k=2";

test("Edit together: press starts and copies a link, waits for a collaborator, names who joined, reconnects, and a press stops", () => inBrowser(async page => {
  await main(page).waitFor();
  assert.deepEqual(await shown(page), { label: "Edit together", dot: "idle", disabled: false });
  await page.evaluate(() => {
    const share = (globalThis as Scope).share;
    share.start = () => { share.set({ sharing: false, starting: true }); return new Promise((resolve) => { (globalThis as never as { open(): void }).open = () => { share.set({ sharing: true, link: "https://editor.test/live?s=1#k=2", guests: [] }); resolve("https://editor.test/live?s=1#k=2"); }; }); };
  });
  await main(page).focus();
  await page.keyboard.press("Space");
  assert.deepEqual(await shown(page), { label: "Making a link…", dot: "busy", disabled: true });
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("link-row__main")), true, "the keyboard's focus stays");
  await page.evaluate(() => (globalThis as never as { open(): void }).open());
  await page.waitForFunction(() => document.querySelector(".link-row__label")?.textContent === "Link copied");
  assert.deepEqual(await page.evaluate(() => (globalThis as Scope).share.copies), [LINK]);
  await page.clock.runFor(2600);
  assert.deepEqual(await shown(page), { label: "Waiting for collaborator", dot: "wait", disabled: false });

  await set(page, { sharing: true, link: LINK, guests: guests("Anna") });
  assert.deepEqual(await shown(page), { label: "Editing with Anna", dot: "on", disabled: false });
  assert.deepEqual(await page.locator(".link-row__end .person-chip").allTextContents(), ["A"]);
  await set(page, { sharing: true, link: LINK, guests: guests("Anna", "Ben", "Cleo", "Dev", "Eli") });
  assert.equal((await shown(page)).label, "Editing with Anna, Ben, Cleo, Dev, Eli");
  const chips = await page.locator(".link-row__end .person-chip").evaluateAll(items => items.map(chip => [chip.textContent, chip.getAttribute("data-colour")]));
  assert.deepEqual(chips, [["A", "0"], ["B", "1"], ["C", "2"], ["+2", null]]);
  await set(page, { sharing: true, link: LINK, guests: guests("Anna", "Ben", "Cleo", "Dev") });
  assert.deepEqual(await page.locator(".link-row__end .person-chip").allTextContents(), ["A", "B", "C", "+1"], "exactly four guests: three and a +1");
  await set(page, { sharing: true, link: LINK, guests: [], reconnecting: true });
  assert.deepEqual(await shown(page), { label: "Reconnecting…", dot: "busy", disabled: false });
  assert.equal(await page.locator(".link-row__end").isHidden(), true);

  // The copy icon copies the link again; pressing the row stops (it does not copy).
  await set(page, { sharing: true, link: LINK, guests: guests("Anna") });
  await page.getByRole("button", { name: "Copy link" }).click({ force: true });
  await page.waitForFunction(() => document.querySelector(".link-row__label")?.textContent === "Link copied");
  assert.equal(await page.evaluate(() => (globalThis as Scope).share.copies.length), 2);
  await main(page).click();
  assert.deepEqual(await shown(page), { label: "Edit together", dot: "idle", disabled: false });
  assert.equal(await page.evaluate(() => (globalThis as Scope).share.copies.length), 2);
}));

test("a start that fails turns the dot red until the next press (signed out: Sign in to share); no site dims the row", () => inBrowser(async page => {
  await main(page).waitFor();
  await page.evaluate(() => { (globalThis as Scope).share.start = () => Promise.reject(Object.assign(new Error("Sign in again."), { status: 401 })); });
  await main(page).click();
  await page.waitForFunction(() => document.querySelector(".link-row__label")?.textContent === "Sign in to share");
  assert.equal((await shown(page)).dot, "bad");
  await page.evaluate(() => { (globalThis as Scope).share.start = () => Promise.reject(new Error("offline")); });
  await main(page).click();
  await page.waitForFunction(() => document.querySelector(".link-row__label")?.textContent === "Couldn't make a link · try again");
  await page.clock.runFor(5000);
  assert.deepEqual(await shown(page), { label: "Couldn't make a link · try again", dot: "bad", disabled: false });
  await page.evaluate(() => { const share = (globalThis as Scope).share; share.available = false; share.set({ sharing: false }); });
  assert.deepEqual(await shown(page), { label: "Edit together", dot: "idle", disabled: true });
}));

test("the project tile shows a dot while sharing, green once someone joined, and none once it stops", () => inBrowser(async page => {
  const dot = () => page.locator(".repository-menu__trigger").getAttribute("data-shared");
  assert.equal(await dot(), null);
  await set(page, { sharing: true, link: LINK, guests: [] });
  assert.equal(await dot(), "wait");
  await set(page, { sharing: true, link: LINK, guests: guests("Anna") });
  assert.equal(await dot(), "on");
  await set(page, { sharing: false });
  assert.equal(await dot(), null);
}));

test("Edit together's row that fails to load once loads on the next open of the menu", () => inBrowser(async page => {
  const drawn = await page.evaluate(async () => {
    const scope = globalThis as Scope;
    const port: ShareControlPort = { state: () => ({ sharing: false }), available: () => true, start: async () => undefined, stop() {}, watch: () => () => undefined };
    let tries = 0;
    const menu = scope.menuFactory({ installUrl: null, accounts: [], onReload() {}, onAccessChanged() {}, onSwitchAccount() {}, onSignOut() {},
      share: { offered: () => true, tile() {}, draw: async (actionClass, root) => { if (++tries === 1) throw new Error("chunk failed"); return scope.items(port, actionClass, root); } } });
    const holder = document.createElement("div");
    holder.append(menu.root);
    document.body.append(holder);
    menu.setRepository({ id: 2, name: "cafe", full_name: "lex/cafe", private: false, owner: { login: "lex", type: "User" } } as never);
    menu.open();
    for (let wait = 0; wait < 5; wait++) await Promise.resolve();
    menu.close();
    menu.open();
    for (let wait = 0; wait < 5; wait++) await Promise.resolve();
    return { tries, item: holder.querySelector(".link-row__label")?.textContent };
  });
  assert.deepEqual(drawn, { tries: 2, item: "Edit together" });
}));

test("the share rows sit under their own 'Share' title, as the menu's other groups do, with no line above them", () => inBrowser(async page => {
  const group = page.locator(".repository-menu__shares");
  await group.locator(".link-row__main").first().waitFor();
  assert.equal(await group.locator(".repository-menu__heading").textContent(), "Share");
  const lines = await group.evaluate((element) => [element, ...element.querySelectorAll(".link-rows")].map((node) => getComputedStyle(node).borderTopWidth));
  assert.ok(lines.every((width) => width === "0px"), `no line above the rows: ${lines.join(", ")}`);
}));

test("an ad blocker's annoyances list leaves the share rows alone (it hides any `.share-row`)", () => inBrowser(async page => {
  // Fanboy's Social and Annoyance lists (uBlock Origin's Annoyances, Brave and others) carry `##.share-row`: an element
  // with that class is hidden. Lex's menu showed the Share title with no rows under it (2026-11-10).
  await page.addStyleTag({ content: ".share-row { display: none !important; }" });
  const row = page.getByRole("button", { name: "Edit together", exact: true });
  await row.waitFor({ state: "attached" });
  assert.equal(await row.isVisible(), true, "Edit together shows under an ad blocker's rule");
}));
