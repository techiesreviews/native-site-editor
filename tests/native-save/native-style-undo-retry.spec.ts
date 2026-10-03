import { test, expect } from "@playwright/test";

// Exercise source ownership and asynchronous widget failures without a network write.
test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible();
  await page.evaluate(async () => {
    const { createStylePanel } = await import("/src/components/style-panel.ts");
    const { writeCssProperties } = await import("/src/page-builder/css-write.ts");
    let source = ".item { padding-top: 0px; object-position: 50% 50%; }";
    const undo: string[] = [];
    let writes = 0, race = false, delayAsset = false, historyRace = false;
    const host = document.createElement("main");
    host.style.cssText = "position:fixed;inset:0;background:white;z-index:1000;display:grid";
    host.className = "has-preview"; host.id = "retry-host"; document.body.append(host);
    const context = () => ({ key: "retry", selectionKey: "item", tag: "img", className: "item", classes: ["item"], target: { path: "test.css", selector: ".item", start: 0 }, files: { "test.css": source, "unused.css": ".item { object-position: 5% 5% !important; }" }, matchedRules: [{ path: "test.css", selector: ".item", ruleIndex: 0, declarations: [{ property: "object-position", value: "50% 50%", important: false }] }], computed: {} });
    const view = createStylePanel({ context,
      async write(properties) {
        undo.push(source); writes++;
        source = writeCssProperties(source, { selector: ".item", baseStart: 0 }, properties);
        if (race) { race = false; source += "\n.external { color: red; }"; view.update(); await Promise.resolve(); }
      },
      history: async () => { source = undo.pop() ?? source; view.update(); await Promise.resolve(); if (historyRace) { source += "\n.agent-during-history { color: green; }"; view.update(); } },
      focalAsset: async () => { if (delayAsset) await new Promise(resolve => setTimeout(resolve, 150)); return { mode: "object-position" as const, asset: { hostTrusted: true, dataURL: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3C/svg%3E" } }; },
      variable: async () => {}, selectClass: () => {}, addClass: async () => {},
      showCode: async () => {}, error: message => { host.dataset.error = message; },
    }, host);
    host.append(view.root); (view.root.querySelector(".style-panel__opener") as HTMLButtonElement).click();
    Object.assign(window, { retry: {
      source: () => source, writes: () => writes,
      historyRace: () => { historyRace = true; },
      race: (delayed = false) => { race = true; delayAsset = delayed; },
      external: () => { source += "\n.agent { color: blue; }"; view.update(); },
    } });
  });
});

test("focused Enter retries previous and new values after Undo, blur deduplicates, Alt edits can return", async ({ page }) => {
  const panel = page.locator("#retry-host .style-panel");
  await panel.getByRole("searchbox").fill("padding top");
  const field = panel.getByRole("textbox", { name: "Padding top", exact: true });
  await field.fill("19"); await field.press("Enter");
  await expect.poll(() => page.evaluate(() => (window as any).retry.writes())).toBe(1);
  await field.press("Tab");
  await expect.poll(() => page.evaluate(() => (window as any).retry.writes())).toBe(1);
  await expect(panel).not.toHaveAttribute("aria-busy", "true");
  await field.focus(); await field.press("ControlOrMeta+Z");
  await expect.poll(() => page.evaluate(() => (window as any).retry.source())).toContain("padding-top: 0px");
  await expect(field).toBeFocused(); await expect(field).toHaveValue("19px");
  await field.press("Enter");
  await expect.poll(() => page.evaluate(() => (window as any).retry.source())).toContain("padding-top: 19px");
  await field.press("ControlOrMeta+Z"); await field.fill("23"); await field.press("Enter");
  await expect.poll(() => page.evaluate(() => (window as any).retry.source())).toContain("padding-top: 23px");
  await field.fill("19"); await field.press("Enter");
  await field.press("Alt+ArrowUp");
  await expect.poll(() => page.evaluate(() => (window as any).retry.source())).toContain("padding-top: 20px");
  await field.fill("19"); await field.press("Enter");
  await expect.poll(() => page.evaluate(() => (window as any).retry.source())).toContain("padding-top: 19px");
  const box = await field.boundingBox(); if (!box) throw new Error("Missing scrub field");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 6, box.y + box.height / 2); await page.mouse.up();
  await expect.poll(() => page.evaluate(() => (window as any).retry.source())).toContain("padding-top: 25px");
  await field.fill("19"); await field.press("Enter");
  await expect.poll(() => page.evaluate(() => (window as any).retry.source())).toContain("padding-top: 19px");
  await page.evaluate(() => (window as any).retry.external());
  await field.fill("27"); await field.press("Enter");
  await expect(page.locator("#retry-host")).toHaveAttribute("data-error", /style target changed/);
  expect(await page.evaluate(() => (window as any).retry.source())).not.toContain("padding-top: 27px");
});

