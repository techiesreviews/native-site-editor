import { test, expect, type Page } from "@playwright/test";
import { openPickerOn } from "./open-picker";
import { imageResult } from "../../src/page-builder/image-sizes";
import { readFrameMessage } from "../../src/components/preview-protocol";
import { HOST_SOURCE, FRAME_SOURCE } from "../../src/components/preview-wire";

async function measure(page: Page, request: { path: string; node: number[]; image?: { width: number; height: number }; style?: string }) {
  // fixed-wait: Timeout bounds a missing protocol reply; the test resolves on the observable message, with no sleep.
  const raw = await page.evaluate(({ host, frame, request }) => new Promise<unknown>((resolve, reject) => {
    const preview = document.querySelector<HTMLIFrameElement>(".native-preview-frame");
    if (!preview?.contentWindow) { reject(new Error("Missing preview")); return; }
    const id = 10000000;
    const timeout = setTimeout(() => { window.removeEventListener("message", receive); reject(new Error("Image measurement did not answer")); }, 8000);
    function receive(event: MessageEvent) {
      if (event.source !== preview?.contentWindow || event.data?.source !== frame || event.data?.type !== "image-measured" || event.data?.id !== id) return;
      clearTimeout(timeout);
      window.removeEventListener("message", receive);
      resolve(event.data);
    }
    window.addEventListener("message", receive);
    preview.contentWindow.postMessage({ source: host, type: "measure-image", id, request }, "*");
  }), { host: HOST_SOURCE, frame: FRAME_SOURCE, request });
  const reply = readFrameMessage(raw);
  expect(reply?.type).toBe("image-measured");
  if (reply?.type !== "image-measured") throw new Error(JSON.stringify(reply));
  return reply.report;

}

// Default fixture group: native-starter. Untagged measurement coverage runs nightly.
test("preview measures a responsive starter hero without resizing the visible frame", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main");
  const preview = page.frameLocator(".native-preview-frame");
  const hero = preview.locator("img.hero-image");
  await expect(hero).toBeVisible();
  await expect.poll(() => hero.evaluate((image) => image instanceof HTMLImageElement && image.naturalWidth)).toBeGreaterThan(0);
  // Starter's placeholder has a fixed 160px width. Give this draft a
  // responsive layout and a nested site breakpoint; leave the fixture intact.
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const text = editor.getMountedSource("index.html");
    if (text === undefined) throw new Error("Missing page model");
    editor.replaceActiveRange({ path: "index.html", start: text.indexOf("</body>"), end: text.indexOf("</body>"), expected: "", text: "\n<style>#page .hero-image{width:100%;height:auto}@supports(display:grid){@media(min-width:900px){#page .hero-image{width:80%}}}</style>" });
  });
  await expect.poll(() => hero.evaluate((image) => parseFloat(getComputedStyle(image).width))).toBeGreaterThan(160);
  const before = await hero.evaluate(() => ({ width: innerWidth, height: innerHeight, x: scrollX, y: scrollY }));
  const report = await measure(page, { path: "index.html", node: [1, 0, 2] });
  if ("error" in report) throw new Error(report.error);
  const result = imageResult(report.facts);
  expect(result.widths.map(({ viewport }) => viewport)).toEqual(expect.arrayContaining([390, 768, 899, 900, 1280]));
  const width = (viewport: number) => result.widths.find((item) => item.viewport === viewport)?.width ?? 0;
  expect(width(390)).toBeGreaterThan(300);
  expect(width(768)).toBeGreaterThan(width(390));
  expect(width(1280)).toBeGreaterThan(width(768));
  expect(width(899)).toBeGreaterThan(width(900));
  expect(result.sizes).toMatch(/^(?:\(max-width: \d+(?:\.\d+)?px\) [1-9]\d*(?:px|vw), )*[1-9]\d*(?:px|vw)$/);
  expect(result.firstScreen).toBe(true);
  expect(await hero.evaluate(() => ({ width: innerWidth, height: innerHeight, x: scrollX, y: scrollY }))).toEqual(before);
  await expect(preview.locator("iframe")).toHaveCount(0);
});


