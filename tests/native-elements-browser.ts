// Run with `tsx tests/native-elements-browser.ts`; no repository app/backend required.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
const server = spawn("node_modules/.bin/vite", ["--host", "127.0.0.1", "--port", "5316", "--strictPort"], { stdio: "pipe" });
let output = "";
server.stdout.on("data", (data) => { output += data; });
server.stderr.on("data", (data) => { output += data; });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Vite did not start: ${output}`)), 15000);
    const check = (data: Buffer) => { if (data.toString().includes("5316")) { clearTimeout(timeout); resolve(); } };
    server.stdout.on("data", check);
    server.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`Vite exited ${code}: ${output}`)); });
  });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:5316/tests/fixtures/native-elements-panel.html");
  await page.locator("#open").click();
  const panel = page.getByRole("dialog", { name: "Add to the page" });
  await panel.waitFor({ state: "visible" });
  for (const name of ["Elements", "Layout", "Forms", "More sections"]) assert.equal(await panel.getByRole("group", { name, exact: true }).count(), 1);
  assert.ok((await panel.textContent())?.includes("Inside section, at the end"));
  const search = panel.getByRole("searchbox", { name: "Search elements and components" });
  await search.fill("heading");
  await search.press("ArrowDown");
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), "HeadingHTML");
  await page.keyboard.press("Enter");
  assert.ok((await page.locator("#result").textContent())?.includes("<p>Existing text</p>\n<h2>Heading</h2>"));
  await search.fill("form");
  const form = panel.getByRole("option", { name: "Form HTML", exact: true });
  assert.equal(await form.getAttribute("aria-disabled"), "true");
  const before = await page.locator("#result").textContent();
  await form.click({ force: true });
  assert.equal(await page.locator("#result").textContent(), before);
  await search.fill("iframe");
  await panel.getByRole("option", { name: "Iframe embed HTML", exact: true }).focus();
  // The code peek was removed from the Add panel; it must not come back.
  assert.equal(await panel.locator(".pb-add-panel__peek-code").count(), 0);
  await page.keyboard.press("Escape");
  assert.equal(await panel.isVisible(), false);
  assert.deepEqual(errors, []);
  console.log("PASS native elements leaf: catalogue, search, keyboard insertion, disabled destination, HTML preview, Escape; no host integration assertions.");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await new Promise<void>((resolve) => { if (server.exitCode !== null) resolve(); else server.once("exit", () => resolve()); });
}
