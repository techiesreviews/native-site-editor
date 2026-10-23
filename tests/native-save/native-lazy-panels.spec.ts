import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openEditor, openFiles, openMedia, openPages, switchSiteMidUpload } from "../support/scenarios";
import { storedDraft, storedDrafts } from "./drafts";
import { discardAllChanges } from "./publish";

// Default fixture group. Every case starts in a fresh browser context.
const chunks = {
  Pages: "/src/components/pages-tree.ts",
  Files: "/src/controllers/files-tree-controller.ts",
  Media: "/src/page-builder/media-picker.ts",
};
const indexSource = readFileSync("fixtures/native-starter/index.html", "utf8");
const panelModules = /\/src\/(?:controllers\/(?:pages-controller|files-tree-controller|file-operation-checks)|components\/(?:create-dialog|file-row-actions|confirm-dialog|page-picker|pages-tree)|page-builder\/media-picker)\.ts(?:\?|$)/;

async function select(page: Page, name: keyof typeof chunks) {
  if (!await page.locator("#explorer").isVisible()) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name, exact: true }).click();
}

async function act(page: Page, name: keyof typeof chunks) {
  if (name === "Pages") {
    const explorer = await openPages(page);
    await explorer.getByRole("button", { name: "+ New page", exact: true }).click();
    const title = explorer.getByRole("textbox", { name: "New page title", exact: true });
    await title.fill("Lazy panel page");
    await title.press("Enter");
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", "lazy-panel-page/index.html");
    await expect.poll(() => storedDraft(page, "lazy-panel-page/index.html")).toMatchObject({ baseSha: null });
  } else if (name === "Files") {
    const explorer = await openFiles(page);
    await explorer.locator('.file-row[data-path="robots.txt"]').focus();
    await page.keyboard.press("F2");
    const field = explorer.getByRole("textbox", { name: "New name for robots.txt", exact: true });
    await field.fill("robots-renamed.txt");
    await field.press("Enter");
    await expect(explorer.locator('.file-row[data-path="robots-renamed.txt"]')).toBeVisible();
    await expect.poll(() => storedDraft(page, "robots-renamed.txt")).toMatchObject({ movedFrom: "robots.txt" });
  } else {
    const media = await openMedia(page);
    await media.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
    await expect(media.getByLabel("File name", { exact: true })).toHaveValue("studio-desk.svg");
    await expect(media.getByLabel("Description", { exact: true })).toBeVisible();
  }
}

for (const name of Object.keys(chunks) as (keyof typeof chunks)[]) {
  test(`${name} loads on first open and its action works`, async ({ page, baseURL }) => {
    const requested: string[] = [];
    const errors: string[] = [];
    page.on("request", request => { if (panelModules.test(request.url())) requested.push(request.url()); });
    page.on("pageerror", error => errors.push(error.message));
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**${chunks[name]}*`, async route => { await held; await route.continue(); });
    try {
      await openEditor(page, baseURL);
      expect(requested, "panel code stays out of cold boot").toEqual([]);
      await select(page, name);
      await expect(page.locator(`#explorer-${name.toLowerCase()}`)).toContainText(`Loading ${name.toLowerCase()}…`);
      release();
      await act(page, name);
      expect(requested.some(url => new URL(url).pathname === chunks[name])).toBe(true);
      expect(errors).toEqual([]);
    } finally { release(); }
  });

  test(`${name} works again after a failed chunk load and recovery`, async ({ page, baseURL }) => {
    const failed = await failOnce(page, baseURL, chunks[name]);
    await select(page, name);
    await expect(page.locator("#notice")).toContainText("reload the page manually");
    expect(failed()).toBe(1);
    await reloadEditor(page);
    await act(page, name);
    expect(failed()).toBeGreaterThan(1);
  });
}

// Fails `path`'s first request, after the reload key is preset so recovery offers a manual reload.
async function failOnce(page: Page, baseURL: string | undefined, path: string) {
  let failed = 0;
  await page.route(`**${path}*`, async route => {
    if (!failed++) await route.abort("failed");
    else await route.continue();
  });
  await openEditor(page, baseURL);
  expect(failed, "the chunk is not requested at boot").toBe(0);
  await page.evaluate(() => sessionStorage.setItem("native-site-editor:chunk-reload", "1"));
  return () => failed;
}

// Waits for the preview too: a rename's stamp holds the route the preview settles on.
async function reloadEditor(page: Page) {
  await page.reload();
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").locator("body")).toBeVisible();
}