test("preview measures a cover content box and reports a missing image without hanging", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main");
  const preview = page.frameLocator(".native-preview-frame");
  const hero = preview.locator("img.hero-image");
  await expect(hero).toBeVisible();
  await expect.poll(() => hero.evaluate((image) => image instanceof HTMLImageElement && image.naturalWidth)).toBeGreaterThan(0);
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const text = editor.getMountedSource("index.html");
    if (text === undefined) throw new Error("Missing page model");
    const at = text.indexOf("</body>");
    editor.replaceActiveRange({ path: "index.html", start: at, end: at, expected: "", text: "<style>#page .hero-image{box-sizing:border-box;width:340px;height:440px;padding:10px;border:10px solid;object-fit:cover}</style>" });
  });
  await expect.poll(() => hero.evaluate((image) => getComputedStyle(image).objectFit)).toBe("cover");
  const report = await measure(page, { path: "index.html", node: [1, 0, 2] });
  if ("error" in report) throw new Error(report.error);
  expect(report.facts.every((fact) => fact.width === 300 && fact.height === 400)).toBe(true);
  const result = imageResult(report.facts);
  expect(result.sizes).toBe("712px");
  expect(result.widths.every(({ width }) => Math.abs(width - 320 * 400 / 180) < 0.01)).toBe(true);
  expect(await measure(page, { path: "index.html", node: [99] })).toEqual({ error: "No image at the requested node." });
  await expect(preview.locator("iframe")).toHaveCount(0);
});

test("preview measures range-syntax breakpoints and keeps an embed's space above the image", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main");
  const preview = page.frameLocator(".native-preview-frame");
  const hero = preview.locator("img.hero-image");
  await expect(hero).toBeVisible();
  await expect.poll(() => hero.evaluate((image) => image instanceof HTMLImageElement && image.naturalWidth)).toBeGreaterThan(0);
  // A 1,000px embed before the hero puts it below the first screen at every
  // width; only a range-syntax query narrows the image above 900px.
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const text = editor.getMountedSource("index.html");
    if (text === undefined) throw new Error("Missing page model");
    const style = "\n<style>#page .hero-image{width:100%;height:auto}@media (width > 900px){#page .hero-image{width:50%}}</style>";
    const at = text.indexOf("</body>");
    editor.replaceActiveRange({ path: "index.html", start: at, end: at, expected: "", text: style });
    const next = editor.getMountedSource("index.html") ?? "";
    const before = next.indexOf("<h1 data-key=\"hero-title\">");
    editor.replaceActiveRange({ path: "index.html", start: before, end: before, expected: "", text: "<iframe title=\"Embed\" style=\"display:block;width:100%;height:1000px;border:0\"></iframe>\n    " });
  });
  await expect(preview.locator("section.hero iframe")).toHaveCount(1);
  await expect.poll(() => hero.evaluate((image) => getComputedStyle(image).height)).not.toBe("auto");
  const report = await measure(page, { path: "index.html", node: [1, 0, 3] });
  if ("error" in report) throw new Error(report.error);
  const result = imageResult(report.facts);
  const width = (viewport: number) => result.widths.find((item) => item.viewport === viewport)?.width ?? 0;
  expect(result.widths.map(({ viewport }) => viewport)).toEqual(expect.arrayContaining([900, 901]));
  expect(width(901)).toBeLessThan(width(900));
  expect(report.facts.every((fact) => fact.top >= 1000)).toBe(true);
  expect(result.firstScreen).toBe(false);
  await expect(preview.locator("section.hero iframe")).toHaveCount(1);
});

