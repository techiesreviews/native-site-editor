import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium, type BrowserContextOptions, type Page } from "@playwright/test";
import type { createRepositoryMenu } from "../src/components/repository-menu.ts";
import type { previewItems, previewTile } from "../src/components/preview-menu.ts";
import type { PreviewState } from "../src/preview-control.ts";

// Preview link in the project menu (ticket 58, src/components/preview-menu.ts on src/components/share-row.ts), in a
// browser page with the real stylesheet and a stub preview control: one row whose dot and label are the state, pressed
// to make (and copy) a link or to turn it off; a copy icon over the row's end while it is on; the project tile's dot.
type Scope = typeof globalThis & {
  menuFactory: typeof createRepositoryMenu; items: typeof previewItems; tile: typeof previewTile;
  preview: {
    state: PreviewState; available: boolean; offered: boolean; draws: number; copies: string[];
    start(): Promise<string | undefined>; stop(): Promise<void>; set(state: PreviewState): void;
  };
  menu: ReturnType<typeof createRepositoryMenu>;
};
const LINK = "https://previews.example/s/bakery-x/#k=y";
const on = (more: Partial<Extract<PreviewState, { on: true }>> = {}): PreviewState => ({ on: true, link: LINK, ends: Date.UTC(2026, 11, 9), watching: 0, ...more });

async function inBrowser(run: (page: Page) => Promise<void>, context: BrowserContextOptions = {}) {
  const bundle = await build({
    stdin: { contents: "import './src/theme.css'; import './src/style.css'; import { createRepositoryMenu } from './src/components/repository-menu'; import { previewItems, previewTile } from './src/components/preview-menu'; globalThis.menuFactory = createRepositoryMenu; globalThis.items = previewItems; globalThis.tile = previewTile;", resolveDir: process.cwd(), loader: "ts" },
    bundle: true, write: false, format: "iife", platform: "browser", outdir: "out", loader: { ".svg": "text", ".woff2": "empty", ".png": "empty" },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await (await browser.newContext({ reducedMotion: "reduce", ...context })).newPage();
    page.setDefaultTimeout(5000);
    await page.clock.install();
    await page.setContent("<!doctype html><html><body></body></html>");
    for (const file of bundle.outputFiles) {
      if (file.path.endsWith(".css")) await page.addStyleTag({ content: file.text });
      else await page.addScriptTag({ content: "globalThis.__name = (fn) => fn;" + file.text });
    }
    await page.evaluate(() => {
      const scope = globalThis as Scope;
      const listeners = new Set<(state: PreviewState) => void>();
      const preview = scope.preview = {
        state: { on: false } as PreviewState, available: true, offered: true, draws: 0, copies: [] as string[],
        start: (): Promise<string | undefined> => Promise.resolve(undefined), stop: (): Promise<void> => Promise.resolve(),
        set(state: PreviewState) { preview.state = state; for (const listener of [...listeners]) listener(state); },
      };
      const control = {
        state: () => preview.state, available: () => preview.available, start: () => preview.start(), stop: () => preview.stop(),
        watch(listener: (state: PreviewState) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
      };
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: (text: string) => { preview.copies.push(text); return Promise.resolve(); } } });
      let trigger: HTMLElement | undefined;
      const mark = scope.tile(control, () => trigger);
      scope.menu = scope.menuFactory({
        installUrl: null, accounts: [], onReload() {}, onAccessChanged() {}, onSwitchAccount() {}, onSignOut() {},
        preview: {
          offered: () => preview.offered,
          draw: async (actionClass, root) => { preview.draws++; return scope.items(control, actionClass, root); },
          tile(element) { trigger = element; mark(); },
        },
      });
      document.body.append(scope.menu.root);
      scope.menu.setRepository({ id: 1, name: "bakery", full_name: "lex/bakery", private: false, owner: { login: "lex", type: "User" } } as never);
    });
    await run(page);
  } finally { await browser.close(); }
}
const open = (page: Page) => page.evaluate(() => (globalThis as Scope).menu.open());
const set = (page: Page, state: PreviewState) => page.evaluate((state) => (globalThis as Scope).preview.set(state), state);
const row = (page: Page) => page.locator(".share-row");
const main = (page: Page) => page.locator(".share-row__main");
/** What the row shows: its label, its dot, whether it is pressable, and whether the copy icon is there. */
const shown = (page: Page) => page.evaluate(() => {
  const host = document.querySelector<HTMLElement>(".share-row")!;
  const button = host.querySelector(".share-row__main")!;
  return {
    label: button.querySelector(".share-row__label")!.textContent, dot: host.dataset.dot,
    disabled: button.getAttribute("aria-disabled") === "true", copy: !host.querySelector<HTMLElement>(".share-row__action")!.hidden,
  };
});
const iconOpacity = (page: Page) => page.locator(".share-row__action").evaluate((element) => getComputedStyle(element).opacity);

