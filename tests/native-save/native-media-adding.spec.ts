import { expect, test, type Page } from "@playwright/test";
import { animatedGif } from "./animated-gif";
import { openPickerOn } from "./open-picker";
import { onePagePdf } from "./pdf-fixture";
import { publishButton, showPublish } from "./publish";
import { effectiveSource, storedDraft, storedDrafts } from "./drafts";

// Default native-save fixture. Real preparation worker, drafts and shared page history.
async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").locator(".hero img")).toBeVisible();
}
async function photo(page: Page) {
  return page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 1800; canvas.height = 900;
    const context = canvas.getContext("2d")!; context.fillStyle = "#ad3456"; context.fillRect(0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), "image/png"));
    return btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())));
  });
}

async function detailedPhoto(page: Page) {
  return page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 3000; canvas.height = 1500;
    const context = canvas.getContext("2d")!, pixels = context.createImageData(canvas.width, canvas.height);
    let seed = 123456;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels.data[i] = seed & 255; pixels.data[i + 1] = (seed >>> 8) & 255; pixels.data[i + 2] = (seed >>> 16) & 255; pixels.data[i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0); context.fillStyle = "#ad3456"; context.fillRect(400, 200, 1200, 800);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), "image/jpeg", 0.95));
    return await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.readAsDataURL(blob); });
  });
}

test("Balanced adding saves a 2400px WebP main and three copies from a detailed 3000px JPEG", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const bytes = await detailedPhoto(page);
  await openPickerOn(page, page.frameLocator(".native-preview-frame").locator(".hero img"));
  const picker = page.getByRole("dialog", { name: "Choose image", exact: true });
  await expect(picker.getByRole("button", { name: "Choose images/placeholder.svg", exact: true })).toBeVisible();
  await picker.locator('input[name="media-upload"]').setInputFiles({ name: "Recipe.jpg", mimeType: "image/jpeg", buffer: Buffer.from(bytes, "base64") });
  await expect(picker.getByRole("button", { name: "Choose Recipe.jpg", exact: true })).toHaveAttribute("aria-pressed", "true");
  await picker.getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker).toBeHidden();
  await expect.poll(() => storedDraft(page, "media/images/recipe-1600.webp")).toBeDefined();
  await showPublish(page);
  for (const box of await page.locator("#publish-files .publish-menu__file input").all()) await box.check();
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  let mainBytes = 0;
  for (const width of [2400, 480, 960, 1600]) {
    const path = `media/images/recipe${width === 2400 ? "" : `-${width}`}.webp`;
    const response = await page.request.get(`${baseURL}/__demo/file?${new URLSearchParams({ path })}`);
    expect(response.ok(), path).toBe(true);
    const saved = await response.body();
    expect(saved.subarray(0, 4).toString()).toBe("RIFF"); expect(saved.subarray(8, 12).toString()).toBe("WEBP");
    const dimensions = await page.evaluate(async base64 => {
      const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/webp" }));
      const dimensions = [bitmap.width, bitmap.height]; bitmap.close(); return dimensions;
    }, saved.toString("base64"));
    expect(dimensions).toEqual([width, width / 2]);
    if (width === 2400) mainBytes = saved.length; else expect(saved.length).toBeLessThan(mainBytes);
  }
});
/** A detailed 3000 × 1500 JPEG, base64. */
function widePhoto(page: Page) {
  return page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 3000; canvas.height = 1500;
    const context = canvas.getContext("2d")!, pixels = context.createImageData(canvas.width, canvas.height);
    let seed = 654321;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels.data[i] = seed & 255; pixels.data[i + 1] = (seed >>> 8) & 255; pixels.data[i + 2] = (seed >>> 16) & 255; pixels.data[i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), "image/jpeg", 0.95));
    return await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.readAsDataURL(blob); });
  });
}
async function adding(page: Page) {
  const media = page.getByRole("region", { name: "Media", exact: true }), tab = page.getByRole("tab", { name: "Media", exact: true });
  if (!await tab.isVisible()) await page.locator("#explorer-toggle").click();
  await tab.click();
  // The pane keeps an open screen while the explorer is closed.
  const heading = media.getByRole("heading", { name: "Adding settings", exact: true }), more = media.getByRole("button", { name: "More", exact: true });
  await expect(heading.or(more)).toBeVisible();
  if (await heading.isVisible()) return media;
  await more.click();
  await page.getByRole("menu", { name: "More", exact: true }).getByRole("menuitem", { name: "Adding settings", exact: true }).click();
  await expect(heading).toBeFocused();
  return media;
}

test("Adding settings: Smaller files is remembered for the site and adds a photo at most 1,600 px wide", async ({ page, baseURL }) => {
  await open(page, baseURL);
  let media = await adding(page);
  const images = media.getByRole("group", { name: "Images", exact: true });
  await expect(images.getByRole("radio")).toHaveCount(4);
  await expect(images.getByRole("radio", { name: /^Balanced/ })).toBeChecked();
  await expect(media.getByRole("group", { name: "Audio", exact: true }).getByRole("radio", { name: /^Speech/ })).not.toBeChecked();
  await expect(media.getByRole("checkbox", { name: /^Keep original/ })).not.toBeChecked();
  // Reset to defaults is there only once a choice differs from the defaults.
  await expect(media.getByRole("button", { name: "Reset to defaults", exact: true })).toBeHidden();
  await images.getByRole("radio", { name: /^Smaller files/ }).check();
  await expect.poll(async () => JSON.parse((await storedDraft(page, ".editor/media.json"))?.content ?? "{}").adding).toEqual({ image: "smaller" });
  await expect(media.getByRole("button", { name: "Reset to defaults", exact: true })).toBeVisible();

  // Reload: the site still remembers the choice.
  await page.reload();
  await expect(page.frameLocator(".native-preview-frame").locator(".hero img")).toBeVisible({ timeout: 30_000 });
  media = await adding(page);
  await expect(media.getByRole("group", { name: "Images", exact: true }).getByRole("radio", { name: /^Smaller files/ })).toBeChecked();
  await media.getByRole("button", { name: "Back", exact: true }).click();

  const bytes = await widePhoto(page);
  await media.locator('input[name="media-upload"]').setInputFiles({ name: "Smaller.jpg", mimeType: "image/jpeg", buffer: Buffer.from(bytes, "base64") });
  // Copies only below the main's width: a 1,600 px main has no -1600 copy.
  await expect.poll(async () => (await storedDrafts(page)).map(draft => draft.path).filter(path => path.startsWith("media/images/smaller")).sort(), { timeout: 30_000 })
    .toEqual(["media/images/smaller-480.webp", "media/images/smaller-960.webp", "media/images/smaller.webp"]);
  await showPublish(page);
  for (const box of await page.locator("#publish-files .publish-menu__file input").all()) await box.check();
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  const saved = await page.request.get(`${baseURL}/__demo/file?${new URLSearchParams({ path: "media/images/smaller.webp" })}`);
  expect(saved.ok()).toBe(true);
  const width = await page.evaluate(async base64 => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), char => char.charCodeAt(0))], { type: "image/webp" }));
    const width = bitmap.width; bitmap.close(); return width;
  }, (await saved.body()).toString("base64"));
  expect(width).toBe(1600);
});