test("the measuring copy places the image where the preview does, with an unfilled component above it", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main");
  const preview = page.frameLocator(".native-preview-frame");
  const hero = preview.locator("img.hero-image");
  await expect(hero).toBeVisible();
  await expect.poll(() => hero.evaluate((image) => image instanceof HTMLImageElement && image.naturalWidth)).toBeGreaterThan(0);
  // A breakpoint at the visible preview's own width makes the copy measure at that width too.
  const shownWidth = await hero.evaluate(() => innerWidth);
  const edit = (marker: string, text: string) => page.evaluate(async ({ marker, text }) => {
    const editor = await import("/src/components/code-editor.ts");
    const source = editor.getMountedSource("index.html") ?? "";
    const at = source.indexOf(marker);
    editor.replaceActiveRange({ path: "index.html", start: at, end: at, expected: "", text });
  }, { marker, text });
  await edit("</body>", `\n<style>@media (min-width: ${shownWidth}px){#page{--measure:1}}</style>`);
  const matches = async (node: number[]) => {
    const shown = await hero.evaluate((image) => image.getBoundingClientRect().top + scrollY);
    const report = await measure(page, { path: "index.html", node });
    if ("error" in report) throw new Error(report.error);
    const fact = report.facts.find((item) => item.viewport === shownWidth);
    expect(fact).toBeDefined();
    expect(Math.abs((fact?.top ?? 0) - shown)).toBeLessThanOrEqual(1);
  };
  await expect.poll(() => hero.evaluate((image) => getComputedStyle(image.closest("#page") ?? image).getPropertyValue("--measure").trim())).toBe("1");
  await matches([1, 0, 2]);
  // A card with every slot empty: the preview hides its empty parts, and so must the copy.
  await edit("<h1 data-key=\"hero-title\">", "<project-card data-key=\"empty-card\"></project-card>\n    ");
  const card = preview.locator("section.hero project-card");
  await expect(card).toHaveCount(1);
  await expect.poll(() => card.evaluate((el) => Boolean(el.shadowRoot?.querySelector("[data-native-empty]")))).toBe(true);
  await matches([1, 0, 3]);
});

// Default fixture group. The picker prepares a raster with real responsive copies.
test("placed hero and lower image use measured responsive markup and load on the canvas", { tag: "@smoke" }, async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main");
  const preview = page.frameLocator(".native-preview-frame"), hero = preview.locator("img.hero-image");
  await expect(hero).toBeVisible();
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts"), source = editor.getMountedSource("index.html")!;
    const at = source.indexOf("</body>");
    editor.replaceActiveRange({ path: "index.html", start: at, end: at, expected: "", text: '<style>#page .hero-image{box-sizing:content-box;width:200px;height:200px;padding:20px;object-fit:cover}.lower-image{width:80%;height:auto}</style><section style="margin-top:1500px"><img class="lower-image" src="/images/placeholder.svg"></section>' });
  });
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 1800; canvas.height = 900;
    const context = canvas.getContext("2d")!, pixels = context.createImageData(canvas.width, canvas.height);
    let seed = 123;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels.data[i] = seed & 255; pixels.data[i + 1] = seed >>> 8 & 255; pixels.data[i + 2] = seed >>> 16 & 255; pixels.data[i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
  });
  const picker = page.getByRole("dialog", { name: "Choose image", exact: true });
  const choose = async (selector: string) => {
    await openPickerOn(page, preview.locator(selector));
    await expect(picker.getByRole("button", { name: "Choose images/placeholder.svg", exact: true })).toBeVisible();
  };
  await choose("img.hero-image");
  await picker.locator('input[name="media-upload"]').setInputFiles({ name: "Markup.jpg", mimeType: "image/jpeg", buffer: Buffer.from(bytes, "base64") });
  await expect(picker.getByRole("button", { name: "Choose Markup.jpg", exact: true })).toHaveAttribute("aria-pressed", "true");
  await picker.getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker).toBeHidden();
  const source = () => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")!);
  const heroMarkup = () => source().then(text => text.match(/<img\b[^>]*class="hero-image"[^>]*>/)![0]);
  // The content is 40,000px²; its rendered box including padding is 57,600px².
  await expect.poll(heroMarkup).toContain('fetchpriority="high"');
  expect(await heroMarkup()).toMatch(/srcset="[^"]+480w/);
  expect(await heroMarkup()).toMatch(/sizes="(?!auto)[^"]+"/);
  expect(await heroMarkup()).toContain('width="1800"'); expect(await heroMarkup()).toContain('height="900"');
  expect(await heroMarkup()).not.toContain('loading=');
  await expect.poll(() => hero.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const beforeLower = await source();
  await choose("img.lower-image");
  await picker.getByRole("button", { name: "Choose media/images/markup.webp", exact: true }).click();
  await picker.getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker).toBeHidden();
  const lower = preview.locator("img.lower-image");
  await expect(lower).toHaveAttribute("loading", "lazy"); await expect(lower).toHaveAttribute("sizes", /^auto, /);
  await expect(lower).not.toHaveAttribute("fetchpriority");
  await expect.poll(() => lower.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  // The browser selects a loaded responsive copy, rather than a failed repository URL.
  await expect.poll(() => hero.evaluate(image => (image as HTMLImageElement).currentSrc)).toMatch(/^data:/);
  await expect.poll(() => lower.evaluate(image => (image as HTMLImageElement).currentSrc)).toMatch(/^data:/);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(source).toBe(beforeLower);
});


