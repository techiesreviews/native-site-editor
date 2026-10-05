import { expect, test, type Page } from "@playwright/test";
import { storedDrafts } from "./drafts";

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const source = (page: Page, path: string) => page.evaluate(async path => (await import("/src/components/code-editor.ts")).getMountedSource(path), path);
async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
}

test("preview scrollbar chrome belongs to the viewport, with native inner scrollers", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const content = (await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text()).replace('<p class="lead"', '<div class="probe-scroll" style="height:80px;overflow:auto">' + '<p>Scrollable content</p>'.repeat(20) + '</div><p class="lead"');
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "index.html", content } });
  await page.reload();
  const inner = frame(page).locator(".probe-scroll");
  await expect(inner).toBeVisible();
  expect(await frame(page).locator("html").evaluate(element => getComputedStyle(element).scrollbarWidth)).toBe("thin");
  expect(await inner.evaluate(element => ({ width: getComputedStyle(element).scrollbarWidth, color: getComputedStyle(element).scrollbarColor, scrollable: element.scrollHeight > element.clientHeight }))).toEqual({ width: "auto", color: "auto", scrollable: true });
  const before = await source(page, "index.html"), drafts = await storedDrafts(page);
  await inner.hover();
  await page.mouse.wheel(0, 30);
  await expect.poll(() => inner.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect(await source(page, "index.html")).toBe(before);
  expect(await storedDrafts(page)).toEqual(drafts);
});

test("webkit-only viewport hiding and brand styling remain authored", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const path = "styles/site.css";
  const content = (await (await page.request.get(`${baseURL}/__demo/file?path=${path}`)).text()) + '\n::-webkit-scrollbar{display:none}::-webkit-scrollbar-thumb{background:rgb(34,85,119)}';
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } });
  await page.reload();
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  const style = await frame(page).locator("html").evaluate(element => ({ width: getComputedStyle(element).scrollbarWidth, display: getComputedStyle(element, "::-webkit-scrollbar").display, thumb: getComputedStyle(element, "::-webkit-scrollbar-thumb").backgroundColor }));
  expect(style).toEqual({ width: "auto", display: "none", thumb: "rgb(34, 85, 119)" });
  expect(await (await page.request.get(`${baseURL}/__demo/file?path=${path}`)).text()).toBe(content);
  expect(await storedDrafts(page)).toEqual([]);
});

test("component inline styles keep their authored inner scrollbar", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const path = "components/project-card/project-card.html";
  const content = '<style>.probe-scroll{height:80px;overflow:auto}::-webkit-scrollbar{width:13px}::-webkit-scrollbar-thumb{background:rgb(119,51,85)}</style><article><div class="probe-scroll">' + '<p>Component scroll content</p>'.repeat(20) + '</div></article>';
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } });
  await page.reload();
  const inner = frame(page).locator("project-card .probe-scroll").first();
  await expect(inner).toBeVisible();
  const style = await inner.evaluate(element => ({ width: getComputedStyle(element).scrollbarWidth, color: getComputedStyle(element).scrollbarColor, thumb: getComputedStyle(element, "::-webkit-scrollbar-thumb").backgroundColor }));
  expect(style).toEqual({ width: "auto", color: "auto", thumb: "rgb(119, 51, 85)" });
  expect(await (await page.request.get(`${baseURL}/__demo/file?path=${path}`)).text()).toBe(content);
  expect(await storedDrafts(page)).toEqual([]);
});

const scrollbar = (element: Element) => ({ width: getComputedStyle(element).scrollbarWidth, color: getComputedStyle(element).scrollbarColor });
const filler = (text: string) => `<p>${text}</p>`.repeat(20);