async function undoAddition(page: Page, baseURL: string | undefined, before: string) {
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => effectiveSource(page, baseURL, "index.html")).toBe(before);
  await expect.poll(async () => (await storedDrafts(page)).filter(draft => draft.path.startsWith("media/images/added")).length).toBe(0);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toContain("/media/images/added.webp");
  await expect.poll(() => storedDraft(page, "media/images/added-480.webp")).toBeDefined();
}

test("Structure upload prepares and places; one Undo removes placement and family", { tag: "@smoke" }, async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "components/media-card/media-card.html", content: '<figure><slot name="image"><img src="/images/placeholder.svg" alt="Placeholder"></slot></figure>' } });
  const response = await page.request.get(`${baseURL}/__demo/file?path=index.html`);
  const source = (await response.text()).replace('<section class="hero"', '<media-card></media-card><section class="hero"');
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "index.html", content: source } });
  await page.reload();
  await open(page, baseURL);
  const before = (await effectiveSource(page, baseURL, "index.html"))!;
  const tree = page.getByRole("tree", { name: "Page structure" });
  const instance = tree.getByRole("treeitem", { name: "Media card", exact: true });
  await instance.click();
  if (await instance.getAttribute("aria-expanded") === "false") await instance.locator(".page-structure__toggle").click();
  await tree.locator(".page-structure__slot-badge").filter({ hasText: /^Image$/ }).press("Enter");
  const bytes = await photo(page);
  // Structure's Choose image… opens the picker; a file added there is prepared and held, then Use places it.
  await tree.getByRole("button", { name: "Choose image…", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Choose image", exact: true });
  await expect(picker.getByRole("button", { name: "Choose images/placeholder.svg", exact: true })).toBeVisible();
  await picker.locator('input[name="media-upload"]').setInputFiles({ name: "Added.png", mimeType: "image/png", buffer: Buffer.from(bytes, "base64") });
  await expect(picker.getByRole("button", { name: "Choose Added.png", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await storedDraft(page, "media/images/added.webp")).toBeUndefined();
  await picker.getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker).toBeHidden();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toContain('src="/media/images/added.webp"');
  for (const path of ["media/images/added.webp", "media/images/added-480.webp", "media/images/added-960.webp", "media/images/added-1600.webp"])
    await expect.poll(() => storedDraft(page, path)).toBeDefined();
  await undoAddition(page, baseURL, before);
});

test("canvas drop prepares held tiles; only Use places; one Undo removes both", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const before = (await effectiveSource(page, baseURL, "index.html"))!, bytes = await photo(page);
  await page.frameLocator(".native-preview-frame").locator(".hero img").evaluate((element, bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(atob(bytes), char => char.charCodeAt(0))], "Added.png", { type: "image/png" }));
    element.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, bytes);
  const picker = page.getByRole("dialog", { name: "Choose image", exact: true });
  await expect(picker).toBeVisible();
  await expect(picker.locator('.media-library__pending[data-state="ready"]')).toHaveCount(1);
  expect(await effectiveSource(page, baseURL, "index.html")).toBe(before);
  expect(await storedDraft(page, "media/images/added.webp")).toBeUndefined();
  await picker.getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker).toBeHidden();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toContain('src="/media/images/added.webp"');
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toContain('srcset="/media/images/added-480.webp 480w');
  await undoAddition(page, baseURL, before);
});

test("Close saves every ready file once, cancels unfinished preparation, and places nothing", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const before = (await effectiveSource(page, baseURL, "index.html"))!;
  await openPickerOn(page, page.frameLocator(".native-preview-frame").locator(".hero img"));
  const picker = page.getByRole("dialog", { name: "Choose image", exact: true });
  await expect(picker.getByRole("button", { name: "Choose images/placeholder.svg", exact: true })).toBeVisible();
  await page.evaluate(() => {
    // Hold only PNG preparation; SVG now runs through the real worker too.
    const original = Object.getOwnPropertyDescriptor(Worker.prototype, "postMessage")!;
    const send: typeof Worker.prototype.postMessage = original.value;
    Worker.prototype.postMessage = function (this: Worker, message: { file?: File }, ...args: [StructuredSerializeOptions?]) {
      if (message.file?.name !== "unfinished.png") send.call(this, message, ...args);
    };
  });
  await picker.locator('input[name="media-upload"]').setInputFiles([
    { name: "added.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"/>') },
    { name: "unfinished.png", mimeType: "image/png", buffer: Buffer.from("held by worker") },
  ]);
  await expect(picker.locator('.media-library__pending[data-state="ready"]')).toHaveCount(1);
  await expect(picker.locator('.media-library__pending[data-state="preparing"]')).toHaveCount(1);
  await picker.getByRole("button", { name: "Close", exact: true }).click();
  await expect(picker).toBeHidden();
  await expect(page.locator("#status")).toContainText("1 file still being prepared was not added");
  expect(await effectiveSource(page, baseURL, "index.html")).toBe(before);
  expect(await storedDraft(page, "media/images/unfinished.webp")).toBeUndefined();
  await expect.poll(() => storedDraft(page, "media/images/added.svg")).toBeDefined();
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDraft(page, "media/images/added.svg")).toBeUndefined();
});

test("Use saves all ready files across picker additions with placement in one batch", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const before = (await effectiveSource(page, baseURL, "index.html"))!;
  await openPickerOn(page, page.frameLocator(".native-preview-frame").locator(".hero img"));
  const picker = page.getByRole("dialog", { name: "Choose image", exact: true });
  await expect(picker.getByRole("button", { name: "Choose images/placeholder.svg", exact: true })).toBeVisible();
  for (const name of ["first.svg", "second.svg"]) {
    await picker.locator('input[name="media-upload"]').setInputFiles({ name, mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"/>') });
    await expect(picker.getByRole("button", { name: `Choose ${name}`, exact: true })).toBeEnabled();
  }
  expect(await storedDraft(page, "media/images/first.svg")).toBeUndefined();
  await picker.getByRole("button", { name: "Choose second.svg", exact: true }).click();
  await picker.getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker).toBeHidden();
  await expect.poll(() => storedDraft(page, "media/images/first.svg")).toBeDefined();
  await expect.poll(() => storedDraft(page, "media/images/second.svg")).toBeDefined();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toContain('/media/images/second.svg');
  // A cleaned SVG carries its dimensions into the placed markup.
  const placed = /<img\b[^>]*\/images\/second\.svg[^>]*>/.exec((await storedDraft(page, "index.html"))!.content)![0];
  expect(placed).toContain('width="12"'); expect(placed).toContain('height="12"');
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => effectiveSource(page, baseURL, "index.html")).toBe(before);
  for (const path of ["media/images/first.svg", "media/images/second.svg"]) await expect.poll(() => storedDraft(page, path)).toBeUndefined();
});

