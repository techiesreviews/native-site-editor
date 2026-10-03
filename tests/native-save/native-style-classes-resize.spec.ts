import { test, expect, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";
const panel = (page: Page) => page.getByRole("complementary", { name: "Style panel" });
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const chip = (page: Page, name: string) => panel(page).getByRole("button", { name: `Style class ${name}`, exact: true });
async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".lead")).toBeVisible();
  await expect(page.locator("#status")).toContainText("Up to date with main");
  await expect.poll(async () => typeof await source(page)).toBe("string");
}
async function setClasses(page: Page, value: string) {
  return page.evaluate(async value => {
    const path = "/src/components/code-editor.ts", api = await import(path);
    const source = api.getMountedSource("index.html") as string;
    const expected = 'class="lead"', start = source.indexOf(expected);
    if (start < 0) throw new Error("Fixture class is missing");
    api.replaceActiveRange({ path: "index.html", start, end: start + expected.length, expected, text: `class='${value}'` });
    const after = source.replace(expected, `class='${value}'`);
    if (api.getMountedSource("index.html") !== after) throw new Error("Fixture class edit failed");
    return after;
  }, value);
}
async function source(page: Page) { return page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html") as string); }
async function select(page: Page) {
  await frame(page).locator(".lead").click();
  await page.getByRole("separator", { name: "Resize Style panel", exact: true }).click();
}

test("all decoded classes select one escaped CSS rule; add preserves tokens and attributes with one Undo", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const before = await setClasses(page, "lead  hero&#38;title café keep");
  await select(page);
  for (const name of ["lead", "hero&title", "café", "keep"]) await expect(chip(page, name)).toBeVisible();
  await chip(page, "hero&title").focus(); await page.keyboard.press("Enter");
  await expect(chip(page, "hero&title")).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, "hero&title")).toBeFocused();
  await expect(panel(page).locator(".style-panel__selector")).toHaveText(".hero\\&title");
  await expect(panel(page).locator(".style-panel__path")).toHaveText("styles/site.css");
  await panel(page).getByRole("textbox", { name: "Padding top", exact: true }).fill("11px");
  await panel(page).getByRole("textbox", { name: "Padding top", exact: true }).press("Enter");
  await expect.poll(async () => (await storedDraft(page, "styles/site.css"))?.content ?? "").toContain(".hero\\&title {\n  padding-top: 11px;");
  await panel(page).getByRole("textbox", { name: "Class name" }).fill("lead");
  await panel(page).getByRole("button", { name: "Add class", exact: true }).click();
  expect(await source(page)).toBe(before); // Duplicate must retain original quotes and escaped bytes.
  await panel(page).getByRole("textbox", { name: "Class name" }).fill("extra:class");
  await panel(page).getByRole("button", { name: "Add class", exact: true }).click();
  await expect(chip(page, "extra:class")).toHaveAttribute("aria-pressed", "true");
  const after = await source(page);
  expect(after).toBe(before.replace("class='lead  hero&#38;title café keep'", "class='lead  hero&#38;title café keep extra:class'"));
  expect(after).toContain('data-key="hero-lead"'); expect(after).not.toContain("&amp;amp;");
  await panel(page).getByRole("button", { name: "Link padding sides" }).focus(); await page.keyboard.press("ControlOrMeta+Z");
  await expect.poll(() => source(page)).toBe(before);
  await expect(frame(page).locator(".lead")).not.toHaveClass(/extra:class/);
});

