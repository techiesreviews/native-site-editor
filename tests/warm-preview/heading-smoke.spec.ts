import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { expect, test, type Page, type Response } from "@playwright/test";

const sourcePath = "src/pages/index.astro";
const originalSource = readFileSync(resolve("fixtures/astro-starter", sourcePath), "utf8");
const originalHeading = "A little space on the web, updated.";
const smokeHeading = "Warm smoke heading works.";
const logPath = resolve(".scratch/warm-preview/browser.log");

type DraftBody = { revision?: string };

function log(message: string) {
  mkdirSync(".scratch/warm-preview", { recursive: true });
  appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`);
}

async function pasteSource(page: Page, source: string) {
  const textbox = page.locator("#content").getByRole("textbox", { name: "File source", exact: true });
  await expect(textbox).toBeVisible({ timeout: 30_000 });
  const start = performance.now();
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), source);
  await textbox.focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
  log(`heading-smoke paste chars=${source.length}`);
  return start;
}

async function waitForDraft(page: Page) {
  const response = await page.waitForResponse((candidate: Response) =>
    candidate.url().includes("/api/draft-preview") &&
    candidate.request().method() === "POST" &&
    candidate.ok(),
  { timeout: 60_000 });
  const body = await response.json().catch(() => ({})) as DraftBody;
  expect(body.revision).toBeTruthy();
  await expect(page.locator(".preview-frame--after")).toHaveAttribute("src", new RegExp(encodeURIComponent(body.revision!)), { timeout: 60_000 });
  return body;
}

test("warm runtime renders an edited heading and keeps it selectable", async ({ page, baseURL }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.url().includes("/api/draft-preview"))
      log(`heading-smoke draft-response ${response.request().method()} ${response.status()} ${response.url()}`);
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
  await expect(page.locator("#current-page")).toHaveText(sourcePath, { timeout: 30_000 });

  const source = originalSource.replace(originalHeading, smokeHeading);
  const draft = waitForDraft(page);
  const start = await pasteSource(page, source);
  await draft;

  const frame = page.frameLocator(".preview-frame--after");
  const heading = frame.getByRole("heading", { name: smokeHeading, exact: true });
  await expect(heading).toBeVisible({ timeout: 60_000 });
  await heading.click();
  await expect(page.getByRole("toolbar", { name: "Edit bar", exact: true })).toContainText("Heading");
  const sourceInputToVisibleMs = performance.now() - start;
  log(`heading-smoke sourceInputToVisibleMs=${sourceInputToVisibleMs}`);

  mkdirSync(".scratch/warm-preview", { recursive: true });
  writeFileSync(`.scratch/warm-preview/${testInfo.project.name}-heading-smoke.json`, JSON.stringify({
    sourceInputToVisibleMs,
    heading: smokeHeading,
    note: "Measured from keyboard paste into Monaco role=textbox File source to real warm iframe heading visibility and selectable edit bar.",
  }, null, 2));
  expect(errors).toEqual([]);
});