test("picker Review retains Optimise but reviewed files stay held until Use", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await openPickerOn(page, page.frameLocator(".native-preview-frame").locator(".hero img"));
  const picker = page.getByRole("dialog", { name: "Choose image", exact: true });
  await expect(picker.getByRole("button", { name: "Choose images/placeholder.svg", exact: true })).toBeVisible();
  await picker.locator('input[name="media-upload"]').setInputFiles({ name: "reviewed.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"/>') });
  await expect(picker.locator('.media-library__pending[data-state="ready"]')).toHaveCount(1);
  await picker.getByRole("button", { name: "Review…", exact: true }).click();
  await expect(picker.getByRole("heading", { name: "Optimise", exact: true })).toBeVisible();
  await picker.getByRole("button", { name: "Preview optimisation", exact: true }).click();
  await expect(picker.getByRole("button", { name: "Add to library", exact: true })).toBeEnabled();
  await picker.getByRole("button", { name: "Add to library", exact: true }).click();
  await expect(picker.getByRole("button", { name: "Choose reviewed.svg", exact: true })).toBeEnabled();
  expect(await storedDraft(page, "media/images/reviewed.svg")).toBeUndefined();
  await picker.getByRole("button", { name: "Choose reviewed.svg", exact: true }).click();
  await picker.getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker).toBeHidden();
  await expect.poll(() => storedDraft(page, "media/images/reviewed.svg")).toBeDefined();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toContain('/media/images/reviewed.svg');
});

test("Files drop in a repository without a home page adds the file", async ({ page, baseURL }) => {
  // Signed in on the demo site first; the plain repository then opens by a fresh load of its address.
  await open(page, baseURL);
  await page.request.post(`${baseURL}/__demo/onboarding`, { data: { add: [{ name: "adding-notes", kind: "no-site" }] } });
  const repos = (await (await page.request.get(`${baseURL}/api/repositories?refresh=1`)).json()) as { id: number; name: string }[];
  await page.goto(`${baseURL}/#repo=${repos.find(repo => repo.name === "adding-notes")!.id}&branch=main`);
  await page.reload();
  const explorer = page.locator("#explorer");
  if (!(await explorer.isVisible())) await page.locator("#explorer-toggle").click();
  await expect(explorer.getByRole("button", { name: "README.md", exact: true })).toBeVisible({ timeout: 30_000 });
  await page.locator("#explorer-files > .files-heading").evaluate(element => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["%PDF-1.4"], "Guide.pdf", { type: "application/pdf" }));
    for (const type of ["dragenter", "dragover", "drop"]) element.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
  });
  await expect(page.locator("#status")).toHaveText("Added guide.pdf. Guide.pdf was added without a preview picture.");
  await expect(explorer.locator(".file-row[data-path='guide.pdf']")).toBeVisible();
});

test("cancelling a held file while Use reads its size places nothing", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const before = (await effectiveSource(page, baseURL, "index.html"))!;
  await openPickerOn(page, page.frameLocator(".native-preview-frame").locator(".hero img"));
  const picker = page.getByRole("dialog", { name: "Choose image", exact: true });
  await expect(picker.getByRole("button", { name: "Choose images/placeholder.svg", exact: true })).toBeVisible();
  await picker.locator('input[name="media-upload"]').setInputFiles({ name: "held.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h12v12z"/></svg>') });
  await picker.getByRole("button", { name: "Choose held.svg", exact: true }).click();
  // Without SVG dimensions, Use reads the intrinsic size. Hold that read, cancel the file, then let the read finish.
  await page.evaluate(() => {
    const prototype = HTMLImageElement.prototype, original = Object.getOwnPropertyDescriptor(prototype, "decode")!;
    let release = () => {};
    const held = new Promise<void>(resolve => { release = resolve; });
    const decodeHeld: HTMLImageElement["decode"] = function (this: HTMLImageElement) {
      return held.then(() => (original.value as (this: HTMLImageElement) => Promise<void>).call(this));
    };
    Object.defineProperty(prototype, "decode", { ...original, value: decodeHeld });
    const holder: { releaseDecode?: () => void } = window;
    holder.releaseDecode = () => { Object.defineProperty(prototype, "decode", original); release(); };
  });
  await picker.getByRole("button", { name: "Use image", exact: true }).click();
  await picker.getByRole("button", { name: /^Cancel adding held\.svg/ }).click();
  await page.evaluate(() => { const holder: { releaseDecode?: () => void } = window; holder.releaseDecode?.(); });
  await expect(picker.getByText("This file was cancelled. Choose another image.")).toBeVisible();
  expect(await effectiveSource(page, baseURL, "index.html")).toBe(before);
  expect((await storedDraft(page, "index.html"))?.content ?? "").not.toContain("pending");
});

test("Use with a file still preparing saves the ready one and the placement in one Undo step", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const before = (await effectiveSource(page, baseURL, "index.html"))!;
  await openPickerOn(page, page.frameLocator(".native-preview-frame").locator(".hero img"));
  const picker = page.getByRole("dialog", { name: "Choose image", exact: true });
  await expect(picker.getByRole("button", { name: "Choose images/placeholder.svg", exact: true })).toBeVisible();
  // The encoder never answers, so the PNG stays in preparation while the SVG is ready.
  await page.evaluate(() => {
    const original = Object.getOwnPropertyDescriptor(Worker.prototype, "postMessage")!;
    const send: typeof Worker.prototype.postMessage = original.value;
    Worker.prototype.postMessage = function (this: Worker, message: { file?: File }, ...args: [StructuredSerializeOptions?]) {
      if (message.file?.name !== "slow.png") send.call(this, message, ...args);
    };
  });
  await picker.locator('input[name="media-upload"]').setInputFiles([
    { name: "ready.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"/>') },
    { name: "slow.png", mimeType: "image/png", buffer: Buffer.from("held by worker") },
  ]);
  await expect(picker.getByRole("button", { name: "Choose ready.svg", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(picker.locator('.media-library__pending[data-state="preparing"]')).toHaveCount(1);
  await picker.getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker).toBeHidden();
  await expect(page.locator("#status")).toHaveText("Image replaced. 1 file still being prepared was not added.");
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toContain("/media/images/ready.svg");
  expect(await storedDraft(page, "media/images/slow.webp")).toBeUndefined();
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => effectiveSource(page, baseURL, "index.html")).toBe(before);
  await expect.poll(() => storedDraft(page, "media/images/ready.svg")).toBeUndefined();
});


test("two photos with the same incoming name keep separate numbered families", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Media", exact: true }).click();
  const media = page.getByRole("region", { name: "Media", exact: true });
  await expect(media.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true })).toBeVisible();
  const bytes = await photo(page);
  await media.locator('input[name="media-upload"]').setInputFiles([
    { name: "Holiday Photo.JPG", mimeType: "image/jpeg", buffer: Buffer.from(bytes, "base64") },
    { name: "Holiday Photo.JPG", mimeType: "image/jpeg", buffer: Buffer.from(bytes, "base64") },
  ]);
  await expect(media.getByRole("region", { name: "Files being added", exact: true }).getByRole("status")).toHaveText("Added 2 files");
  for (const base of ["holiday-photo", "holiday-photo-2"]) {
    for (const suffix of ["", "-480", "-960", "-1600"])
      await expect.poll(() => storedDraft(page, `media/images/${base}${suffix}.webp`)).toBeDefined();
  }
});

