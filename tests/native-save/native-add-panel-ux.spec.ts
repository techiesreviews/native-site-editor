import { expect, test, type Page } from "@playwright/test";
import { editorMounted } from "./drafts";

const panel = (page: Page) => page.locator(".pb-add-panel:visible");
async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible();
  await page.getByRole("complementary", { name: "Page structure" }).getByRole("button", { name: "Add", exact: true }).click();
}

// Section component thumbnails show the whole section.
test("section thumbnails show the whole section at the canvas's width, with no code peek", async ({ page, baseURL }) => {
  await open(page, baseURL);
  // Monaco loads after the preview paints: compare against the mounted source.
  await editorMounted(page);
  const before = await page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"));
  const add = panel(page);
  for (const name of [/^Feature block/]) {
    const option = add.getByRole("option", { name });
    await option.scrollIntoViewIfNeeded();
    await expect(option.locator(".pb-thumb")).toHaveClass(/is-ready/);
    await expect.poll(() => option.evaluate((element) => {
      const root = element.querySelector<HTMLElement>(".pb-thumb")!, frame = root.querySelector("iframe")!;
      const section = frame.contentDocument!.querySelector("main")!.firstElementChild!;
      const whole = Math.min(1000, section.getBoundingClientRect().height) * new DOMMatrix(getComputedStyle(frame).transform).a;
      return parseFloat(getComputedStyle(frame).width) >= 640 && root.clientHeight >= Math.floor(whole);
    })).toBe(true);
  }
  await expect(add.getByRole("option", { name: /^(Section|Div|Heading|Paragraph|Image|Button) HTML$/ })).toHaveCount(0);
  await expect(add.locator(".pb-add-panel__code-toggle,.pb-add-item__code,.pb-add-panel__peek")).toHaveCount(0);
  expect(await page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"))).toBe(before);
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
      choices: () => [...nativeElementChoices],
      pointFor: choice => { calls++; if (choice.tag === "native:div") return undefined; return nativeMarkupInsertEdit(effectiveSource, point.parent, point.index, nativeChoiceMarkup(choice.tag)!) ? { ...point } : undefined; },
      preview: tag => { const markup = nativeChoiceMarkup(tag)!; return { markup, doc: `<html><body><main>${markup}</main></body></html>` }; },
      canvasWidth: () => 1000, points: () => [point], defaultPoint: () => point,
      prepare() {}, insert() { inserts++; },
      drag: () => ({ frame: canvas, points: () => [point], target() {}, scroll() {} }),
      dock: () => ({ left: 0, top: 60, bottom: 800, width: 350 }), onState() {},
    });
    view.openDocked();
    Object.assign(window, { addUXProbe: { view, openGap: () => view.openFor(point), calls: () => calls, inserts: () => inserts, reset: () => { calls = 0; }, sourceChanged: () => { effectiveSource = '<img src="blocked.svg">'; }, dispose: () => { view.destroy(); canvas.remove(); } } });
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
  await expect(page.locator(".pb-drag-ghost")).toHaveText("Heading");
  await expect(page.locator(".pb-drag-ghost svg.element-icon")).toHaveAttribute("width", "14");
  await page.evaluate(() => (window as any).addUXProbe.sourceChanged());
  await page.mouse.up();
  await expect(page.locator(".pb-drag-ghost")).toHaveCount(0);
  await expect(add.locator(".pb-add-panel__position")).toContainText("cannot accept Heading");
  expect(await page.evaluate(() => (window as any).addUXProbe.inserts())).toBe(0);
  await expect(heading).toHaveAttribute("aria-disabled", "true");
  await page.evaluate(() => (window as any).addUXProbe.dispose());
});


test("destination warnings follow current pointer or focus and reset for hidden items and new gaps", async ({ page, baseURL }) => {
  await probe(page, baseURL);
  const add = panel(page), div = add.getByRole("option", { name: /^Div HTML$/ });
  const position = add.locator(".pb-add-panel__position"), search = add.getByRole("searchbox");
  await div.hover();
  await expect(position).toContainText("cannot accept Div");
  await page.mouse.move(850, 300);
  await page.evaluate(() => (window as any).addUXProbe.view.retarget());
  await expect(position).toBeHidden();
  await expect(add).not.toHaveClass(/has-no-place/);

  // Leaving the pointer keeps the keyboard's current item active.
  await div.focus();
  await div.dispatchEvent("pointerenter"); await div.dispatchEvent("pointerleave");
  await expect(position).toContainText("cannot accept Div");
  await expect(div).toBeFocused();
  await search.focus();
  await expect(position).toBeHidden();

  // Moving keyboard focus keeps a still-hovered item active.
  await div.focus(); await div.dispatchEvent("pointerenter");
  await search.focus();
  await expect(position).toContainText("cannot accept Div");
  await search.fill("Heading");
  await expect(div).toBeHidden();
  await expect(position).toBeHidden();
  await expect(add).not.toHaveClass(/has-no-place/);

  await search.fill(""); await div.dispatchEvent("pointerenter");
  await expect(position).toContainText("cannot accept Div");
  await page.evaluate(() => { (window as any).addUXProbe.view.close(false); (window as any).addUXProbe.openGap(); });
  await expect(search).toBeFocused();
  await expect(position).toBeHidden();
  await expect(add).not.toHaveClass(/has-no-place/);
  await page.evaluate(() => (window as any).addUXProbe.dispose());
});
