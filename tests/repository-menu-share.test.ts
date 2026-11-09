import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium, type Page } from "@playwright/test";
import type { createRepositoryMenu } from "../src/components/repository-menu.ts";
import type { shareItems, ShareControlPort } from "../src/components/share-menu.ts";

// Share to edit in the project menu (slice 30, src/components/share-menu.ts `shareItems`, drawn on the menu's first open), in a browser page with a
// stub share port: hidden with nothing to share; "Link copied" on the item; a refused copy shows the link to copy by hand;
// a refused share says so for a moment (signed out: "Sign in to share"); the keyboard's focus stays while it starts;
// at most three guests by initial and a "+N".
type Port = ShareControlPort;
async function inBrowser(run: (page: Page) => Promise<void>) {
  const bundle = await build({
    stdin: { contents: "import { createRepositoryMenu } from './src/components/repository-menu'; import { shareItems } from './src/components/share-menu'; globalThis.menuFactory = createRepositoryMenu; globalThis.items = shareItems;", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", platform: "browser", loader: { ".css": "empty", ".svg": "text" },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    await page.clock.install();
    await page.addScriptTag({ content: "globalThis.__name = (fn) => fn;" + bundle.outputFiles[0].text });
    // A stub port the test drives from the page: `shareState`, `shareStart` (resolve or reject), `shareAvailable`.
    await page.evaluate(() => {
      type State = ReturnType<Port["state"]>;
      const scope = globalThis as typeof globalThis & { menuFactory: typeof createRepositoryMenu; items: typeof shareItems; share: Record<string, unknown> };
      const listeners = new Set<(state: State) => void>();
      const share = scope.share = {
        state: { sharing: false } as State,
        available: true,
        start: (): Promise<string | undefined> => Promise.resolve(undefined),
        set(state: State) { share.state = state; for (const listener of listeners) listener(state); },
      };
      const port: Port = {
        state: () => share.state, available: () => share.available, start: () => share.start(), stop: () => share.set({ sharing: false }),
        watch(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
      };
      const menu = scope.menuFactory({ installUrl: null, accounts: [], onReload() {}, onAccessChanged() {}, onSwitchAccount() {}, onSignOut() {}, share: { available: () => port.available(), draw: async (actionClass) => scope.items(port, actionClass) } });
      document.body.append(menu.root);
      menu.setRepository({ id: 1, name: "bakery", full_name: "lex/bakery", private: false, owner: { login: "lex", type: "User" } } as never);
      menu.open();
    });
    await run(page);
  } finally { await browser.close(); }
}
const item = (page: Page) => page.locator(".repository-menu__share-item");

test("a refused copy shows the link to copy by hand; a share refused when signed out says to sign in, then reads Share to edit again", () => inBrowser(async page => {
  await page.evaluate(() => {
    const share = (globalThis as never as { share: { start: () => Promise<string>; set(state: unknown): void } }).share;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } });
    share.start = async () => { share.set({ sharing: true, link: "https://editor.test/live?s=1#k=2", guests: [] }); return "https://editor.test/live?s=1#k=2"; };
  });
  await item(page).click();
  await page.locator(".repository-menu__share-link:focus").waitFor();
  assert.equal(await item(page).textContent(), "Copy the link below");
  assert.equal(await page.locator(".repository-menu__share-link").inputValue(), "https://editor.test/live?s=1#k=2");

  await page.evaluate(() => {
    const share = (globalThis as never as { share: { start: () => Promise<string>; set(state: unknown): void } }).share;
    share.set({ sharing: false });
    share.start = () => Promise.reject(Object.assign(new Error("Sign in again to join this live room."), { status: 401 }));
  });
  assert.equal(await item(page).textContent(), "Share to edit");
  await item(page).focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector(".repository-menu__share-item")?.textContent === "Sign in to share");
  assert.equal(await page.locator(".repository-menu__share-label").getAttribute("aria-live"), "polite");
  await page.clock.runFor(2600);
  assert.equal(await item(page).textContent(), "Share to edit");
  await page.evaluate(() => {
    (globalThis as never as { share: { start: () => Promise<string> } }).share.start = () => Promise.reject(new Error("offline"));
  });
  await item(page).click();
  await page.waitForFunction(() => document.querySelector(".repository-menu__share-item")?.textContent === "Couldn't share");
}));

test("while sharing starts the item keeps the keyboard's focus; guests show by initial, at most three and a +N; nothing to share hides it", () => inBrowser(async page => {
  await page.evaluate(() => {
    const share = (globalThis as never as { share: { start: () => Promise<string>; set(state: unknown): void } }).share;
    share.start = () => { share.set({ sharing: false, starting: true }); return new Promise(() => undefined); };
  });
  await item(page).focus();
  await page.keyboard.press("Enter");
  assert.equal(await item(page).textContent(), "Sharing…");
  assert.equal(await item(page).getAttribute("aria-disabled"), "true");
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("repository-menu__share-item")), true);

  await page.evaluate(() => {
    const guests = ["Anna", "Ben", "Cleo", "Dev", "Eli"].map((name, index) => ({ name, id: String(index).repeat(32) }));
    (globalThis as never as { share: { set(state: unknown): void } }).share.set({ sharing: true, link: "link", guests });
  });
  const chips = await page.locator(".repository-menu__people .person-chip").evaluateAll(items => items.map(chip => [chip.textContent, chip.getAttribute("aria-label")]));
  assert.deepEqual(chips, [["A", "Anna, a guest"], ["B", "Ben, a guest"], ["C", "Cleo, a guest"], ["+2", "and Dev, Eli, guests"]]);
  await page.evaluate(() => {
    const guests = ["Anna", "Ben", "Cleo", "Dev"].map((name, index) => ({ name, id: String(index).repeat(32), colour: String(index), peer: `p${index}` }));
    (globalThis as never as { share: { set(state: unknown): void } }).share.set({ sharing: true, link: "link", guests });
  });
  const four = await page.locator(".repository-menu__people .person-chip").evaluateAll(items => items.map(chip => [chip.textContent, chip.getAttribute("data-colour")]));
  assert.deepEqual(four, [["A", "0"], ["B", "1"], ["C", "2"], ["+1", null]], "exactly four guests: three and a +1, each in the colour Lex's tab gave them");

  await page.evaluate(() => {
    const share = (globalThis as never as { share: { available: boolean; set(state: unknown): void } }).share;
    share.available = false;
    share.set({ sharing: false });
  });
  assert.equal(await page.locator(".repository-menu__share").isHidden(), true);
}));