test("Preview link: press makes and copies a link, then waits, counts who watches, reconnects, and a press turns it off", () => inBrowser(async page => {
  await open(page);
  await main(page).waitFor();
  assert.deepEqual(await shown(page), { label: "Preview link", dot: "idle", disabled: false, copy: false });
  assert.equal(await page.getByRole("button", { name: "Preview link", exact: true }).count(), 1, "the idle row is named by its label");
  // No link field, Copy button, Stop button or explainer.
  assert.equal(await page.locator(".repository-menu__actions input, .repository-menu__actions small").count(), 0);

  let made!: (link: string) => void;
  await page.evaluate(() => {
    const preview = (globalThis as Scope).preview;
    preview.start = () => { preview.set({ on: false, starting: true }); return new Promise((resolve) => { (globalThis as never as { make(link: string): void }).make = (link) => resolve(link); }); };
  });
  made = (link) => void page.evaluate((link) => (globalThis as never as { make(link: string): void }).make(link), link);
  await main(page).focus();
  await page.keyboard.press("Enter");
  assert.deepEqual(await shown(page), { label: "Making a link…", dot: "busy", disabled: true, copy: false });
  // Not pressable while making: a second press does nothing, and the keyboard's focus stays on the row.
  await main(page).click({ force: true });
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("share-row__main")), true);

  await set(page, on());
  made(LINK);
  await page.waitForFunction(() => document.querySelector(".share-row__label")?.textContent === "Link copied");
  assert.deepEqual(await page.evaluate(() => (globalThis as Scope).preview.copies), [LINK]);
  await page.clock.runFor(2600);
  assert.deepEqual(await shown(page), { label: "Waiting for customer", dot: "wait", disabled: false, copy: true });
  assert.equal(await main(page).getAttribute("aria-description"), "Press to stop the link");
  assert.equal(await page.getByRole("button", { name: "Preview link: Waiting for customer" }).count(), 1, "the row says which link it is");

  await set(page, on({ watching: 1 }));
  assert.deepEqual(await shown(page), { label: "1 watching", dot: "on", disabled: false, copy: true });
  await set(page, on({ watching: 1, reconnecting: true }));
  assert.deepEqual(await shown(page), { label: "Reconnecting…", dot: "busy", disabled: false, copy: true });
  await set(page, on({ watching: 2 }));
  assert.equal((await shown(page)).label, "2 watching");

  // Pressed while on, it turns the link off (it does not copy again).
  await page.evaluate(() => {
    const preview = (globalThis as Scope).preview;
    preview.stop = () => { preview.set({ ...preview.state, stopping: true } as PreviewState); return new Promise((resolve) => { (globalThis as never as { stopped(): void }).stopped = () => { preview.set({ on: false }); resolve(); }; }); };
  });
  await main(page).click();
  assert.deepEqual(await shown(page), { label: "Stopping…", dot: "busy", disabled: true, copy: true });
  await page.evaluate(() => (globalThis as never as { stopped(): void }).stopped());
  assert.deepEqual(await shown(page), { label: "Preview link", dot: "idle", disabled: false, copy: false });
  assert.deepEqual(await page.evaluate(() => (globalThis as Scope).preview.copies), [LINK]);
}));

test("a link that could not be made turns the dot red and a press tries again; a refused turn-off says so; no site dims the row", () => inBrowser(async page => {
  await open(page);
  await main(page).waitFor();
  await page.evaluate(() => { (globalThis as Scope).preview.start = () => Promise.reject(new Error("offline")); });
  await main(page).click();
  await page.waitForFunction(() => document.querySelector<HTMLElement>(".share-row")?.dataset.dot === "bad");
  assert.deepEqual(await shown(page), { label: "Couldn't make a link · try again", dot: "bad", disabled: false, copy: false });
  // It stays until the next press, which tries again.
  await page.clock.runFor(5000);
  assert.equal((await shown(page)).label, "Couldn't make a link · try again");
  await page.evaluate(() => { const preview = (globalThis as Scope).preview; preview.start = async () => { preview.set({ on: true, link: "https://previews.example/s/b/#k=z", ends: 0, watching: 0 }); return "https://previews.example/s/b/#k=z"; }; });
  await main(page).click();
  await page.waitForFunction(() => document.querySelector(".share-row__label")?.textContent === "Link copied");
  assert.equal((await shown(page)).dot, "wait");
  await page.clock.runFor(2600);

  await page.evaluate(() => { (globalThis as Scope).preview.stop = () => Promise.reject(new Error("offline")); });
  await main(page).click();
  await page.waitForFunction(() => document.querySelector(".share-row__label")?.textContent === "Couldn't stop · try again");
  assert.equal((await shown(page)).dot, "bad");

  await page.evaluate(() => { const preview = (globalThis as Scope).preview; preview.available = false; preview.set({ on: false }); });
  assert.deepEqual(await shown(page), { label: "Preview link", dot: "idle", disabled: true, copy: false });
  await main(page).click({ force: true });
  assert.equal(await page.evaluate(() => (globalThis as Scope).preview.copies.length), 1, "a dimmed row does nothing");
  assert.equal(await page.locator(".share-row__main:not([disabled])").count(), 1, "aria-disabled, not disabled: the keyboard's focus is kept");
}));

