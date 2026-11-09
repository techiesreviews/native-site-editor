import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium, type Page } from "@playwright/test";
import type { createRepositoryMenu, PreviewMenuPort } from "../src/components/repository-menu.ts";
import type { previewItems } from "../src/components/preview-menu.ts";
import type { PreviewState } from "../src/preview-control.ts";

// Share preview in the project menu (slice 35, src/components/preview-menu.ts `previewItems`), in a browser page with a
// stub port: nothing of it is drawn or loaded on an editor without a preview Worker; refusals say so on the item and go
// after COPIED_MS; each label has its own moment, so a refused turn-off never keeps "Copied".
type Scope = typeof globalThis & {
  menuFactory: typeof createRepositoryMenu; items: typeof previewItems;
  preview: { state: PreviewState; available: boolean; draws: number; start(): Promise<string | undefined>; stop(): Promise<void>; set(state: PreviewState): void };
};
async function inBrowser(run: (page: Page) => Promise<void>) {
  const bundle = await build({
    stdin: { contents: "import { createRepositoryMenu } from './src/components/repository-menu'; import { previewItems } from './src/components/preview-menu'; globalThis.menuFactory = createRepositoryMenu; globalThis.items = previewItems;", resolveDir: process.cwd() },
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
      const listeners = new Set<(state: PreviewState) => void>();
      const preview = scope.preview = {
        state: { on: false } as PreviewState, available: false, draws: 0,
        start: (): Promise<string | undefined> => Promise.resolve(undefined), stop: (): Promise<void> => Promise.resolve(),
        set(state: PreviewState) { preview.state = state; for (const listener of listeners) listener(state); },
      };
      const port: PreviewMenuPort = {
        state: () => preview.state, available: () => preview.available, start: () => preview.start(), stop: () => preview.stop(),
        watch(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
        draw: async (actionClass, root) => { preview.draws++; return scope.items(port, actionClass, root); },
      };
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.resolve() } });
      const menu = scope.menuFactory({ installUrl: null, accounts: [], onReload() {}, onAccessChanged() {}, onSwitchAccount() {}, onSignOut() {}, preview: port });
      document.body.append(menu.root);
      menu.setRepository({ id: 1, name: "bakery", full_name: "lex/bakery", private: false, owner: { login: "lex", type: "User" } } as never);
      Object.assign(scope, { menu });
    });
    await run(page);
  } finally { await browser.close(); }
}
const open = (page: Page) => page.evaluate(() => (globalThis as never as { menu: { open(): void } }).menu.open());
const shareItem = (page: Page) => page.locator(".repository-menu__preview > .repository-menu__preview-item").first();
const draws = (page: Page) => page.evaluate(() => (globalThis as Scope).preview.draws);

test("without a preview Worker (or a site) the menu draws nothing of Share preview and loads nothing for it", () => inBrowser(async page => {
  await open(page);
  assert.equal(await draws(page), 0);
  assert.equal(await page.locator(".repository-menu__preview").isHidden(), true);
  assert.equal(await page.getByRole("button", { name: "Share preview" }).count(), 0);
  // Once available, the next open draws it, once.
  await page.evaluate(() => { (globalThis as Scope).preview.available = true; (globalThis as never as { menu: { close(): void } }).menu.close(); });
  await open(page);
  await page.getByRole("button", { name: "Share preview", exact: true }).waitFor();
  await page.evaluate(() => (globalThis as never as { menu: { close(): void } }).menu.close());
  await open(page);
  assert.equal(await draws(page), 1);
}));

test("refusals say why on the item and go after a moment; a refused turn-off leaves Copied to go back by itself", () => inBrowser(async page => {
  await page.evaluate(() => { (globalThis as Scope).preview.available = true; });
  await open(page);
  await shareItem(page).waitFor();
  const refuse = (status: number) => page.evaluate((status) => {
    (globalThis as Scope).preview.start = () => Promise.reject(Object.assign(new Error("no"), { status }));
  }, status);
  await refuse(401);
  await shareItem(page).click();
  await page.waitForFunction(() => document.querySelector(".repository-menu__preview-item")?.textContent === "Sign in to share");
  await page.clock.runFor(2600);
  assert.equal(await shareItem(page).textContent(), "Share preview");
  await refuse(500);
  await shareItem(page).click();
  await page.waitForFunction(() => document.querySelector(".repository-menu__preview-item")?.textContent === "Couldn't share preview");
  await page.clock.runFor(2600);
  assert.equal(await shareItem(page).textContent(), "Share preview");

  // On: Copy says Copied; a turn-off refused a moment later says so on its own item, and both go back on their own.
  await page.evaluate(() => {
    const preview = (globalThis as Scope).preview;
    preview.set({ on: true, link: "https://previews.example/s/bakery-x/#k=y", ends: Date.UTC(2026, 11, 9) });
    preview.stop = () => Promise.reject(new Error("offline"));
  });
  const copy = page.locator(".repository-menu__preview-copy");
  const off = page.getByRole("button", { name: "Turn preview off", exact: true });
  await copy.click();
  await page.waitForFunction(() => document.querySelector(".repository-menu__preview-copy")?.textContent === "Copied");
  await page.clock.runFor(1000);
  await off.click();
  await page.waitForFunction(() => [...document.querySelectorAll(".repository-menu__preview-item")].some((item) => item.textContent === "Couldn't turn off"));
  await page.clock.runFor(1600);
  assert.equal(await copy.textContent(), "Copy", "Copied went back at its own time");
  assert.equal(await page.getByRole("button", { name: "Couldn't turn off" }).count(), 1);
  await page.clock.runFor(1000);
  assert.equal(await page.getByRole("button", { name: "Turn preview off", exact: true }).count(), 1);
}));
