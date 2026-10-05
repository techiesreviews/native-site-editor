import { expect, test, type Page } from "@playwright/test";
import { storedDrafts } from "./drafts";

const templatePath = "components/project-card/project-card.html";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const source = (page: Page, path: string) => page.evaluate(async path => (await import("/src/components/code-editor.ts")).getMountedSource(path), path);

async function openShadowScroller(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  const content = '<article class="project-card"><div class="probe-shadow-scroll" style="height:160px;overflow:auto"><div style="width:1000px"><p class="probe-shadow-target" style="margin-top:80px;margin-left:80px;width:120px">Shadow target</p>' + '<p>Shadow filler</p>'.repeat(40) + '</div></div></article>';
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: templatePath, content } });
  await page.reload();
  await selectTemplateText(page);
}

async function selectTemplateText(page: Page) {
  await frame(page).locator(".probe-shadow-target").first().click();
  if (await page.locator("#current-page").getAttribute("data-path") !== templatePath) {
    await bar(page).getByRole("button", { name: "Edit Project card component", exact: true }).click();
  }
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", templatePath);
  await frame(page).locator(".probe-shadow-target").first().click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
}

async function scrollAndTrack(page: Page, horizontal: boolean) {
  const scroller = frame(page).locator(".probe-shadow-scroll").first();
  const target = frame(page).locator(".probe-shadow-target").first();
  await scroller.hover({ position: { x: 10, y: 100 } });
  const beforeTarget = (await target.boundingBox())!, beforeBar = (await bar(page).boundingBox())!;
  await page.mouse.wheel(horizontal ? 30 : 0, horizontal ? 0 : 30);
  await expect.poll(() => scroller.evaluate((element, horizontal) => horizontal ? element.scrollLeft : element.scrollTop, horizontal)).toBe(30);
  const axis = horizontal ? "x" : "y";
  await expect.poll(async () => {
    const afterTarget = (await target.boundingBox())!, afterBar = (await bar(page).boundingBox())!;
    return Math.abs((afterBar[axis] - beforeBar[axis]) - (afterTarget[axis] - beforeTarget[axis]));
  }).toBeLessThanOrEqual(1);
  expect((await target.boundingBox())![axis]).toBeCloseTo(beforeTarget[axis] - 30, 0);
}

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  for (const horizontal of [false, true]) {
    test(`shadow-root ${horizontal ? "horizontal" : "vertical"} scrolling tracks selected text (${reducedMotion})`, async ({ page, baseURL }) => {
      await page.emulateMedia({ reducedMotion });
      await openShadowScroller(page, baseURL);
      const beforeSource = await source(page, templatePath), beforeDrafts = await storedDrafts(page);
      await scrollAndTrack(page, horizontal);
      expect(await source(page, templatePath)).toBe(beforeSource);
      expect(await storedDrafts(page)).toEqual(beforeDrafts);
    });
  }
}

test("shadow scroll tracking survives template rerenders and replacement instances", async ({ page, baseURL }) => {
  await openShadowScroller(page, baseURL);
  await frame(page).locator(".probe-shadow-scroll").first().evaluate(element => {
    (document.documentElement as HTMLElement & { probeRoot?: Node }).probeRoot = element.getRootNode();
  });
  const before = (await source(page, templatePath))!;
  await page.evaluate(async ({ path, before }) => {
    (await import("/src/components/code-editor.ts")).replaceActiveRange({ path, start: before.length, end: before.length, text: "\n<!-- rerender -->", expected: "" });
  }, { path: templatePath, before });
  await expect.poll(() => source(page, templatePath)).toBe(`${before}\n<!-- rerender -->`);
  expect(await frame(page).locator(".probe-shadow-scroll").first().evaluate(element => element.getRootNode() === (document.documentElement as HTMLElement & { probeRoot?: Node }).probeRoot)).toBe(true);
  const changedSource = await source(page, templatePath), drafts = await storedDrafts(page);
  await scrollAndTrack(page, false);
  await frame(page).getByRole("link", { name: "About", exact: true }).click({ modifiers: ["ControlOrMeta"] });
  await expect(frame(page).locator(".probe-shadow-scroll")).toHaveCount(0);
  expect(await frame(page).locator("html").evaluate(element => !(element as HTMLElement & { probeRoot: ShadowRoot }).probeRoot.host.isConnected)).toBe(true);
  await frame(page).getByRole("link", { name: "Home", exact: true }).click({ modifiers: ["ControlOrMeta"] });
  await expect(frame(page).locator(".probe-shadow-scroll")).toHaveCount(3);
  expect(await frame(page).locator(".probe-shadow-scroll").first().evaluate(element => element.getRootNode() !== (document.documentElement as HTMLElement & { probeRoot?: Node }).probeRoot)).toBe(true);
  await selectTemplateText(page);
  await scrollAndTrack(page, false);
  expect(await source(page, templatePath)).toBe(changedSource);
  expect(await storedDrafts(page)).toEqual(drafts);
});