test("without a preview Worker the menu draws nothing of Preview link and loads nothing for it", () => inBrowser(async page => {
  await page.evaluate(() => { (globalThis as Scope).preview.offered = false; });
  await open(page);
  assert.equal(await page.evaluate(() => (globalThis as Scope).preview.draws), 0);
  assert.equal(await row(page).count(), 0);
  await page.evaluate(() => { (globalThis as Scope).preview.offered = true; (globalThis as Scope).menu.close(); });
  await open(page);
  await main(page).waitFor();
  await page.evaluate(() => (globalThis as Scope).menu.close());
  await open(page);
  assert.equal(await page.evaluate(() => (globalThis as Scope).preview.draws), 1, "drawn once");
}));

test("the copy icon: hidden at rest, shown on hover and on keyboard focus, a check for a moment after copying", () => inBrowser(async page => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await set(page, on());
  await open(page);
  await main(page).waitFor();
  await page.mouse.move(1000, 700);
  assert.equal(await iconOpacity(page), "0");
  await row(page).hover();
  assert.equal(await iconOpacity(page), "1");
  await page.mouse.move(1000, 700);
  assert.equal(await iconOpacity(page), "0");
  // Keyboard: Tab from the row reaches the copy icon, which shows.
  await main(page).focus();
  assert.equal(await iconOpacity(page), "1");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Copy link");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector(".share-row__copy")?.classList.contains("is-done"));
  assert.equal(await page.locator(".share-row__copy-icon").getAttribute("data-icon"), "check");
  assert.equal((await shown(page)).label, "Link copied");
  assert.deepEqual(await page.evaluate(() => (globalThis as Scope).preview.copies), [LINK]);
  await page.clock.runFor(2600);
  assert.equal(await page.locator(".share-row__copy-icon").getAttribute("data-icon"), "copy");
  assert.equal((await shown(page)).label, "Waiting for customer");
  // No room is kept for it: the label runs the row's full width.
  const room = await page.evaluate(() => {
    const button = document.querySelector(".share-row__main")!.getBoundingClientRect(), host = document.querySelector(".share-row")!.getBoundingClientRect();
    return Math.round(host.right - button.right);
  });
  assert.equal(room, 0);
}));

test("a copy the browser refuses leaves the copy icon showing and focused, to press again", () => inBrowser(async page => {
  await page.evaluate(() => {
    const preview = (globalThis as Scope).preview;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } });
    preview.start = async () => { preview.set({ on: true, link: "https://previews.example/s/c/#k=w", ends: 0, watching: 0 }); return "https://previews.example/s/c/#k=w"; };
  });
  await open(page);
  await main(page).click();
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Copy link");
  assert.equal((await shown(page)).label, "Link ready · copy it");
  assert.equal(await iconOpacity(page), "1");
}));

test("on touch the copy icon always shows and the label stops short of it", () => inBrowser(async page => {
  await set(page, on());
  await open(page);
  await main(page).waitFor();
  assert.equal(await page.evaluate(() => matchMedia("(hover: none), (pointer: coarse)").matches), true);
  assert.equal(await iconOpacity(page), "1");
  assert.equal(await main(page).evaluate((element) => getComputedStyle(element).paddingInlineEnd), "36px");
}, { hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } }));

test("the project tile shows a dot while the link is on, menu open or not, and none once it is off", () => inBrowser(async page => {
  const dot = () => page.locator(".repository-menu__trigger").getAttribute("data-shared");
  assert.equal(await dot(), null);
  await set(page, on());
  assert.equal(await dot(), "wait");
  assert.notEqual(await page.locator(".repository-menu__trigger").evaluate((element) => getComputedStyle(element, "::after").content), "none");
  await set(page, on({ watching: 1 }));
  assert.equal(await dot(), "on");
  await set(page, on({ watching: 1, reconnecting: true }));
  assert.equal(await dot(), "busy");
  await set(page, { on: false });
  assert.equal(await dot(), null);
}));