// Files' tab, and files dropped from the desktop on its root heading as the browser delivers them.
// `size` instead of `base64`: that many zero bytes, made in the page.
async function filesTab(page: Page) {
  const explorer = page.locator("#explorer");
  if (!(await explorer.isVisible())) await page.locator("#explorer-toggle").click();
  await explorer.getByRole("tab", { name: "Files" }).click();
  // The Files tree and its drop targets load with the explorer's first opening.
  await expect(explorer.locator("#files .file-row").first()).toBeVisible();
  return explorer;
}
async function dropOnFiles(page: Page, files: { name: string; type: string; base64?: string; size?: number }[]) {
  await page.locator("#explorer-files > .files-heading").evaluate((element, files) => {
    const transfer = new DataTransfer();
    for (const file of files)
      transfer.items.add(new File([file.base64 === undefined ? new Uint8Array(file.size ?? 0) : Uint8Array.from(atob(file.base64), char => char.charCodeAt(0))], file.name, { type: file.type }));
    for (const type of ["dragenter", "dragover", "drop"]) element.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, files);
}

test("Files: three files start adding at once with progress; one is cancelled; a big PDF gets a Large download note", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const explorer = await filesTab(page);
  // The encoder never answers, so the picture stays in preparation until it is cancelled.
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Preserve the method, then call it with the original Worker receiver.
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, options) {
      if (message?.file instanceof File) return;
      post.call(this, message, options ?? []);
    };
  });
  await dropOnFiles(page, [
    { name: "big.pdf", type: "application/pdf", size: 12_000_000 },
    { name: "notes.pdf", type: "application/pdf", base64: btoa("%PDF-1.4") },
    { name: "slow.png", type: "image/png", base64: btoa("held by worker") },
  ]);
  const summary = explorer.getByRole("region", { name: "Files being added" });
  await expect(summary.getByRole("status")).toHaveText("Adding 3 files");
  await expect(summary.locator(".media-library__adding-row").filter({ hasText: "slow.png" })).toContainText("Preparing…");
  await expect(summary.locator("progress")).toHaveJSProperty("value", 2);
  // The note shows while the picture is still being prepared.
  await expect(summary).toContainText("Large download: big.pdf is 12.0 MB, which can be slow to load on phones.");
  await summary.getByRole("button", { name: "Cancel adding slow.png", exact: true }).click();
  await expect(summary.getByRole("status")).toHaveText("Added 2 files");
  await expect(summary).toContainText("Large download: big.pdf is 12.0 MB");
  await expect(page.locator("#status")).toHaveText("Added big.pdf, notes.pdf. Large download: big.pdf is 12.0 MB, which can be slow to load on phones. notes.pdf was added without a preview picture.");
  await expect.poll(() => storedDraft(page, "big.pdf")).toBeDefined();
  await expect.poll(() => storedDraft(page, "notes.pdf")).toBeDefined();
  expect(await storedDraft(page, "slow.webp")).toBeUndefined();
  // One Undo removes the drop's files.
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDrafts(page)).filter(draft => /^(big|notes)\.pdf$/.test(draft.path)).length).toBe(0);
  await (await filesTab(page)).getByRole("region", { name: "Files being added" }).getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(summary).toBeHidden();
});

test("Files: a picture that cannot be prepared asks first; Add unchanged adds it, Don't add and Escape leave it for Retry", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const explorer = await filesTab(page), bytes = await photo(page);
  // The encoder answers with a failure, as it does for a picture it cannot read.
  await page.evaluate(() => {
    Worker.prototype.postMessage = function (this: Worker) {
      setTimeout(() => this.onmessage?.call(this, new MessageEvent("message", { data: { error: "No encoder in this test." } })));
    };
  });
  const summary = explorer.getByRole("region", { name: "Files being added" });
  const question = page.getByRole("dialog", { name: "Add unchanged file?", exact: true });

  await dropOnFiles(page, [{ name: "Kept.png", type: "image/png", base64: bytes }]);
  await expect(question).toContainText("Kept.png could not be prepared. Add the unchanged file instead?");
  await question.getByRole("button", { name: "Add unchanged", exact: true }).click();
  await expect(summary.getByRole("status")).toHaveText("Added 1 file");
  await expect(page.locator("#status")).toHaveText("Added kept.png.");
  await expect.poll(() => storedDraft(page, "kept.png")).toBeDefined();

  await dropOnFiles(page, [{ name: "Refused.png", type: "image/png", base64: bytes }]);
  await question.getByRole("button", { name: "Don't add", exact: true }).click();
  await expect(summary.getByRole("status")).toHaveText("1 file couldn't be added");
  await expect(summary).toContainText("Refused.png was not added.");
  expect(await storedDraft(page, "refused.png")).toBeUndefined();
  // Retry asks again; Escape adds nothing either.
  await summary.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(question).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(question).toBeHidden();
  await expect(summary.getByRole("status")).toHaveText("1 file couldn't be added");
  await expect(summary.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  expect(await storedDraft(page, "refused.png")).toBeUndefined();
});

test("Adding settings: each change and Reset undo as one step; a Files folder drop uses the remembered choice", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const remembered = async () => JSON.parse(await effectiveSource(page, baseURL, ".editor/media.json") ?? "{}").adding;
  let media = await adding(page);
  const higher = () => media.getByRole("group", { name: "Images", exact: true }).getByRole("radio", { name: /^Higher quality/ });
  const keep = () => media.getByRole("checkbox", { name: /^Keep original/ });
  await higher().check();
  await expect.poll(remembered).toEqual({ image: "higher" });
  await keep().check();
  await expect.poll(remembered).toEqual({ image: "higher", keepOriginal: true });
  await media.getByRole("button", { name: "Reset to defaults", exact: true }).click();
  await expect.poll(remembered).toBeUndefined();
  await expect(media.getByRole("heading", { name: "Adding settings", exact: true })).toBeFocused();
  await expect(higher()).not.toBeChecked(); await expect(keep()).not.toBeChecked();
  // One Undo brings back every choice Reset forgot; the next undoes Keep original alone.
  await page.keyboard.press("Escape");
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(remembered).toEqual({ image: "higher", keepOriginal: true });
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(remembered).toEqual({ image: "higher" });
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(remembered).toEqual({ image: "higher", keepOriginal: true });
  media = await adding(page);
  await expect(higher()).toBeChecked(); await expect(keep()).toBeChecked();

  await media.getByRole("group", { name: "Images", exact: true }).getByRole("radio", { name: /^Smaller files/ }).check();
  await expect.poll(remembered).toEqual({ image: "smaller", keepOriginal: true });
  await page.keyboard.press("Escape");
  await filesTab(page);
  const bytes = await widePhoto(page);
  await page.locator("#explorer .file-row[data-path='about']").first().evaluate((element, base64) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(atob(base64), char => char.charCodeAt(0))], "Wide.jpg", { type: "image/jpeg" }));
    for (const type of ["dragenter", "dragover", "drop"]) element.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, bytes);
  // The folder chosen wins; a main of at most 1,600 px has copies at 480 and 960 only. Keep original
  // (slice 27) keeps the cleaned original in media/originals/ even for a Files folder.
  await expect.poll(async () => (await storedDrafts(page)).map(draft => draft.path).filter(path => /wide/.test(path)).sort(), { timeout: 30_000 })
    .toEqual(["about/wide-480.webp", "about/wide-960.webp", "about/wide.webp", "media/originals/wide.jpg"]);
});

