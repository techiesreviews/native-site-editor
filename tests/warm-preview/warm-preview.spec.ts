import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { expect, test, type Page, type Response } from "@playwright/test";

const sourcePath = "src/pages/index.astro";
const originalSource = readFileSync(resolve("fixtures/astro-starter", sourcePath), "utf8");
const cssPath = "src/styles/site.css";
const originalCss = readFileSync(resolve("fixtures/astro-starter", cssPath), "utf8");
const counterPath = "src/components/Counter.tsx";
const originalCounter = readFileSync(resolve("fixtures/astro-starter", counterPath), "utf8");
const buttonLine = '    <a class="button" href="/about/">Get to know this project ↗</a>';
const formattedButtonLine = '    <a class="button" href="/about/">Get to <strong>know </strong>this <em>project </em>↗</a>';
const heading = "A little space on the web, updated.";
const logPath = resolve(".scratch/warm-preview/browser.log");

type DraftBody = { revision?: string; previewUrl?: string; error?: string };
const pageErrors = new WeakMap<Page, string[]>();
const assetFailures = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page, baseURL }) => {
  const errors: string[] = [];
  const failedAssets: string[] = [];
  pageErrors.set(page, errors);
  assetFailures.set(page, failedAssets);
  log(`test start baseURL=${baseURL}`);
  page.on("pageerror", (error) => {
    errors.push(error.message);
    log(`pageerror ${error.message}`);
  });
  page.on("requestfailed", (request) => {
    if (["script", "stylesheet", "image", "font"].includes(request.resourceType())) {
      failedAssets.push(`${request.resourceType()} ${request.url()} ${request.failure()?.errorText ?? ""}`.trim());
      log(`requestfailed ${failedAssets.at(-1)}`);
    }
  });
  page.on("response", (response) => {
    const request = response.request();
    if (["script", "stylesheet", "image", "font"].includes(request.resourceType()) && response.status() >= 400) {
      failedAssets.push(`${request.resourceType()} ${response.status()} ${response.url()}`);
      log(`asset-status ${failedAssets.at(-1)}`);
    }
    if (response.url().includes("/api/draft-preview"))
      log(`draft-response ${request.method()} ${response.status()} ${response.url()}`);
  });
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("astro-site-editor:draft-preview-session", "11111111-1111-4111-8111-111111111111");
    } catch {}
  });
  await page.route("**://*.lexvd.workers.dev/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await page.request.get(`${baseURL}/__warm-baseline${url.pathname}`);
    await route.fulfill({ response });
  });
  await page.goto(`${baseURL}/#repo=42&branch=main&file=${encodeURIComponent(sourcePath)}`);
  await expect(page.locator(".preview-summary")).toContainText(/same as main|Preview shows/, { timeout: 30_000 });
  log(`initial summary=${await page.locator(".preview-summary").textContent().catch(() => "")} frame=${await page.locator(".preview-frame--after").getAttribute("src").catch(() => "")}`);
  await expect(page.locator("#current-page")).toHaveText(sourcePath, { timeout: 30_000 });
});

test.afterEach(async ({ page }) => {
  log(`afterEach summary=${await page.locator(".preview-summary").textContent().catch(() => "")} frame=${await page.locator(".preview-frame--after").getAttribute("src").catch(() => "")}`);
  expect(pageErrors.get(page) ?? []).toEqual([]);
  expect(assetFailures.get(page) ?? []).toEqual([]);
});

function modKey() {
  return process.platform === "darwin" ? "Meta" : "Control";
}

async function setOpenSource(page: Page, source: string, visibleText: string) {
  const editor = page.locator("#content .view-lines");
  await expect(editor).toBeVisible({ timeout: 20_000 });
  const start = performance.now();
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), source);
  await editor.click({ position: { x: 24, y: 24 } });
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
  log("source-paste chars=" + source.length + " visible=" + visibleText);
  return start;
}

async function openFile(page: Page, path: string, visibleText: string) {
  const parts = path.split("/");
  for (const [index, part] of parts.entries()) {
    const button = page.getByRole("button", { name: part, exact: true });
    if (!await button.count()) continue;
    const item = button.first();
    const expanded = await item.getAttribute("aria-expanded");
    if (index === parts.length - 1 || expanded === "false") await item.click();
  }
  await expect(page.locator("#current-page")).toHaveText(path);
  await expect(page.locator("#content .view-lines")).toContainText(visibleText);
}

async function waitForDraft(page: Page, predicate: (response: Response) => boolean = (response) => response.ok()) {
  const response = await page.waitForResponse((candidate) =>
    candidate.url().includes("/api/draft-preview") &&
    candidate.request().method() === "POST" &&
    predicate(candidate),
  { timeout: 60_000 });
  const body = await response.json().catch(() => ({})) as DraftBody;
  log(`draft-body status=${response.status()} body=${JSON.stringify(body).slice(0, 1000)} frame=${await page.locator(".preview-frame--after").getAttribute("src").catch(() => "")}`);
  if (response.ok()) {
    expect(body.revision).toBeTruthy();
    await expect(page.locator(".preview-frame--after")).toHaveAttribute("src", new RegExp(encodeURIComponent(body.revision!)), { timeout: 60_000 });
  }
  return { response, body };
}