test("measurement uses a new natural size and lists only the page's light DOM images", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main");
  const hero = page.frameLocator(".native-preview-frame").locator("img.hero-image");
  await expect(hero).toBeVisible();
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts"), text = editor.getMountedSource("index.html")!;
    const at = text.indexOf("</body>");
    editor.replaceActiveRange({ path: "index.html", start: at, end: at, expected: "", text: '<style>#page .hero-image{width:300px;height:400px;object-fit:cover}</style>' });
  });
  await expect.poll(() => hero.evaluate(image => getComputedStyle(image).height)).toBe("400px");
  const visibleSize = await hero.evaluate(image => (image as HTMLImageElement).naturalWidth);
  const report = await measure(page, { path: "index.html", node: [1, 0, 2], image: { width: 1200, height: 300 } });
  if ("error" in report) throw new Error(report.error);
  expect(report.facts.every(fact => fact.naturalWidth === 1200 && fact.naturalHeight === 300)).toBe(true);
  expect(imageResult(report.facts).sizes).toBe("1600px");
  expect(report.images).toEqual([{ node: [1, 0, 2], firstScreen: true, large: true }]);
  expect(await hero.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(visibleSize);
});

// Default fixture group. Shape stand-ins change only the hidden measuring copy.
test("a 16:9 cover style stand-in measures its new shape without changing the visible image", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main");
  const hero = page.frameLocator(".native-preview-frame").locator("img.hero-image");
  await expect(hero).toBeVisible();
  await expect.poll(() => hero.evaluate(image => image instanceof HTMLImageElement && image.naturalWidth)).toBeGreaterThan(0);
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const source = editor.getMountedSource("index.html") ?? "";
    const at = source.indexOf('<img class="hero-image"');
    editor.replaceActiveRange({ path: "index.html", start: at, end: at + 4, expected: "<img", text: '<img style="width:160px;height:auto;aspect-ratio:1;object-fit:cover"' });
  });
  await expect.poll(() => hero.evaluate(image => getComputedStyle(image).aspectRatio)).toBe("1 / 1");
  const before = await hero.evaluate(image => ({ style: image.getAttribute("style"), width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height, viewport: innerWidth }));
  const original = await measure(page, { path: "index.html", node: [1, 0, 2] });
  const shaped = await measure(page, { path: "index.html", node: [1, 0, 2], style: "width:160px;height:auto;aspect-ratio:16 / 9;object-fit:cover" });
  if ("error" in original) throw new Error(original.error);
  if ("error" in shaped) throw new Error(shaped.error);
  expect(shaped.facts.every(fact => fact.width === 160 && fact.height === 90 && fact.fit === "cover")).toBe(true);
  // The starter's natural 320:180 image has a square displayed box (cover needs 285px).
  // A 16:9 stand-in needs only 160px of source pixels.
  expect(imageResult(shaped.facts).widths[0].width).toBeLessThan(imageResult(original.facts).widths[0].width);
  expect(await hero.evaluate(image => ({ style: image.getAttribute("style"), width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height, viewport: innerWidth }))).toEqual(before);
  expect(await measure(page, { path: "index.html", node: [1, 0, 2], style: "x".repeat(16385) })).toEqual({ error: "Invalid image style." });
  await expect(page.frameLocator(".native-preview-frame").locator("iframe")).toHaveCount(0);
});