/** `source` with an Exif APP1 block holding an orientation and personal text. */
function withExif(source: Buffer, orientation: number) {
  const exif = Buffer.alloc(32); exif.write("Exif\0\0"); exif.write("II", 6); exif.writeUInt16LE(42, 8); exif.writeUInt32LE(8, 10);
  exif.writeUInt16LE(1, 14); exif.writeUInt16LE(0x112, 16); exif.writeUInt16LE(3, 18); exif.writeUInt32LE(1, 20); exif.writeUInt16LE(orientation, 24);
  const payload = Buffer.concat([exif, Buffer.from("GPS camera location")]);
  const header = Buffer.from([255, 225, 0, 0]); header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([source.subarray(0, 2), header, payload, source.subarray(2)]);
}

test("Keep original saves a full-size JPEG without Exif/GPS and links it from the main's details", async ({ page, baseURL }) => {
  await open(page, baseURL);
  expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: ".editor/media.json", content: '{"version":2,"collections":[],"files":{},"adding":{"keepOriginal":true}}' } })).status()).toBe(204);
  await page.reload();
  await open(page, baseURL);
  const source = Buffer.from(await detailedPhoto(page), "base64");
  const bytes = withExif(source, 1), turned = withExif(source, 6);
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Media", exact: true }).click();
  const media = page.getByRole("region", { name: "Media", exact: true });
  await expect(media.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true })).toBeVisible();
  await media.locator('input[name="media-upload"]').setInputFiles({ name: "Holiday.jpg", mimeType: "image/jpeg", buffer: bytes });
  await expect(media.getByRole("button", { name: "Details for media/images/holiday.webp", exact: true })).toBeVisible();
  await media.locator('input[name="media-upload"]').setInputFiles({ name: "Turned.jpg", mimeType: "image/jpeg", buffer: turned });
  await expect(media.getByRole("button", { name: "Details for media/images/turned.webp", exact: true })).toBeVisible();
  await expect(media.getByRole("button", { name: "Details for media/originals/holiday.jpg", exact: true })).toHaveCount(0);
  await media.getByRole("button", { name: "Details for media/images/holiday.webp", exact: true }).click();
  await media.getByText("Copies and original", { exact: true }).click();
  const link = media.getByRole("button", { name: "Download original holiday.jpg", exact: true });
  await expect(link).toBeVisible();
  const downloadEvent = page.waitForEvent("download"); await link.click();
  const download = await downloadEvent; expect(download.suggestedFilename()).toBe("holiday.jpg");
  await showPublish(page);
  for (const box of await page.locator("#publish-files .publish-menu__file input").all()) await box.check();
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  const response = await page.request.get(`${baseURL}/__demo/file?path=media/originals/holiday.jpg`);
  expect(response.ok()).toBe(true);
  const saved = await response.body();
  expect(saved.equals(source)).toBe(true); // Only the APP1 personal details were removed; no full-size re-encode.
  expect(saved.includes(Buffer.from("Exif"))).toBe(false); expect(saved.includes(Buffer.from("GPS"))).toBe(false);
  // A turned photo cannot lose its Exif losslessly: its original is the upright picture, re-encoded at full size.
  const kept = await (await page.request.get(`${baseURL}/__demo/file?path=media/originals/turned.jpg`)).body();
  expect(kept.subarray(0, 2).equals(Buffer.from([255, 216]))).toBe(true);
  expect(kept.includes(Buffer.from("Exif"))).toBe(false); expect(kept.includes(Buffer.from("GPS"))).toBe(false);
  expect(await page.evaluate(async base64 => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), char => char.charCodeAt(0))], { type: "image/jpeg" }));
    const size = [bitmap.width, bitmap.height]; bitmap.close(); return size;
  }, kept.toString("base64"))).toEqual([1500, 3000]);
  const website = await page.request.get(`${baseURL}/__demo/file?path=media/images/holiday.webp`);
  expect(website.ok()).toBe(true);
  expect((await website.body()).subarray(8, 12).toString()).toBe("WEBP");
});

test("Review… keeps the cleaned original when the site remembers Keep original", async ({ page, baseURL }) => {
  await open(page, baseURL);
  expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: ".editor/media.json", content: '{"version":2,"collections":[],"files":{},"adding":{"keepOriginal":true}}' } })).status()).toBe(204);
  await page.reload();
  await open(page, baseURL);
  const source = Buffer.from(await detailedPhoto(page), "base64");
  await openPickerOn(page, page.frameLocator(".native-preview-frame").locator(".hero img"));
  const picker = page.getByRole("dialog", { name: "Choose image", exact: true });
  await expect(picker.getByRole("button", { name: "Choose images/placeholder.svg", exact: true })).toBeVisible();
  await picker.locator('input[name="media-upload"]').setInputFiles({ name: "reviewed.jpg", mimeType: "image/jpeg", buffer: withExif(source, 1) });
  await expect(picker.locator('.media-library__pending[data-state="ready"]')).toHaveCount(1);
  await picker.getByRole("button", { name: "Review…", exact: true }).click();
  await picker.getByRole("button", { name: "Preview optimisation", exact: true }).click();
  await picker.getByRole("button", { name: "Add to library", exact: true }).click();
  await picker.getByRole("button", { name: "Choose reviewed.jpg", exact: true }).click();
  await picker.getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker).toBeHidden();
  await expect.poll(() => storedDraft(page, "media/images/reviewed.webp")).toBeDefined();
  await expect.poll(() => storedDraft(page, "media/originals/reviewed.jpg")).toBeDefined();
});

async function saveUploads(page: Page) {
  await showPublish(page);
  for (const box of await page.locator("#publish-files .publish-menu__file input").all()) await box.check();
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
}

