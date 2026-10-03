import { expect, test, type Page } from "@playwright/test";

const panel = (page: Page) => page.locator(".pb-add-panel:visible");
async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible();
  await page.getByRole("complementary", { name: "Page structure" }).getByRole("button", { name: "Add", exact: true }).click();
}

test("native thumbnails remain readable and an unavailable Image has an editor-only picture", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const before = await page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"));
  const add = panel(page);
  for (const [name, selector, minimum] of [["Heading", "h2", 16], ["List", "li", 12]] as const) {
    const option = add.getByRole("option", { name: new RegExp(`^${name} HTML$`) });
    await option.scrollIntoViewIfNeeded();
    await expect(option.locator(".pb-thumb")).toHaveClass(/is-ready/);
    const displayedFont = await option.locator("iframe").evaluate((frame: HTMLIFrameElement, selector) => {
      const element = frame.contentDocument!.querySelector(selector)!;
      return parseFloat(frame.contentWindow!.getComputedStyle(element).fontSize) * new DOMMatrix(getComputedStyle(frame).transform).a;
    }, selector);
    expect(displayedFont).toBeGreaterThanOrEqual(minimum);
    await expect(option.locator("iframe")).toHaveCSS("width", "320px");
  }
  const component = add.getByRole("option", { name: /^Feature block/ });
  await component.scrollIntoViewIfNeeded();
  await expect(component.locator(".pb-thumb")).toHaveClass(/is-ready/);
  expect(await component.locator("iframe").evaluate(frame => parseFloat(getComputedStyle(frame).width))).toBeGreaterThanOrEqual(640);
  const image = add.getByRole("option", { name: /^Image HTML$/ });
  await image.scrollIntoViewIfNeeded();
  await expect(image.locator(".pb-add-item__image-fallback svg")).toBeVisible();
  await expect(image.locator(".pb-thumb")).toHaveClass(/has-image-fallback/);
  await expect(add.locator(".pb-add-panel__code-toggle,.pb-add-item__code,.pb-add-panel__peek")).toHaveCount(0);
  expect(await page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"))).toBe(before);
  const grid = add.getByRole("option", { name: /^Grid / });
  await grid.focus();
  await expect(grid).toBeFocused();
  await expect(grid).toHaveCSS("opacity", "0.5");
  await expect(add.locator(".pb-add-panel__position")).toContainText("cannot accept Grid");
  await expect(grid).toContainText("layout CSS integration pending");
});

async function probe(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await page.evaluate(async () => {
    const { createAddPanel } = await import("/src/page-builder/add-panel.ts");
    const { nativeElementChoices, nativeChoiceMarkup } = await import("/src/page-builder/native-elements.ts");
    const { nativeMarkupInsertEdit } = await import("/src/page-builder/native-operations.ts");
    let effectiveSource = "<main></main>", calls = 0, inserts = 0;
    const point = { path: "index.html", parent: [0], index: 0, top: 100, left: 0, width: 400, before: "", tag: "main" };
    const canvas = document.createElement("div"); canvas.id = "add-ux-probe-canvas";
    canvas.style.cssText = "position:fixed;left:700px;top:200px;width:400px;height:400px;z-index:90;background:var(--surface)";
    document.body.append(canvas);
    const view = createAddPanel({
      choices: () => [], extraChoices: () => nativeElementChoices,
      pointFor: choice => { calls++; return nativeMarkupInsertEdit(effectiveSource, point.parent, point.index, nativeChoiceMarkup(choice.tag)!) ? { ...point } : undefined; },
      preview: tag => { const markup = nativeChoiceMarkup(tag)!; return { markup, doc: `<html><body><main>${markup}</main></body></html>` }; },
      canvasWidth: () => 1000, points: () => [point], defaultPoint: () => point,
      prepare() {}, insert() { inserts++; },
      drag: () => ({ frame: canvas, points: () => [point], target() {}, scroll() {} }),
      dock: () => ({ left: 0, top: 60, bottom: 800, width: 350 }), onState() {},
    });
    view.openDocked();
    Object.assign(window, { addUXProbe: { view, calls: () => calls, inserts: () => inserts, reset: () => { calls = 0; }, sourceChanged: () => { effectiveSource = '<img src="blocked.svg">'; }, dispose: () => { view.destroy(); canvas.remove(); } } });
  });
}

test("hover derives only its active destination; changed sources refresh all availability and clicks derive again", async ({ page, baseURL }) => {
  await probe(page, baseURL);
  const add = panel(page), heading = add.getByRole("option", { name: /^Heading HTML$/ });
  await page.evaluate(() => (window as any).addUXProbe.reset());
  await heading.dispatchEvent("pointerenter");
  expect(await page.evaluate(() => (window as any).addUXProbe.calls())).toBe(1);
  await heading.dispatchEvent("pointerenter");
  expect(await page.evaluate(() => (window as any).addUXProbe.calls())).toBe(2);
  await page.evaluate(() => (window as any).addUXProbe.sourceChanged());
  await heading.click();
  expect(await page.evaluate(() => (window as any).addUXProbe.inserts())).toBe(0);
  await expect(add.locator(".pb-add-panel__position")).toContainText("cannot accept Heading");
  await page.evaluate(() => { (window as any).addUXProbe.reset(); (window as any).addUXProbe.view.refresh(); });
  const count = await add.getByRole("option").count();
  expect(await page.evaluate(() => (window as any).addUXProbe.calls())).toBe(count + 1);
  for (const option of await add.getByRole("option").all()) await expect(option).toHaveAttribute("aria-disabled", "true");
  await page.evaluate(() => (window as any).addUXProbe.dispose());
});

test("a refused drag drop explains the destination visibly without inserting", async ({ page, baseURL }) => {
  await probe(page, baseURL);
  const add = panel(page), heading = add.getByRole("option", { name: /^Heading HTML$/ });
  const box = (await heading.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 30); await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 40, { steps: 4 });
  await page.mouse.move(850, 300, { steps: 4 });
  await expect(page.locator(".pb-drag-ghost")).toBeVisible();
  await page.evaluate(() => (window as any).addUXProbe.sourceChanged());
  await page.mouse.up();
  await expect(page.locator(".pb-drag-ghost")).toHaveCount(0);
  await expect(add.locator(".pb-add-panel__position")).toContainText("cannot accept Heading");
  expect(await page.evaluate(() => (window as any).addUXProbe.inserts())).toBe(0);
  await page.evaluate(() => (window as any).addUXProbe.dispose());
});