function log(message: string) {
  mkdirSync(".scratch/warm-preview", { recursive: true });
  appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`);
}

async function publishBoundary(page: Page) {
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  for (const checkbox of await page.locator(".publish-menu input[type=checkbox]").all()) await checkbox.check();
  await page.getByRole("button", { name: "Publish selected files", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Offline warm preview" })).toBeVisible();
  const response = await page.request.get("/api/warm-preview-published");
  return response.json() as Promise<{ branch: string; files: { path: string; content: string }[] }>;
}

async function selectSecondWarmButton(page: Page) {
  const frame = page.frameLocator(".preview-frame--after");
  const button = frame.locator("main a.button").nth(1);
  await expect(button).toBeVisible({ timeout: 60_000 });
  await expect(button).toHaveText("Get to know this project ↗");
  await button.click();
  await expect(page.getByRole("toolbar", { name: "Edit bar", exact: true })).toContainText("Button");
}

async function keepSecondWarmButtonSelected(page: Page) {
  const toolbar = page.getByRole("toolbar", { name: "Edit bar", exact: true });
  const link = toolbar.getByRole("button", { name: "Link", exact: true });
  if (await link.isVisible().catch(() => false)) return toolbar;
  await page.frameLocator(".preview-frame--after").locator("main a.button").nth(1).click();
  await expect(toolbar).toContainText("Button");
  await expect(link).toBeVisible();
  return toolbar;
}

test("warm runtime builds real drafts and preserves editor editing, reload, and publish boundaries", async ({ page }, testInfo) => {
  const draftResponses: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/api/draft-preview") && response.request().method() === "POST")
      draftResponses.push(`${response.status()} ${response.url()}`);
  });
  const samples: Record<string, number> = {};
  const frame = page.frameLocator(".preview-frame--after");

  const warmSource = originalSource
    .replace(buttonLine, `${buttonLine}\n${formattedButtonLine}`)
    .replace("<Counter client:load />", '<Counter label="Warm visitors" client:load />');
  const firstDraft = waitForDraft(page);
  const sourceStart = await setOpenSource(page, warmSource, "Warm visitors");
  await firstDraft;
  await expect(frame.locator(".counter")).toContainText("Warm visitors");
  await frame.getByRole("button", { name: "Wave 👋", exact: true }).click();
  await expect(frame.locator(".counter output")).toHaveText("1");
  await selectSecondWarmButton(page);
  samples.sourceToVisibleAndBarReadyMs = performance.now() - sourceStart;

  const style = page.getByRole("toolbar", { name: "Edit bar", exact: true }).getByRole("combobox", { name: "Button style", exact: true });
  await expect(style).toBeVisible();
  await style.selectOption("secondary");
  await expect(frame.locator("main a.button").nth(1)).toHaveClass(/secondary/);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(frame.locator("main a.button").nth(1)).not.toHaveClass(/secondary/);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(frame.locator("main a.button").nth(1)).toHaveClass(/secondary/);

  const selectedToolbar = await keepSecondWarmButtonSelected(page);
  await selectedToolbar.getByRole("button", { name: "Link", exact: true }).click();
  await page.getByLabel("Destination").fill("/warm/");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(frame.locator("main a.button").first()).toHaveAttribute("href", "/about/");
  await expect(frame.locator("main a.button").nth(1)).toHaveAttribute("href", "/warm/");
  await expect(frame.locator("main a.button").nth(1)).toHaveClass(/secondary/);
  await page.reload();
  await expect(page.locator("#current-page")).toHaveText(sourcePath, { timeout: 30_000 });
  await expect(frame.locator("main a.button").nth(1)).toHaveAttribute("href", "/warm/", { timeout: 60_000 });
  await expect(frame.locator("main a.button").first()).toHaveAttribute("href", "/about/");
  await frame.locator("main a.button").nth(1).click();
  await expect(page.getByRole("toolbar", { name: "Edit bar", exact: true })).toContainText("Button");

  const published = await publishBoundary(page);
  expect(published.branch).toBe("main");
  const publishedSource = published.files.find((file) => file.path === sourcePath)?.content ?? "";
  expect(publishedSource).toContain('href="/warm/"');
  expect(publishedSource).toContain("<strong>know </strong>");
  expect(publishedSource).toContain("<em>project </em>");
  expect(publishedSource).toContain("Warm visitors");
  expect(publishedSource).toContain("secondary");

  mkdirSync(".scratch/warm-preview", { recursive: true });
  writeFileSync(`.scratch/warm-preview/${testInfo.project.name}-core.json`, JSON.stringify({
    samples,
    draftResponses,
    note: "Measured in browser from clipboard-backed source replacement start through real warm Astro draft visibility, Counter hydration click, and duplicate button edit-bar usability. GitHub API is stubbed; rendering, revision and assets are runtime-built.",
  }, null, 2));
});

test("warm runtime keeps last good draft on invalid source, recovers, and newest rapid edit wins", async ({ page }, testInfo) => {
  const frame = page.frameLocator(".preview-frame--after");
  const valid = originalSource.replace(buttonLine, `${buttonLine}\n    <button>Valid warm action</button>`);
  let draft = waitForDraft(page);
  await setOpenSource(page, valid, "Valid warm action");
  await draft;
  await expect(frame.getByRole("button", { name: "Valid warm action", exact: true })).toBeVisible({ timeout: 60_000 });
  const lastGood = await page.locator(".preview-frame--after").getAttribute("src");

  const invalid = valid.replace("---\n", "---\nconst broken = ;\n");
  const invalidDraft = waitForDraft(page, (response) => response.status() >= 400);
  await setOpenSource(page, invalid, "const broken");
  const failed = await invalidDraft;
  expect(failed.response.status()).toBeGreaterThanOrEqual(400);
  await expect(page.locator(".preview-frame--after")).toHaveAttribute("src", lastGood ?? "", { timeout: 30_000 });
  await expect(frame.getByRole("button", { name: "Valid warm action", exact: true })).toBeVisible();

  const recovered = originalSource.replace(buttonLine, `${buttonLine}\n    <button>Recovered warm action</button>`);
  draft = waitForDraft(page);
  await setOpenSource(page, recovered, "Recovered warm action");
  await draft;
  await expect(frame.getByRole("button", { name: "Recovered warm action", exact: true })).toBeVisible({ timeout: 60_000 });

  const held: { release?: () => void; intercepted: boolean } = { intercepted: false };
  await page.route("**/api/draft-preview**", async (route) => {
    if (route.request().method() !== "POST" || held.intercepted) return route.fallback();
    held.intercepted = true;
    const response = await route.fetch();
    await new Promise<void>((resolve) => { held.release = resolve; });
    await route.fulfill({ response });
    await page.unroute("**/api/draft-preview**").catch(() => undefined);
  });
  const transient = originalSource.replace(buttonLine, `${buttonLine}\n    <button>Transient warm action</button>`);
  await setOpenSource(page, transient, "Transient warm action");
  await expect.poll(() => held.intercepted).toBe(true);
  await expect.poll(() => typeof held.release).toBe("function");
  const newest = originalSource.replace(buttonLine, `${buttonLine}\n    <button>Newest warm action</button>`);
  const newestDraft = waitForDraft(page);
  const newestStart = await setOpenSource(page, newest, "Newest warm action");
  held.release?.();
  await newestDraft;
  await expect(frame.getByRole("button", { name: "Newest warm action", exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(frame.getByRole("button", { name: "Transient warm action", exact: true })).toHaveCount(0);
  await frame.getByRole("button", { name: "Newest warm action", exact: true }).click();
  await expect(page.getByRole("toolbar", { name: "Edit bar", exact: true })).toContainText("Button");

  mkdirSync(".scratch/warm-preview", { recursive: true });
  writeFileSync(`.scratch/warm-preview/${testInfo.project.name}-recovery.json`, JSON.stringify({
    invalidStatus: failed.response.status(),
    newestSourceToVisibleAndBarReadyMs: performance.now() - newestStart,
    note: "Invalid source preserves last-good iframe. Rapid edit assertion waits for latest runtime-built artifact, then verifies edit bar usability.",
  }, null, 2));
});

test("warm runtime rebuilds imported component and CSS output", async ({ page }, testInfo) => {
  await openFile(page, cssPath, "color: #6b7968");
  const cssStart = performance.now();
  const css = originalCss.replace("color: #6b7968;", "color: rgb(124, 24, 36);");
  let draft = waitForDraft(page);
  await setOpenSource(page, css, "rgb(124, 24, 36)");
  await draft;
  const frame = page.frameLocator(".preview-frame--after");
  await expect.poll(() => frame.locator(".lead").evaluate((element) => getComputedStyle(element).color)).toBe("rgb(124, 24, 36)");
  const cssSourceToVisibleMs = performance.now() - cssStart;

  await openFile(page, counterPath, "Visitors waved");
  const componentSource = originalCounter.replace("Visitors waved", "CSS verified visitors");
  draft = waitForDraft(page);
  const componentStart = await setOpenSource(page, componentSource, "CSS verified visitors");
  await draft;
  await expect(frame.locator(".counter")).toContainText("CSS verified visitors", { timeout: 60_000 });

  mkdirSync(".scratch/warm-preview", { recursive: true });
  writeFileSync(`.scratch/warm-preview/${testInfo.project.name}-css-component.json`, JSON.stringify({
    cssSourceToVisibleMs,
    componentSourceToVisibleMs: performance.now() - componentStart,
    note: "CSS and imported Counter output are verified from real warm Astro builds.",
  }, null, 2));
});