test("SVG worker removes scripts and onload, keeps artwork and places vector dimensions", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await openPickerOn(page, page.frameLocator(".native-preview-frame").locator(".hero img"));
  const picker = page.getByRole("dialog", { name: "Choose image", exact: true });
  await expect(picker.getByRole("button", { name: "Choose images/placeholder.svg", exact: true })).toBeVisible();
  await picker.locator('input[name="media-upload"]').setInputFiles({ name: "Clean.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60" viewBox="0 0 120 60" onload="alert(1)"><script>alert(1)</script><path d="M0 0h120v60H0z" fill="red"/><text x="10" y="30">Artwork</text></svg>') });
  await expect(picker.locator('.media-library__pending[data-state="ready"]')).toHaveCount(1);
  await picker.getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker).toBeHidden();
  const source = (await storedDraft(page, "index.html"))!.content;
  const placed = /<img\b[^>]*\/media\/images\/clean\.svg[^>]*>/.exec(source)![0];
  expect(placed).toContain('width="120"'); expect(placed).toContain('height="60"');
  await saveUploads(page);
  const saved = await (await page.request.get(`${baseURL}/__demo/file?path=media/images/clean.svg`)).text();
  expect(saved).not.toMatch(/script|onload/i);
  expect(saved).toContain("<path"); expect(saved).toContain("Artwork"); expect(saved).toContain('viewBox="0 0 120 60"');
});

test("transparent PNG stays valid and no larger; oxipng WASM loads under editor CSP", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 32; canvas.height = 32;
    const context = canvas.getContext("2d")!; context.fillStyle = "#ff0000"; context.fillRect(4, 4, 24, 24);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), "image/png"));
    return btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())));
  });
  const loaded = page.waitForResponse(response => /squoosh_oxipng_bg.*\.wasm/.test(response.url()) && response.ok());
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Media", exact: true }).click();
  const media = page.getByRole("region", { name: "Media", exact: true });
  await media.locator('input[name="media-upload"]').setInputFiles({ name: "Alpha.png", mimeType: "image/png", buffer: Buffer.from(bytes, "base64") });
  await expect.poll(() => storedDraft(page, "media/images/alpha.png")).toBeDefined();
  await loaded;
  await saveUploads(page);
  const response = await page.request.get(`${baseURL}/__demo/file?path=media/images/alpha.png`);
  expect(response.ok()).toBe(true);
  const saved = await response.body();
  expect(saved.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(saved.length).toBeLessThanOrEqual(Buffer.from(bytes, "base64").length);
  const pixels = await page.evaluate(async base64 => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), char => char.charCodeAt(0))], { type: "image/png" }));
    const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!; context.drawImage(bitmap, 0, 0); bitmap.close();
    return [canvas.width, canvas.height, ...context.getImageData(0, 0, 1, 1).data, ...context.getImageData(8, 8, 1, 1).data];
  }, saved.toString("base64"));
  expect(pixels).toEqual([32, 32, 0, 0, 0, 0, 255, 0, 0, 255]);
});

async function shortVideo(page: Page) {
  return page.evaluate(async () => {
    const { loadVideoTools } = await import("/src/page-builder/video-prepare.ts");
    const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, EncodedAudioPacketSource, EncodedPacket, QUALITY_MEDIUM } = await loadVideoTools();
    const canvas = new OffscreenCanvas(64, 32), context = canvas.getContext("2d")!;
    const target = new BufferTarget(), output = new Output({ format: new Mp4OutputFormat(), target });
    const source = new CanvasSource(canvas, { codec: "avc", quality: QUALITY_MEDIUM });
    // A real AAC-LC sound track without an AAC encoder (Playwright's Chromium has none): the standard
    // silent stereo 44.1 kHz frame, 1,024 samples each, with its AudioSpecificConfig.
    const sound = new EncodedAudioPacketSource("aac"), frame = new Uint8Array([0x21, 0x00, 0x49, 0x90, 0x02, 0x19, 0x00, 0x23, 0x80]);
    output.addVideoTrack(source); output.addAudioTrack(sound); await output.start();
    for (let index = 0; index < 3; index++) {
      context.fillStyle = ["red", "green", "blue"][index]; context.fillRect(0, 0, 64, 32);
      await source.add(index * 0.5, 0.5);
    }
    const seconds = 1024 / 44_100;
    for (let index = 0; index * seconds < 1.5; index++) {
      await sound.add(new EncodedPacket(frame, "key", index * seconds, seconds),
        index ? undefined : { decoderConfig: { codec: "mp4a.40.2", numberOfChannels: 2, sampleRate: 44_100, description: new Uint8Array([0x12, 0x10]) } });
    }
    source.close(); sound.close(); await output.finalize();
    return btoa(String.fromCharCode(...new Uint8Array(target.buffer!)));
  });
}
test("Media prepares an MP4 with AAC sound and an animated GIF as H.264 MP4 with recorded WebP stills; sound kept, none invented", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const video = await shortVideo(page);
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Media", exact: true }).click();
  const media = page.getByRole("region", { name: "Media", exact: true });
  await expect(media.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true })).toBeVisible();
  await media.locator('input[name="media-upload"]').setInputFiles([
    { name: "Clip.mp4", mimeType: "video/mp4", buffer: Buffer.from(video, "base64") },
    { name: "Loop.gif", mimeType: "image/gif", buffer: animatedGif() },
  ]);
  await expect(media.getByRole("region", { name: "Files being added", exact: true }).getByRole("status")).toHaveText("Added 2 files");
  const records = JSON.parse((await storedDraft(page, ".editor/media.json"))!.content);
  for (const name of ["clip", "loop"]) {
    expect(records.files[`media/videos/${name}.mp4`].still).toBe(`media/videos/${name}.webp`);
    await expect.poll(() => storedDraft(page, `media/videos/${name}.webp`)).toBeDefined();
  }
  expect(records.files["media/videos/loop.mp4"].fromGif).toBe(true);
  await showPublish(page);
  for (const box of await page.locator("#publish-files .publish-menu__file input").all()) await box.check();
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  for (const name of ["clip", "loop"]) {
    const mp4 = await (await page.request.get(`${baseURL}/__demo/file?path=media/videos/${name}.mp4`)).body();
    expect(mp4.subarray(4, 8).toString()).toBe("ftyp"); expect(mp4.includes(Buffer.from("avc1"))).toBe(true);
    const webp = await (await page.request.get(`${baseURL}/__demo/file?path=media/videos/${name}.webp`)).body();
    expect(webp.subarray(0, 4).toString()).toBe("RIFF"); expect(webp.subarray(8, 12).toString()).toBe("WEBP");
  }
  // Without a native AAC encoder the existing AAC track is copied and still decodes; the GIF's video stays silent.
  const sound = await page.evaluate(async base => {
    const { Input, BufferSource, ALL_FORMATS, AudioSampleSink } = await (await import("/src/page-builder/video-prepare.ts")).loadVideoTools();
    const read = async (name: string) => {
      const input = new Input({ source: new BufferSource(await (await fetch(`${base}/__demo/file?path=media/videos/${name}.mp4`)).arrayBuffer()), formats: ALL_FORMATS });
      const track = await input.getPrimaryAudioTrack();
      if (!track) return null;
      const sample = await new AudioSampleSink(track).getSample(0.5);
      const result = { codec: await track.getCodec(), channels: sample?.numberOfChannels, decoded: Boolean(sample?.numberOfFrames) };
      sample?.close(); return result;
    };
    return { clip: await read("clip"), loop: await read("loop") };
  }, baseURL);
  expect(sound).toEqual({ clip: { codec: "aac", channels: 2, decoded: true }, loop: null });
});
test("converted GIF cannot be chosen or used in an image picker; Close saves video without placement", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const before = await effectiveSource(page, baseURL, "index.html");
  // Slice 39's Image button replaced the Edit bar's Choose image…: open the picker by double-click.
  const picker = await openPickerOn(page, page.frameLocator(".native-preview-frame").locator(".hero img"));
  await picker.locator('input[name="media-upload"]').setInputFiles({ name: "Loop.gif", mimeType: "image/gif", buffer: animatedGif() });
  const choice = picker.getByRole("button", { name: "Choose Loop.gif", exact: true });
  await expect(choice).toBeEnabled(); await expect(choice).toHaveAttribute("aria-pressed", "false");
  await choice.click(); await expect(picker.getByRole("button", { name: "Use", exact: true })).toBeDisabled();
  await expect(picker).toContainText("This file does not fit this spot");
  await picker.getByRole("button", { name: "Close", exact: true }).click();
  await expect.poll(() => storedDraft(page, "media/videos/loop.mp4")).toBeDefined();
  expect(await effectiveSource(page, baseURL, "index.html")).toBe(before);
});