test("focal landed write plus external race keeps truthful error and fresh retry without stealing focus", async ({ page }) => {
  const panel = page.locator("#retry-host .style-panel");
  await panel.getByRole("searchbox").fill("image focus");
  const x = panel.getByLabel("X (%)", { exact: true });
  await x.fill("61"); await page.evaluate(() => (window as any).retry.race()); await x.press("Enter");
  await expect(page.locator("#retry-host")).toHaveAttribute("data-error", /source changed after your edit/);
  await expect.poll(() => page.evaluate(() => (window as any).retry.source())).toContain("object-position: 61% 50%");
  await expect(x).toBeFocused(); await expect(x).toBeEnabled();
  await x.fill("62"); await x.press("Enter");
  await expect.poll(() => page.evaluate(() => (window as any).retry.source())).toContain("object-position: 62% 50%");
  await page.evaluate(() => (window as any).retry.race(true));
  await x.fill("63"); await x.press("Enter");
  await panel.getByRole("textbox", { name: "Class name", exact: true }).focus();
  await expect(x).toBeEnabled();
  await expect(panel.getByRole("textbox", { name: "Class name", exact: true })).toBeFocused();
  await x.fill("64"); await x.press("Enter");
  await expect.poll(() => page.evaluate(() => (window as any).retry.source())).toContain("object-position: 64% 50%");
});

test("an external edit during asynchronous Undo cannot refresh the captured focused field", async ({ page }) => {
  const panel = page.locator("#retry-host .style-panel");
  await panel.getByRole("searchbox").fill("padding top");
  const field = panel.getByRole("textbox", { name: "Padding top", exact: true });
  await field.fill("19"); await field.press("Enter");
  await expect.poll(() => page.evaluate(() => (window as any).retry.source())).toContain("padding-top: 19px");
  await page.evaluate(() => (window as any).retry.historyRace());
  await field.press("ControlOrMeta+Z");
  await expect.poll(() => page.evaluate(() => (window as any).retry.source())).toContain(".agent-during-history");
  await field.fill("27"); await field.press("Enter");
  await expect(page.locator("#retry-host")).toHaveAttribute("data-error", /style target changed/);
  expect(await page.evaluate(() => (window as any).retry.source())).not.toContain("padding-top: 27px");
});

test("an unlinked important stylesheet in the source map does not block focal edits", async ({ page }) => {
  const panel = page.locator("#retry-host .style-panel");
  await panel.getByRole("searchbox").fill("image focus");
  const x = panel.getByLabel("X (%)", { exact: true });
  await x.fill("42"); await x.press("Enter");
  await expect.poll(() => page.evaluate(() => (window as any).retry.source())).toContain("object-position: 42% 50%");
  await expect(page.locator("#retry-host")).not.toHaveAttribute("data-error", /important image position/);
});

test("Enter then blur deduplicates the same accepted important value", async ({ page }) => {
  const panel = page.locator("#retry-host .style-panel");
  await panel.getByRole("searchbox").fill("padding top");
  const field = panel.getByRole("textbox", { name: "Padding top", exact: true });
  await field.fill("19px !important"); await field.press("Enter");
  await expect.poll(() => page.evaluate(() => (window as any).retry.source())).toContain("padding-top: 19px !important");
  await field.press("Tab");
  await expect.poll(() => page.evaluate(() => (window as any).retry.writes())).toBe(1);
});