test("universal and zero-specificity site scrollbar rules win, and their colour still inherits", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const css = "styles/site.css", html = "index.html";
  const sheet = (await (await page.request.get(`${baseURL}/__demo/file?path=${css}`)).text()) + "\n*{scrollbar-width:none}:where(.probe-wrap){scrollbar-color:rgb(1, 2, 3) rgb(4, 5, 6)}";
  const markup = (await (await page.request.get(`${baseURL}/__demo/file?path=${html}`)).text()).replace('<p class="lead"', `<div class="probe-wrap"><div class="probe-scroll" style="height:80px;overflow:auto">${filler("Wrapped scroll content")}</div></div><p class="lead"`);
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: css, content: sheet } });
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: html, content: markup } });
  await page.reload();
  const inner = frame(page).locator(".probe-scroll");
  await expect(inner).toBeVisible();
  expect(await frame(page).locator("html").evaluate(scrollbar)).toEqual({ width: "none", color: "auto" });
  expect(await inner.evaluate(scrollbar)).toEqual({ width: "none", color: "rgb(1, 2, 3) rgb(4, 5, 6)" });
  expect(await (await page.request.get(`${baseURL}/__demo/file?path=${css}`)).text()).toBe(sheet);
  expect(await source(page, html)).toBe(markup);
  expect(await storedDrafts(page)).toEqual([]);
});

test("an inline scrollbar colour on the page reaches its nested scroller", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const markup = (await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text()).replace('<p class="lead"', `<div style="scrollbar-color:rgb(7, 8, 9) transparent"><div class="probe-scroll" style="height:80px;overflow:auto">${filler("Inline scroll content")}</div></div><p class="lead"`);
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "index.html", content: markup } });
  await page.reload();
  const inner = frame(page).locator(".probe-scroll");
  await expect(inner).toBeVisible();
  expect(await frame(page).locator("html").evaluate(scrollbar)).toEqual({ width: "auto", color: "auto" });
  expect(await inner.evaluate(scrollbar)).toEqual({ width: "auto", color: "rgb(7, 8, 9) rgba(0, 0, 0, 0)" });
  expect(await source(page, "index.html")).toBe(markup);
  expect(await storedDrafts(page)).toEqual([]);
});

test("a component's internal scroller stays native under the viewport fallback", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const path = "components/project-card/project-card.html";
  const content = `<style>.probe-scroll{height:80px;overflow:auto}</style><article><div class="probe-scroll">${filler("Component scroll content")}</div></article>`;
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } });
  await page.reload();
  const inner = frame(page).locator("project-card .probe-scroll").first();
  await expect(inner).toBeVisible();
  expect(await frame(page).locator("html").evaluate(scrollbar)).toEqual({ width: "thin", color: "rgba(127, 127, 127, 0.4) rgba(0, 0, 0, 0)" });
  expect(await inner.evaluate(scrollbar)).toEqual({ width: "auto", color: "auto" });
  expect(await inner.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  expect(await (await page.request.get(`${baseURL}/__demo/file?path=${path}`)).text()).toBe(content);
  expect(await storedDrafts(page)).toEqual([]);
});

test("adding and undoing an authored scrollbar rule refreshes the viewport fallback", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const html = frame(page).locator("html");
  const thin = { width: "thin", color: "rgba(127, 127, 127, 0.4) rgba(0, 0, 0, 0)" };
  await expect.poll(() => html.evaluate(scrollbar)).toEqual(thin);
  const before = await source(page, "index.html");
  const at = before.indexOf('<p class="lead"');
  expect(at).toBeGreaterThan(0);
  const rule = "<style>::-webkit-scrollbar-thumb{background:rgb(34, 85, 119)}</style>";
  await page.evaluate(async edit => (await import("/src/components/code-editor.ts")).replaceActiveRange(edit), { path: "index.html", start: at, end: at, expected: "", text: rule });
  await expect.poll(() => html.evaluate(scrollbar)).toEqual({ width: "auto", color: "auto" });
  expect(await html.evaluate(element => getComputedStyle(element, "::-webkit-scrollbar-thumb").backgroundColor)).toBe("rgb(34, 85, 119)");
  expect(await source(page, "index.html")).toBe(before.slice(0, at) + rule + before.slice(at));
  await page.evaluate(async () => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "index.html"));
  await expect.poll(() => source(page, "index.html")).toBe(before);
  await expect.poll(() => html.evaluate(scrollbar)).toEqual(thin);
});