/** Holds pdf.js's worker script, so a PDF's first-page preview waits until released. */
async function holdPdfWorker(page: Page) {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let requested!: () => void;
  const seen = new Promise<void>(resolve => { requested = resolve; });
  await page.route("**/pdf.worker.min.mjs*", async route => { requested(); await held; await route.continue(); });
  return { seen, release };
}
const reportPdf = () => [{ name: "Report.pdf", type: "application/pdf", base64: onePagePdf().toString("base64") }];

test("a PDF preview released late but in time is added with its first-page picture", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const explorer = await filesTab(page), worker = await holdPdfWorker(page);
  await dropOnFiles(page, reportPdf());
  const summary = explorer.getByRole("region", { name: "Files being added" });
  await worker.seen;
  await expect(summary.locator(".media-library__adding-row").filter({ hasText: "Report.pdf" })).toContainText("Preparing…");
  worker.release();
  await expect(summary.getByRole("status")).toHaveText("Added 1 file");
  await expect.poll(() => storedDraft(page, "report.pdf")).toBeDefined();
  await expect.poll(() => storedDraft(page, "report.webp")).toBeDefined();
});

test("a PDF cancelled while its preview is held adds nothing, and the late preview writes nothing", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const explorer = await filesTab(page), worker = await holdPdfWorker(page);
  await dropOnFiles(page, reportPdf());
  const summary = explorer.getByRole("region", { name: "Files being added" });
  await worker.seen;
  await summary.getByRole("button", { name: "Cancel adding Report.pdf", exact: true }).click();
  await expect(summary.locator(".media-library__adding-row").filter({ hasText: "Report.pdf" })).toHaveCount(0);
  worker.release();
  await page.waitForResponse("**/pdf.worker.min.mjs*").catch(() => undefined);
  // fixed-wait: Asserts the released preview of a cancelled PDF never writes a file; nothing observable follows.
  await page.waitForTimeout(1_500);
  expect(await storedDraft(page, "report.pdf")).toBeUndefined();
  expect(await storedDraft(page, "report.webp")).toBeUndefined();
});

test("a PDF whose preview passes the 30-second limit is added unchanged with a note; the late preview writes nothing", async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  await open(page, baseURL);
  const explorer = await filesTab(page), worker = await holdPdfWorker(page);
  await dropOnFiles(page, reportPdf());
  const summary = explorer.getByRole("region", { name: "Files being added" });
  await worker.seen;
  await expect(summary.getByRole("status")).toHaveText("Added 1 file", { timeout: 45_000 });
  await expect(page.locator("#status")).toContainText("Report.pdf was added without a preview picture.");
  await expect.poll(() => storedDraft(page, "report.pdf")).toBeDefined();
  worker.release();
  await page.waitForResponse("**/pdf.worker.min.mjs*").catch(() => undefined);
  // fixed-wait: Asserts the preview released after the time limit never writes a picture; nothing observable follows.
  await page.waitForTimeout(1_500);
  expect(await storedDraft(page, "report.webp")).toBeUndefined();
});

/** The demo repository reports no size: every listing that carries it gets `kib`. */
async function repoSize(page: Page, kib: number) {
  const patch = (value: unknown): unknown => Array.isArray(value) ? value.map(patch)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, patch(inner)])
      .concat((value as { full_name?: string }).full_name === "native-demo-user/native-demo" ? [["size", kib]] : []))
    : value;
  await page.route(/\/api\//, async route => {
    if (route.request().method() !== "GET") return route.fallback();
    const response = await route.fetch(), text = await response.text();
    if (!text.includes("native-demo-user/native-demo") || !/json/.test(response.headers()["content-type"] ?? "")) return route.fulfill({ response, body: text });
    await route.fulfill({ response, json: patch(JSON.parse(text)) });
  });
}