test("active chip preserves media/state and CSS writes only that class, including a non-breaking-space token", async ({ page, baseURL }) => {
  await open(page, baseURL); await setClasses(page, "lead second spaced\u00a0token"); await select(page);
  await panel(page).getByRole("combobox", { name: "Style breakpoint" }).selectOption("tablet");
  await panel(page).getByRole("combobox", { name: "Style state" }).selectOption(":hover");
  await chip(page, "second").click();
  await expect(panel(page).getByRole("combobox", { name: "Style breakpoint" })).toHaveValue("tablet");
  await expect(panel(page).getByRole("combobox", { name: "Style state" })).toHaveValue(":hover");
  await panel(page).getByRole("textbox", { name: "Padding top", exact: true }).fill("29px");
  await panel(page).getByRole("textbox", { name: "Padding top", exact: true }).press("Enter");
  await expect.poll(async () => (await storedDraft(page, "styles/site.css"))?.content ?? "").toMatch(/@media \(max-width: 768px\) \{\s*\.second:hover \{\s*padding-top: 29px;/);
  await chip(page, "spaced\u00a0token").click();
  await expect(panel(page).locator(".style-panel__selector")).toHaveText(".spaced\u00a0token");
  for (const value of ["23px", "31px"]) {
    await panel(page).getByRole("textbox", { name: "Padding top", exact: true }).fill(value);
    await panel(page).getByRole("textbox", { name: "Padding top", exact: true }).press("Enter");
    await expect.poll(async () => (await storedDraft(page, "styles/site.css"))?.content ?? "").toContain(`.spaced\u00a0token:hover {\n    padding-top: ${value};`);
  }
});

test("detached class chips and Add callbacks cannot change a new selection or changed source", async ({ page, baseURL }) => {
  await open(page, baseURL); await select(page);
  await chip(page, "lead").evaluate(button => { (window as any).oldStyleChip = button; });
  await panel(page).locator(".style-panel__add-class").evaluate(form => { (window as any).oldStyleForm = form; });
  await frame(page).locator("section.cards").evaluate(element => (element as HTMLElement).click());
  const before = await source(page);
  await page.evaluate(() => { (window as any).oldStyleChip.click(); const form = (window as any).oldStyleForm as HTMLFormElement; form.querySelector<HTMLInputElement>("input")!.value = "wrong-class"; form.dispatchEvent(new Event("submit", { cancelable: true })); });
  await expect(page.locator("#notice")).toContainText("The style target changed");
  expect(await source(page)).toBe(before);
  await expect(chip(page, "cards")).toHaveAttribute("aria-pressed", "true");
});

test("Style splitter drags, folds, restores and persists one width through keyboard and Escape", async ({ page, baseURL }) => {
  await open(page, baseURL); await select(page);
  const handle = page.getByRole("separator", { name: "Resize Style panel", exact: true });
  await expect(handle).toHaveAttribute("aria-valuenow", "280");
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2, { steps: 5 }); await page.mouse.up();
  await expect(handle).toHaveAttribute("aria-valuenow", "340");
  await handle.click(); await expect(handle).toHaveAttribute("aria-valuenow", "0");
  await handle.press("Enter"); await expect(handle).toHaveAttribute("aria-valuenow", "340");
  await handle.press("ArrowRight"); await expect(handle).toHaveAttribute("aria-valuenow", "330");
  await handle.press("Shift+ArrowLeft"); await expect(handle).toHaveAttribute("aria-valuenow", "370");
  await handle.press("Home"); await expect(handle).toHaveAttribute("aria-valuenow", "0");
  await page.getByRole("separator", { name: "Resize Style panel", exact: true }).click(); await expect(handle).toHaveAttribute("aria-valuenow", "370");
  await panel(page).getByRole("textbox", { name: "Padding top", exact: true }).focus(); await page.keyboard.press("Escape");
  await expect(handle).toHaveAttribute("aria-valuenow", "0");
  await handle.press("Space"); await expect(handle).toHaveAttribute("aria-valuenow", "370");
  await page.reload(); await expect(frame(page).locator(".lead")).toBeVisible();
  await expect(handle).toHaveAttribute("aria-valuenow", "370");
  await handle.press("End"); await expect(handle).toHaveAttribute("aria-valuenow", await handle.getAttribute("aria-valuemax") ?? "");
});

test("narrow widths clamp the dock and preserve canvas space without page overflow in both themes", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await open(page, baseURL); await select(page);
  const handle = page.getByRole("separator", { name: "Resize Style panel", exact: true });
  await handle.press("End");
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    const sizes = await page.locator("#main").evaluate(element => ({ main: element.clientWidth, panel: element.querySelector(".style-panel")!.getBoundingClientRect().width, preview: element.querySelector(".preview-pane")!.getBoundingClientRect().width, doc: document.documentElement.scrollWidth, viewport: innerWidth }));
    expect(sizes.panel).toBeLessThanOrEqual(sizes.main * .6 + 1); expect(sizes.preview).toBeGreaterThan(0); expect(sizes.doc).toBeLessThanOrEqual(sizes.viewport);
    await expect(panel(page).locator(".style-panel__selector")).toBeVisible();
  }
});

for (const attribute of ["class=", "class", "class = "]) {
  test(`adding a class safely fills empty ${JSON.stringify(attribute)} without changing other source`, async ({ page, baseURL }) => {
    await open(page, baseURL);
    const before = await page.evaluate(async attribute => {
      const api = await import("/src/components/code-editor.ts");
      const source = api.getMountedSource("index.html") as string;
      const expected = '<p class="lead" data-key="hero-lead">', start = source.indexOf(expected);
      const text = `<p data-key="hero-lead" ${attribute}>`;
      api.replaceActiveRange({ path: "index.html", start, end: start + expected.length, expected, text });
      const after = source.replace(expected, text);
      if (api.getMountedSource("index.html") !== after) throw new Error("Fixture edit failed");
      return after;
    }, attribute);
    await frame(page).locator('.hero p').click();
    await page.getByRole("separator", { name: "Resize Style panel", exact: true }).click();
    await panel(page).getByRole("textbox", { name: "Class name" }).fill("new");
    await panel(page).getByRole("button", { name: "Add class", exact: true }).click();
    const expected = attribute.includes("=") ? `${attribute}"new"` : `${attribute}="new"`;
    await expect.poll(() => source(page)).toBe(before.replace(`<p data-key="hero-lead" ${attribute}>`, `<p data-key="hero-lead" ${expected}>`));
    await expect(chip(page, "new")).toHaveAttribute("aria-pressed", "true");
    await panel(page).getByRole("textbox", { name: "Class name" }).press("ControlOrMeta+Z");
    await expect.poll(() => source(page)).toBe(before);
  });
}