// Default fixture group. Replacing a picture is one undoable page and media change.
test("picker replacement removes picture sources, keeps image class, and one Undo restores them", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main");
  const preview = page.frameLocator(".native-preview-frame"), hero = preview.locator("img.hero-image");
  await expect(hero).toBeVisible();
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts"), source = editor.getMountedSource("index.html")!;
    const image = source.match(/<img\b[^>]*class="hero-image"[^>]*>/)![0], start = source.indexOf(image);
    editor.replaceActiveRange({ path: "index.html", start, end: start + image.length, expected: image,
      text: `<picture><source type="image/svg+xml" srcset="/images/placeholder.svg">${image}</picture>` });
  });
  await expect(preview.locator("picture > img.hero-image")).toBeVisible();
  const source = () => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")!);
  const before = await source();
  const picker = await openPickerOn(page, hero);
  await expect(picker.getByRole("button", { name: "Choose images/placeholder.svg", exact: true })).toBeVisible();
  await picker.locator('input[name="media-upload"]').setInputFiles({ name: "Picture cleanup.svg", mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80"><rect width="160" height="80" fill="green"/></svg>') });
  await expect(picker.getByRole("button", { name: "Choose Picture cleanup.svg", exact: true })).toHaveAttribute("aria-pressed", "true");
  await picker.getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker).toBeHidden();
  await expect.poll(source).not.toMatch(/<source|<picture/i);
  expect(await source()).toMatch(/<img\b[^>]*class="hero-image"/);
  await expect(hero).toHaveAttribute("src", /^data:/);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(source).toBe(before);
  await expect(preview.locator("picture > img.hero-image")).toBeVisible();
});

// Default fixture group. Placing unwraps a <picture>, so the measuring copy measures the image without it.
test("measuring a new picture for an image inside a narrow picture measures it unwrapped", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main");
  const preview = page.frameLocator(".native-preview-frame"), hero = preview.locator("img.hero-image");
  await expect(hero).toBeVisible();
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts"), text = editor.getMountedSource("index.html")!;
    const at = text.indexOf("</body>");
    editor.replaceActiveRange({ path: "index.html", start: at, end: at, expected: "", text: "<style>#page .hero-image{width:100%;height:auto}</style>" });
    const source = editor.getMountedSource("index.html")!, image = source.match(/<img\b[^>]*class="hero-image"[^>]*>/)![0], start = source.indexOf(image);
    editor.replaceActiveRange({ path: "index.html", start, end: start + image.length, expected: image,
      text: `<picture style="display:block;width:100px"><source media="(max-width: 1px)" srcset="/images/placeholder.svg">${image}</picture>` });
  });
  await expect(preview.locator("picture > img.hero-image")).toBeVisible();
  await expect.poll(() => hero.evaluate(image => parseFloat(getComputedStyle(image).width))).toBe(100);
  const wrapped = await measure(page, { path: "index.html", node: [1, 0, 2, 1] });
  if ("error" in wrapped) throw new Error(wrapped.error);
  expect(imageResult(wrapped.facts).widths.every(({ width }) => width === 100)).toBe(true);
  const report = await measure(page, { path: "index.html", node: [1, 0, 2, 1], image: { width: 1800, height: 900 } });
  if ("error" in report) throw new Error(report.error);
  expect(imageResult(report.facts).widths.every(({ width }) => width > 100)).toBe(true);
  await expect(preview.locator("picture > img.hero-image")).toBeVisible();
});