test("Adding settings: each kind is one card of choices with a ✓ on the chosen one; arrows move it; Keep original is a switch row", async ({ page, baseURL }) => {
  await repoSize(page, 312_500);
  await open(page, baseURL);
  const media = await adding(page);
  const images = media.getByRole("group", { name: "Images", exact: true });
  const rows = images.locator(".media-settings__choice");
  await expect(rows).toHaveCount(4);
  // One card per kind, 12 px corners; each row at least 48 px, with no visible radio dot.
  await expect(images.locator(".media-settings__card")).toHaveCSS("border-top-left-radius", "12px");
  for (const row of await rows.all()) {
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await expect(row.getByRole("radio")).toHaveCSS("opacity", "0");
  }
  await expect(rows.nth(1).locator(".media-settings__hint")).toHaveCSS("font-size", "13px");
  const ticks = () => rows.evaluateAll(list => list.map(row => getComputedStyle(row.querySelector(".media-settings__tick")!).visibility));
  await expect.poll(ticks).toEqual(["hidden", "visible", "hidden", "hidden"]);

  // Keyboard: the arrows still move between choices, and the ✓ follows.
  await images.getByRole("radio", { name: /^Balanced/ }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(images.getByRole("radio", { name: /^Higher quality/ })).toBeChecked();
  await expect.poll(ticks).toEqual(["hidden", "hidden", "visible", "hidden"]);
  await expect(rows.nth(2)).toHaveCSS("outline-style", "solid");
  await expect.poll(async () => JSON.parse((await storedDraft(page, ".editor/media.json"))?.content ?? "{}").adding).toEqual({ image: "higher" });
  await page.keyboard.press("ArrowUp");
  await expect(images.getByRole("radio", { name: /^Balanced/ })).toBeChecked();
  await expect.poll(async () => JSON.parse((await storedDraft(page, ".editor/media.json"))?.content ?? "{}").adding).toBeUndefined();
  await expect(media.getByRole("button", { name: "Reset to defaults", exact: true })).toBeHidden();

  // Keep original: a click anywhere on its row turns the switch on; Reset appears as a text button.
  const keep = media.getByRole("checkbox", { name: /^Keep original/ });
  await media.locator(".media-settings__keep .media-settings__title").click();
  await expect(keep).toBeChecked();
  const reset = media.getByRole("button", { name: "Reset to defaults", exact: true });
  await expect(reset).toBeVisible();
  await expect(reset).toHaveClass(/text-button/);
  await reset.click();
  await expect(keep).not.toBeChecked();
  await expect(reset).toBeHidden();
  await expect(media.getByRole("heading", { name: "Adding settings", exact: true })).toBeFocused();

  // Repository size: the size large, the allowance small, a rounded bar in the primary colour.
  const size = media.getByRole("region", { name: "Repository size", exact: true });
  await expect(size.locator(".media-settings__used")).toHaveText("320 MB of 1 GB GitHub Pages allows");
  await expect(size.locator(".media-settings__used strong")).toHaveCSS("font-size", "20px");
  await expect(size.locator(".media-settings__used strong")).toHaveCSS("font-weight", "600");
  await expect(size.getByRole("meter", { name: "Repository size: 320 MB of 1 GB" })).not.toHaveClass(/is-near-full/);
  await expect(size.locator(".media-settings__warning")).toHaveCount(0);
});

test("Adding settings: at 900 MB the size bar turns amber and the warning shows", async ({ page, baseURL }) => {
  await repoSize(page, 878_907);
  await open(page, baseURL);
  const media = await adding(page);
  const size = media.getByRole("region", { name: "Repository size", exact: true });
  await expect(size.locator(".media-settings__used strong")).toHaveText("900 MB");
  const meter = size.getByRole("meter", { name: "Repository size: 900 MB of 1 GB" });
  await expect(meter).toHaveClass(/is-near-full/);
  const fill = await meter.evaluate(element => {
    const probe = document.createElement("span"); probe.style.color = "var(--color-warning)"; element.after(probe);
    const result = { fill: getComputedStyle(element).getPropertyValue("--fill").trim(), warning: getComputedStyle(probe).color };
    probe.style.color = result.fill; result.fill = getComputedStyle(probe).color; probe.remove(); return result;
  });
  expect(fill.fill).toBe(fill.warning);
  await expect(size.locator(".media-settings__warning")).toContainText("GitHub Pages stops publishing sites over 1 GB.");
});

test("the adding tray: a short line for a failed file, Retry an edged 36 px button, ✕ in the corner, the full reason under Review…", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const media = page.getByRole("region", { name: "Media", exact: true }), tab = page.getByRole("tab", { name: "Media", exact: true });
  if (!await tab.isVisible()) await page.locator("#explorer-toggle").click();
  await tab.click();
  const bytes = await photo(page);
  await media.locator('input[name="media-upload"]').setInputFiles([
    { name: "Tray-good.png", mimeType: "image/png", buffer: Buffer.from(bytes, "base64") },
    { name: "phone-export.png", mimeType: "image/png", buffer: Buffer.from("not a picture at all, only words ".repeat(20)) },
  ]);
  const tray = media.getByRole("region", { name: "Files being added", exact: true });
  await expect(tray.getByRole("status")).toHaveText("1 added · 1 couldn't be added", { timeout: 30_000 });
  const line = tray.getByRole("listitem");
  await expect(line).toHaveText(/^phone-export\.png couldn't be added\. [^.]+\.$/);
  // At most two lines.
  const lines = await line.evaluate(item => Math.round(item.getBoundingClientRect().height / parseFloat(getComputedStyle(item).lineHeight)));
  expect(lines).toBeLessThanOrEqual(2);

  const retry = tray.getByRole("button", { name: "Retry", exact: true });
  expect(Math.round((await retry.boundingBox())!.height)).toBe(36);
  await expect(retry).toHaveCSS("border-top-style", "solid");
  await expect(tray.getByRole("button", { name: "Review…", exact: true })).toHaveClass(/text-button/);
  // ✕ sits in the tray's top-right corner, beside the title, above the actions.
  const box = (await tray.boundingBox())!, close = (await tray.getByRole("button", { name: "Dismiss", exact: true }).boundingBox())!;
  expect(box.x + box.width - (close.x + close.width)).toBeLessThanOrEqual(12);
  expect(close.y - box.y).toBeLessThanOrEqual(12);
  expect(close.y + close.height).toBeLessThan((await retry.boundingBox())!.y);

  await tray.getByRole("button", { name: "Review…", exact: true }).click();
  await expect(media.getByRole("heading", { name: "Optimise", exact: true })).toBeVisible();
  await expect(media.locator(".media-library__sheet .media-library__problem")).toHaveText(/^phone-export\.png could not be prepared\. .+ again\.$/);
});

test("on a phone a failed file with a very long name still takes at most two lines; Review… has its whole name and reason", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, baseURL);
  const media = page.getByRole("region", { name: "Media", exact: true }), tab = page.getByRole("tab", { name: "Media", exact: true });
  if (!await tab.isVisible()) await page.locator("#explorer-toggle").click();
  await tab.click();
  const long = `${"holiday-photo-".repeat(10)}final.png`;
  await media.locator('input[name="media-upload"]').setInputFiles({ name: long, mimeType: "image/png", buffer: Buffer.from("not a picture at all, only words ".repeat(20)) });
  const tray = media.getByRole("region", { name: "Files being added", exact: true });
  await expect(tray.getByRole("status")).toHaveText("1 file couldn't be added", { timeout: 30_000 });
  const line = tray.getByRole("listitem");
  await expect(line).toHaveText(/^holiday-photo-holiday…-final\.png couldn't be added\. /);
  const fit = await line.evaluate(item => ({ lines: Math.round(item.getBoundingClientRect().height / parseFloat(getComputedStyle(item).lineHeight)), clipped: item.scrollHeight > item.clientHeight + 1 }));
  // Two lines at most, and nothing cut off: the advice is all there.
  expect(fit.lines).toBeLessThanOrEqual(2);
  expect(fit.clipped).toBe(false);
  await tray.getByRole("button", { name: "Review…", exact: true }).click();
  await expect(media.locator(".media-library__sheet .media-library__problem")).toHaveText(new RegExp(`^${long.replace(/\./g, "\\.")} could not be prepared\\. `));
});

test("Files: Review… takes a failed picture to Media's Optimise with its full reason", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const explorer = await filesTab(page);
  await dropOnFiles(page, [{ name: "phone-export.png", type: "image/png", base64: Buffer.from("not a picture at all, only words ".repeat(20)).toString("base64") }]);
  const summary = explorer.getByRole("region", { name: "Files being added" });
  await expect(summary.getByRole("status")).toHaveText("1 file couldn't be added", { timeout: 30_000 });
  await expect(summary.getByRole("listitem")).toHaveText(/^phone-export\.png couldn't be added\. /);
  await summary.getByRole("button", { name: "Review…", exact: true }).click();
  const media = page.getByRole("region", { name: "Media", exact: true });
  await expect(media.getByRole("heading", { name: "Optimise", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(media.locator(".media-library__sheet .media-library__problem")).toHaveText(/^phone-export\.png could not be prepared\. .+ again\.$/);
});
