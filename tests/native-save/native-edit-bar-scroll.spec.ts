import { expect, test, type Page } from "@playwright/test";
import { storedDrafts } from "./drafts";
const source = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"));

for (const reducedMotion of ["no-preference", "reduce"] as const) {
async function addressProbe(page: import("@playwright/test").Page, baseURL: string | undefined, marginTop = 150) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.locator(".hero h1")).toBeVisible();
  const source = await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text();
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "index.html", content: source.replace('<p class="lead"', `<a class="probe-link" href="/about/" style="display:block;margin-top:${marginTop}px">Probe address</a><p class="lead"`) } });
  await page.reload();
  await frame.locator(".probe-link").click();
  const bar = page.getByRole("toolbar", { name: "Edit bar" });
  await bar.getByRole("button", { name: "Address", exact: true }).click();
  const popover = page.locator(".edit-bar__popover");
  await expect(popover.getByRole("combobox", { name: "Address", exact: true })).toBeFocused();
  return { frame, bar, popover };
}

test(`an open address popover follows its edit bar during wheel (${reducedMotion})`, async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion });
  const { frame, bar, popover } = await addressProbe(page, baseURL);
  const beforeSource = await source(page), beforeDrafts = await storedDrafts(page);
  const beforeBar = (await bar.boundingBox())!, beforePopover = (await popover.boundingBox())!;
  const box = (await page.locator(".native-preview-frame").boundingBox())!;
  await page.mouse.move(box.x + box.width * .8, box.y + box.height * .6);
  await page.mouse.wheel(0, 60);
  await expect.poll(async () => (await bar.boundingBox())!.y).toBeLessThan(beforeBar.y - 30);
  const afterPopover = (await popover.boundingBox())!;
  const trigger = (await bar.getByRole("button", { name: "Address", exact: true }).boundingBox())!;
  const frameBox = (await page.locator(".native-preview-frame").boundingBox())!;
  const below = trigger.y + trigger.height + 4;
  const expectedTop = below + afterPopover.height <= frameBox.y + frameBox.height - 4
    ? below : Math.max(frameBox.y + 4, trigger.y - 4 - afterPopover.height);
  expect(Math.abs(afterPopover.y - expectedTop)).toBeLessThanOrEqual(1);
  expect(afterPopover.y).not.toBe(beforePopover.y);
  expect(afterPopover.x).toBeGreaterThanOrEqual(frameBox.x);
  expect(afterPopover.x + afterPopover.width).toBeLessThanOrEqual(frameBox.x + frameBox.width);
  await expect(frame.locator(".probe-link")).toBeVisible();
  expect(await source(page)).toBe(beforeSource);
  expect(await storedDrafts(page)).toEqual(beforeDrafts);
});

test(`offscreen address editing keeps a visible keyboard return target (${reducedMotion})`, async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion });
  const { frame, bar, popover } = await addressProbe(page, baseURL);
  const beforeSource = await source(page), beforeDrafts = await storedDrafts(page);
  await frame.locator("html").evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => frame.locator(".probe-link").evaluate(element => element.getBoundingClientRect().bottom)).toBeLessThan(0);
  const input = popover.getByRole("combobox", { name: "Address", exact: true });
  await expect(input).toBeFocused();
  await input.press("Escape");
  await expect(bar.getByRole("button", { name: "Address", exact: true })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Address", exact: true })).toBeFocused();
  const frameBox = (await page.locator(".native-preview-frame").boundingBox())!, barBox = (await bar.boundingBox())!;
  expect(barBox.y).toBeGreaterThanOrEqual(frameBox.y);
  expect(barBox.y + barBox.height).toBeLessThanOrEqual(frameBox.y + frameBox.height);
  await page.locator("#content [role='textbox']").first().focus();
  await expect(bar).toBeHidden();
  await expect(popover).toBeHidden();
  expect(await source(page)).toBe(beforeSource);
  expect(await storedDrafts(page)).toEqual(beforeDrafts);
});

test(`focused closed controls stay in a narrow frame when their target scrolls below it (${reducedMotion})`, async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.emulateMedia({ reducedMotion });
  const { frame, bar, popover } = await addressProbe(page, baseURL, 1200);
  const beforeSource = await source(page), beforeDrafts = await storedDrafts(page);
  await popover.getByRole("combobox", { name: "Address", exact: true }).press("Escape");
  const trigger = bar.getByRole("button", { name: "Address", exact: true });
  await expect(trigger).toBeFocused();
  await frame.locator("html").evaluate(() => window.scrollTo(0, 0));
  const frameBox = (await page.locator(".native-preview-frame").boundingBox())!;
  await expect.poll(() => frame.locator(".probe-link").evaluate(element => element.getBoundingClientRect().top)).toBeGreaterThan(frameBox.height);
  await expect(trigger).toBeVisible();
  await expect(trigger).toBeFocused();
  const barBox = (await bar.boundingBox())!;
  expect(barBox.y).toBeGreaterThanOrEqual(frameBox.y);
  expect(barBox.y + barBox.height).toBeLessThanOrEqual(frameBox.y + frameBox.height);
  await page.locator("#content [role='textbox']").first().focus();
  await expect(bar).toBeHidden();
  expect(await source(page)).toBe(beforeSource);
  expect(await storedDrafts(page)).toEqual(beforeDrafts);
});

}
