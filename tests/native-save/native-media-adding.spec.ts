import { expect, test, type Page } from "@playwright/test";
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
async function undoAddition(page: Page, baseURL: string | undefined, before: string) {
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => effectiveSource(page, baseURL, "index.html")).toBe(before);
  await expect.poll(async () => (await storedDrafts(page)).filter(draft => draft.path.startsWith("images/added")).length).toBe(0);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toContain("/images/added.webp");
  await expect.poll(() => storedDraft(page, "images/added-480w.webp")).toBeDefined();
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
  expect(await storedDraft(page, "images/added.webp")).toBeUndefined();
  await picker.getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker).toBeHidden();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toContain('src="/images/added.webp"');
  for (const path of ["images/added.webp", "images/added-480w.webp", "images/added-960w.webp", "images/added-1600w.webp"])
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
  expect(await storedDraft(page, "images/added.webp")).toBeUndefined();
  await picker.getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker).toBeHidden();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toContain('src="/images/added.webp"');
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toContain('srcset="/images/added-480w.webp 480w');
  await undoAddition(page, baseURL, before);
});

test("Close saves every ready file once, cancels unfinished preparation, and places nothing", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const before = (await effectiveSource(page, baseURL, "index.html"))!;
  await page.frameLocator(".native-preview-frame").locator(".hero img").click();
  await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("button", { name: "Choose image…", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Choose image", exact: true });
  await expect(picker.getByRole("button", { name: "Choose images/placeholder.svg", exact: true })).toBeVisible();
  await page.evaluate(() => {
    // Deliberately hold the encoder so Close races real in-flight preparation.
    Worker.prototype.postMessage = function () {};
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
  expect(await storedDraft(page, "images/unfinished.webp")).toBeUndefined();
  await expect.poll(() => storedDraft(page, "images/added.svg")).toBeDefined();
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDraft(page, "images/added.svg")).toBeUndefined();
});

test("Use saves all ready files across picker additions with placement in one batch", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const before = (await effectiveSource(page, baseURL, "index.html"))!;
  await page.frameLocator(".native-preview-frame").locator(".hero img").click();
  await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("button", { name: "Choose image…", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Choose image", exact: true });
  await expect(picker.getByRole("button", { name: "Choose images/placeholder.svg", exact: true })).toBeVisible();
  for (const name of ["first.svg", "second.svg"]) {
    await picker.locator('input[name="media-upload"]').setInputFiles({ name, mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"/>') });
    await expect(picker.getByRole("button", { name: `Choose ${name}`, exact: true })).toBeEnabled();
  }
  expect(await storedDraft(page, "images/first.svg")).toBeUndefined();
  await picker.getByRole("button", { name: "Choose second.svg", exact: true }).click();
  await picker.getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker).toBeHidden();
  await expect.poll(() => storedDraft(page, "images/first.svg")).toBeDefined();
  await expect.poll(() => storedDraft(page, "images/second.svg")).toBeDefined();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toContain('/images/second.svg');
  // An SVG stored as it is still carries its own size into the placed markup.
  const placed = /<img\b[^>]*\/images\/second\.svg[^>]*>/.exec((await storedDraft(page, "index.html"))!.content)![0];
  expect(placed).toContain('width="12"'); expect(placed).toContain('height="12"');
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => effectiveSource(page, baseURL, "index.html")).toBe(before);
  for (const path of ["images/first.svg", "images/second.svg"]) await expect.poll(() => storedDraft(page, path)).toBeUndefined();
});

test("picker Review retains Optimise but reviewed files stay held until Use", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.frameLocator(".native-preview-frame").locator(".hero img").click();
  await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("button", { name: "Choose image…", exact: true }).click();
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
  expect(await storedDraft(page, "images/reviewed.svg")).toBeUndefined();
  await picker.getByRole("button", { name: "Choose reviewed.svg", exact: true }).click();
  await picker.getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker).toBeHidden();
  await expect.poll(() => storedDraft(page, "images/reviewed.svg")).toBeDefined();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toContain('/images/reviewed.svg');
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
  await expect(page.locator("#status")).toHaveText("Added guide.pdf.");
  await expect(explorer.locator(".file-row[data-path='guide.pdf']")).toBeVisible();
});

test("cancelling a held file while Use reads its size places nothing", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const before = (await effectiveSource(page, baseURL, "index.html"))!;
  await page.frameLocator(".native-preview-frame").locator(".hero img").click();
  await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("button", { name: "Choose image…", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Choose image", exact: true });
  await expect(picker.getByRole("button", { name: "Choose images/placeholder.svg", exact: true })).toBeVisible();
  await picker.locator('input[name="media-upload"]').setInputFiles({ name: "held.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"/>') });
  await picker.getByRole("button", { name: "Choose held.svg", exact: true }).click();
  // Hold the size read that Use starts, cancel the file, then let the read finish.
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
  await page.frameLocator(".native-preview-frame").locator(".hero img").click();
  await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("button", { name: "Choose image…", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Choose image", exact: true });
  await expect(picker.getByRole("button", { name: "Choose images/placeholder.svg", exact: true })).toBeVisible();
  // The encoder never answers, so the PNG stays in preparation while the SVG is ready.
  await page.evaluate(() => { Worker.prototype.postMessage = function () {}; });
  await picker.locator('input[name="media-upload"]').setInputFiles([
    { name: "ready.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"/>') },
    { name: "slow.png", mimeType: "image/png", buffer: Buffer.from("held by worker") },
  ]);
  await expect(picker.getByRole("button", { name: "Choose ready.svg", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(picker.locator('.media-library__pending[data-state="preparing"]')).toHaveCount(1);
  await picker.getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker).toBeHidden();
  await expect(page.locator("#status")).toHaveText("Image replaced. 1 file still being prepared was not added.");
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toContain("/images/ready.svg");
  expect(await storedDraft(page, "images/slow.webp")).toBeUndefined();
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => effectiveSource(page, baseURL, "index.html")).toBe(before);
  await expect.poll(() => storedDraft(page, "images/ready.svg")).toBeUndefined();
});