// Default fixture: placed-image markup seeded into the starter page.
test("moving a placed image to the top re-checks markup in the move's Undo step", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main");
  await page.evaluate(async () => {
    const editor = await import("/src/components/source-editor.ts");
    const source = editor.getMountedSource("index.html");
    if (!source) throw new Error("Missing page");
    const text = source.replace('class="hero-image"', 'sizes="160px" fetchpriority="high" class="hero-image"')
      .replace('<section class="hero"', '<section style="min-height:1000px" class="hero"')
      .replace('<section class="cards"', '<section style="min-height:1000px" class="cards"')
      .replace('<section class="filler"', '<section class="moved-image" style="min-height:1000px"><img src="/images/placeholder.svg" style="width:320px;height:180px" sizes="auto, 320px" loading="lazy"></section>\n  <section class="filler"');
    editor.replaceActiveRange({ path: "index.html", start: 0, end: source.length, expected: source, text });
  });
  const preview = page.frameLocator(".native-preview-frame"), moved = preview.locator(".moved-image img"), former = preview.locator(".hero-image");
  await expect(moved).toHaveAttribute("loading", "lazy");
  const rows = page.getByRole("tree", { name: "Page structure" }).locator("[role=treeitem][aria-level='2']");
  await rows.nth(2).click();
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => preview.locator("main > section").evaluateAll(nodes => nodes.map(node => node.className))).toEqual(["hero", "moved-image", "cards", "filler"]);
  await expect.poll(() => page.evaluate(async () => !(await import("/src/components/source-editor.ts")).hasOpenEditGroup("index.html"))).toBe(true);
  // The 160px hero (14,400px²) is not large: with nothing large on the first screen, no image keeps priority.
  await expect(former).not.toHaveAttribute("fetchpriority", /./);
  await expect(former).toHaveAttribute("sizes", "160px");
  await rows.nth(1).focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(moved).not.toHaveAttribute("loading", "lazy");
  await expect(moved).toHaveAttribute("sizes", "320px");
  await expect(moved).toHaveAttribute("fetchpriority", "high");
  await expect(former).toHaveAttribute("loading", "lazy");
  await expect(former).toHaveAttribute("sizes", "auto, 160px");
  await page.locator("#content [role='textbox']").first().focus();
  await page.keyboard.press("ControlOrMeta+Z");
  await expect.poll(() => preview.locator("main > section").evaluateAll(nodes => nodes.map(node => node.className))).toEqual(["hero", "moved-image", "cards", "filler"]);
  await expect(moved).toHaveAttribute("loading", "lazy");
  await expect(moved).toHaveAttribute("sizes", "auto, 320px");
  await expect(moved).not.toHaveAttribute("fetchpriority", /./);
  await expect(former).not.toHaveAttribute("loading", "lazy");
  await expect(former).toHaveAttribute("sizes", "160px");
  await expect(former).not.toHaveAttribute("fetchpriority", /./);
  await page.keyboard.press("ControlOrMeta+Shift+Z");
  await expect.poll(() => preview.locator("main > section").evaluateAll(nodes => nodes.map(node => node.className))).toEqual(["moved-image", "hero", "cards", "filler"]);
  await expect(moved).not.toHaveAttribute("loading", "lazy");
  await expect(moved).toHaveAttribute("fetchpriority", "high");
  await expect(former).toHaveAttribute("loading", "lazy");
  // Two Undos: the first move's own re-check goes with it, so the seeded priority comes back.
  await page.keyboard.press("ControlOrMeta+Z");
  await page.keyboard.press("ControlOrMeta+Z");
  await expect.poll(() => preview.locator("main > section").evaluateAll(nodes => nodes.map(node => node.className))).toEqual(["hero", "cards", "moved-image", "filler"]);
  await expect(former).toHaveAttribute("fetchpriority", "high");
  await expect(moved).toHaveAttribute("loading", "lazy");
});

// Default fixture group, nightly: existing repository bytes stay unchanged; placement and copies undo together.
test("placing an older 2000px JPEG adopts new copies in one Undo without changing its bytes", async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 2000; canvas.height = 1000;
    const context = canvas.getContext("2d")!, pixels = context.createImageData(canvas.width, canvas.height);
    let seed = 35;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels.data[i] = seed & 255; pixels.data[i + 1] = seed >>> 8 & 255; pixels.data[i + 2] = seed >>> 16 & 255; pixels.data[i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/jpeg", .95).split(",")[1];
  });
  const main = "images/Older Photo.jpg";
  expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: main, base64 } })).status()).toBe(204);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main");
  const source = () => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")!);
  const before = await source(), hero = page.frameLocator(".native-preview-frame").locator("img.hero-image");
  const picker = await openPickerOn(page, hero);
  await picker.getByRole("button", { name: `Choose ${main}`, exact: true }).click();
  await picker.getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker).toBeHidden();
  // Read the same durable draft store as the other native-save specs.
  const copies = [480, 960, 1600].map(width => `images/Older Photo-${width}.webp`);
  const stored = async () => {
    const { storedDrafts } = await import("./drafts");
    return storedDrafts(page);
  };
  await expect.poll(async () => (await stored()).filter(draft => copies.includes(draft.path)).length).toBe(3);
  const markup = (await source()).match(/<img\b[^>]*class="hero-image"[^>]*>/)![0];
  for (const width of [480, 960, 1600]) expect(markup).toContain(`/images/Older%20Photo-${width}.webp ${width}w`);
  expect((await stored()).some(draft => draft.path === main)).toBe(false);
  const repository = await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(main)}`);
  expect((await repository.body()).equals(Buffer.from(base64, "base64"))).toBe(true);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(source).toBe(before);
  await expect.poll(async () => (await stored()).filter(draft => copies.includes(draft.path)).length).toBe(0);
  expect((await stored()).some(draft => draft.path === main)).toBe(false);
});