// The Save panel's Discard asks through the confirm dialog, which loads with its first question.
async function draftIndex(page: Page) {
  await expect(page.locator('#content [role="textbox"]').first()).toBeAttached({ timeout: 20_000 });
  await page.evaluate(async text => navigator.clipboard.writeText(text), indexSource.replace("A native browser preview", "Lazy discard"));
  await page.locator('#content [role="textbox"]').first().evaluate(element => (element as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
  await expect.poll(async () => (await storedDrafts(page)).map(draft => draft.path)).toEqual(["index.html"]);
}
const discardDialog = (page: Page) => page.getByRole("dialog", { name: "Discard 1 unsaved change?" });

test("Pages works again after its page actions fail to load and recovery", async ({ page, baseURL }) => {
  const failed = await failOnce(page, baseURL, "/src/controllers/pages-controller.ts");
  await select(page, "Pages");
  await expect(page.locator("#notice")).toContainText("reload the page manually");
  await expect(page.locator("#explorer-pages")).toContainText("Loading pages…");
  expect(failed()).toBe(1);
  await reloadEditor(page);
  await act(page, "Pages");
  expect(failed()).toBeGreaterThan(1);
});

test("Discard works again after the confirm dialog fails to load and recovery", async ({ page, baseURL }) => {
  const failed = await failOnce(page, baseURL, "/src/components/confirm-dialog.ts");
  await draftIndex(page);
  await discardAllChanges(page);
  await expect(page.locator("#notice")).toContainText("reload the page manually");
  await expect(discardDialog(page)).toHaveCount(0);
  expect(failed()).toBe(1);
  expect(await storedDraft(page, "index.html")).toBeTruthy();
  await reloadEditor(page);
  await discardAllChanges(page);
  await discardDialog(page).getByRole("button", { name: "Discard all", exact: true }).click();
  await expect.poll(() => storedDrafts(page)).toEqual([]);
  expect(failed()).toBeGreaterThan(1);
});

// An async writer that waits for its chunk holds a repository stamp: a branch switched meanwhile cancels it.
test("Discard asked while its dialog loads is dropped when the branch changes meanwhile", async ({ page, baseURL }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const dialogModule = "/src/components/confirm-dialog.ts";
  await page.route(`**${dialogModule}*`, async route => { await held; await route.continue(); });
  try {
    await openEditor(page, baseURL);
    await draftIndex(page);
    const requested = page.waitForRequest(request => new URL(request.url()).pathname === dialogModule);
    await discardAllChanges(page);
    await requested;
    await switchSiteMidUpload(page, baseURL);
    const loaded = page.waitForResponse(response => new URL(response.url()).pathname === dialogModule);
    release();
    await loaded;
    // The module has run once the page can import it; the discard's wait then settled.
    await page.evaluate(async path => { await import(path); await new Promise(requestAnimationFrame); }, dialogModule);
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    expect((await storedDrafts(page)).map(draft => draft.path), "main's draft is kept, none is written").toEqual(["index.html"]);
  } finally { release(); }
});

// A repository with no site (a README alone) has only Files, which still waits for the explorer's chunks.
// Its explorer opens with the editor, so a reload key (`manualReload`) is preset before that boot.
async function openPlainRepository(page: Page, baseURL: string | undefined, name: string, manualReload = false) {
  await openEditor(page, baseURL);
  if (manualReload) await page.evaluate(() => sessionStorage.setItem("native-site-editor:chunk-reload", "1"));
  await page.request.post(`${baseURL}/__demo/onboarding`, { data: { add: [{ name, kind: "no-site" }] } });
  const repos = (await (await page.request.get(`${baseURL}/api/repositories?refresh=1`)).json()) as { id: number; name: string }[];
  await page.goto(`${baseURL}/#repo=${repos.find(repo => repo.name === name)!.id}&branch=main&file=README.md`);
  await page.reload();
  await expect(page.locator("#primary-title")).toHaveText("README.md", { timeout: 30_000 });
}

// Files alone, with no tabs.
async function showPlainFiles(page: Page) {
  if (!await page.locator("#explorer").isVisible()) await page.locator("#explorer-toggle").click();
  await expect(page.getByRole("tab", { name: "Files", exact: true })).toBeHidden();
}

async function renameReadme(page: Page, to: string) {
  await showPlainFiles(page);
  const explorer = page.locator("#explorer");
  await explorer.locator('.file-row[data-path="README.md"]').focus();
  await page.keyboard.press("F2");
  const field = explorer.getByRole("textbox", { name: "New name for README.md", exact: true });
  await field.fill(to);
  await field.press("Enter");
  await expect(explorer.locator(`.file-row[data-path="${to}"]`)).toBeVisible();
  await expect.poll(() => storedDraft(page, to)).toMatchObject({ movedFrom: "README.md" });
}

test("a repository without a site opens Files on first open, and again after page actions fail to load", async ({ page, baseURL }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**${chunks.Files}*`, async route => { await held; await route.continue(); });
  const icons = "/src/components/file-type-icons.ts";
  try {
    await openPlainRepository(page, baseURL, "lazy-notes");
    await showPlainFiles(page);
    await expect(page.locator("#explorer-files")).toContainText("Loading files…");
    const iconsRequested = page.waitForRequest(request => new URL(request.url()).pathname === icons, { timeout: 15_000 });
    release();
    // The tree, mounted, counts as shown: the open file's row is marked and the type icons load.
    await expect(page.locator('#explorer .file-row[data-path="README.md"]')).toHaveClass(/\bselected\b/);
    await iconsRequested;
    await renameReadme(page, "NOTES.md");
  } finally { release(); }

  await page.unroute(`**${chunks.Files}*`);
  let failed = 0;
  await page.route("**/src/controllers/pages-controller.ts*", async route => {
    if (!failed++) await route.abort("failed");
    else await route.continue();
  });
  await openPlainRepository(page, baseURL, "lazy-notes-again", true);
  await showPlainFiles(page);
  await expect(page.locator("#notice")).toContainText("reload the page manually");
  expect(failed).toBe(1);
  await page.reload();
  await expect(page.locator("#primary-title")).toHaveText("README.md", { timeout: 30_000 });
  await renameReadme(page, "NOTES-AGAIN.md");
  expect(failed).toBeGreaterThan(1);
});

// Real request boundaries: the keyboard layer remains available before the UI loads.
test("editor boot leaves optional panels unloaded and the first palette key opens it", async ({ page, baseURL }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));
  const feature = (name: string) => requests.some((path) =>
    path.includes(`/components/${name}.`) || path.includes(`/page-builder/${name}.`) ||
    new RegExp(`/assets/${name}-[^/]+\\.(js|css)$`).test(path));
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  for (const name of ["command-palette", "commit-history", "media-picker", "get-started", "start-site", "setup-wizard", "setup-checklist", "spotlight", "agent-menu", "agent-pins"])
    expect(feature(name), `${name} loads only when used`).toBe(false);
  await page.locator("#explorer-toggle").focus();
  await page.keyboard.press("ControlOrMeta+K");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  expect(feature("command-palette")).toBe(true);
  await page.keyboard.press("Escape");
  await page.locator("#history-button").click();
  await expect(page.locator("#changes")).toBeVisible();
  expect(feature("commit-history")).toBe(true);
  await page.keyboard.press("Escape");
  await page.locator(".repository-menu__trigger").click();
  await expect(page.getByRole("button", { name: "Connect to MCP", exact: true })).toBeVisible();
  expect(feature("agent-menu")).toBe(true);
  expect(feature("agent-pins")).toBe(false);
});

test("a failed connection check keeps browser requests and never adopts hub content or starts polling", async ({ page, baseURL }) => {
  let calls = 0;
  await page.route("**/api/agent/connections", async route => {
    calls++;
    await route.fulfill({ status: 503, json: { error: "Try again" } });
  });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  expect(calls, "remote agents are off until the user turns them on").toBe(0);
  // Installed after load, as the toast spec does: every timer Connect starts is then on this clock.
  await page.clock.install();
  await page.evaluate(async () => {
    const { indexedDbAgentRecords } = await import("/src/agent-records.ts");
    const request = { id: "req-restored-question", repoId: 501, branch: "main", text: "Change the heading", state: "question", createdAt: Date.now(),
      reply: { status: "question", message: "Which heading?", at: Date.now() },
      element: { file: "index.html", route: "/", id: "1.0", tag: "h1", text: "A native browser preview", selector: ".hero h1" } };
    await indexedDbAgentRecords().putConversation({ account: "native-demo-user", repoId: 501, branch: "main" },
      { id: request.id, content: request, unfinished: true, updatedAt: Date.now() });
  });
  await page.locator(".repository-menu__trigger").click();
  await page.getByRole("button", { name: "Connect to MCP", exact: true }).click();
  await expect(page.locator(".agent-pin__question")).toHaveText("Which heading?", { timeout: 15_000 });
  // Connect checks once, makes its token and reads once more; the pin may show before or after
  // that second read, so wait for it rather than count at the pin.
  await expect.poll(() => calls).toBe(2);
  // Nothing polls after: a minute of timers runs, then a request the page sends last comes back
  // only after any read those timers started has reached the route above.
  await page.clock.runFor(60_000);
  await page.route("**/__after-timers", route => route.fulfill({ status: 204 }));
  await page.evaluate(() => fetch("/__after-timers"));
  expect(calls).toBe(2);
});

test("first OAuth storage event keeps the short retries while its grant arrives", async ({ page, baseURL }) => {
  let calls = 0;
  await page.route("**/api/agent/connections", async (route) => {
    const grants = ++calls >= 3 ? [{ id: "oauth-restored", branch: "main", approval: "lazy-approval", repoId: 501, repo: "native-demo-user/native-demo", via: "oauth", createdAt: Date.now() }] : [];
    await route.fulfill({ json: { grants, tabId: null, updatedAt: null, commands: [], requests: [] } });
  });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  expect(calls, "startup makes no hub call").toBe(0);
  // Approving the connection turns remote agents on in the tab showing its repository.
  await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "native-site-editor:agent-connected", newValue: JSON.stringify({ at: Date.now(), repo: "native-demo-user/native-demo", branch: "main", approval: "lazy-approval" }) })));
  await expect(page.locator(".agent-menu__action")).toContainText("Disconnect MCP", { timeout: 15_000 });
  expect(calls).toBeGreaterThanOrEqual(3);
});

for (const mode of ["transfer", "cancel", "run"] as const) {
  const cancel = mode === "cancel";
  test(`cold Go to captures typing from Monaco${cancel ? " and Escape cancels opening" : mode === "run" ? " and Enter runs after loading" : " and transfers the query"}`, async ({ page, baseURL }) => {
    let release!: () => void;
    const downloading = new Promise<void>((resolve) => { release = resolve; });
    let requested = false;
    let completed = false;
    await page.route(/\/(?:src\/components\/command-palette\.ts|assets\/command-palette-[^/]+\.js)(?:\?|$)/, async (route) => {
      requested = true;
      await downloading;
      await route.continue();
      completed = true;
    });
    await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
    const editor = page.locator("#content [role='textbox']").first();
    await expect(editor).toBeAttached({ timeout: 30_000 });
    const source = async () => {
      await editor.focus();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.press("ControlOrMeta+C");
      const text = await page.evaluate(() => navigator.clipboard.readText());
      await page.keyboard.press("ArrowRight");
      return text;
    };
    const before = await source();
    const palette = page.getByRole("dialog", { name: "Command palette" });
    const search = palette.getByRole("combobox", { name: "Search commands" });
    try {
      await page.keyboard.press("ControlOrMeta+P");
      await page.keyboard.type("site.css");
      await expect(search).toBeFocused();
      await expect.poll(() => requested).toBe(true);
      await expect(search).toHaveValue("site.css");
      if (cancel) {
        await page.keyboard.press("Escape");
        await expect(palette).toBeHidden();
        await expect(editor).toBeFocused();
      }
      if (mode === "run") await page.keyboard.press("Enter");
      release();
      await expect.poll(() => completed).toBe(true);
      // The sheet is constructed with the palette, so its presence proves loading finished.
      await expect(page.locator("dialog.shortcut-sheet")).toBeAttached();
      if (cancel) await expect(palette).toBeHidden();
      else if (mode === "run") {
        await expect(palette).toBeHidden();
        await expect(page.locator("#current-page")).toHaveAttribute("data-path", "styles/site.css");
        await page.keyboard.press("ControlOrMeta+P");
        await palette.getByRole("combobox").fill("index.html");
        await page.keyboard.press("Enter");
        await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
      } else {
        await expect(search).toHaveValue("site.css");
        await expect(search).toBeFocused();
        await expect(palette.getByRole("option", { name: /^site\.css, styles/ })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(editor).toBeFocused();
      }
      expect(await source()).toBe(before);
    } finally {
      release();
    }
  });
}
