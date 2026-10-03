import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Images", exact: true }).click();
  await expect(page.getByRole("region", { name: "Images", exact: true })).toBeVisible();
}
const library = (page: Page) => page.getByRole("region", { name: "Images", exact: true });
async function closeLibrary(page: Page) { await page.getByRole("tab", { name: "Pages", exact: true }).click(); await page.keyboard.press("Escape"); }

test("image library searches repository images and shows transitive page usage", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const panel = library(page);
  await expect(panel.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true })).toBeVisible();
  await expect.poll(() => panel.locator(".media-library__card img").first().evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await panel.getByLabel("Search images", { exact: true }).fill("studio-desk");
  await expect(panel.locator(".media-library__card")).toHaveCount(1);
  await panel.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  await expect(panel.getByRole("heading", { name: /Used on \d+ pages/ })).toBeVisible();
  await expect(panel.getByLabel("Default alt text", { exact: true })).toBeVisible();
});

test("rename updates references and metadata in one Undo", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const source = () => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html") as string);
  const before = await source();
  const panel = library(page);
  await panel.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  await panel.getByLabel("Default alt text", { exact: true }).fill("Studio portrait");
  await panel.getByLabel("Image tags", { exact: true }).fill("studio, portrait");
  await panel.getByRole("button", { name: "Save metadata", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, ".editor/media.json"))?.content).toContain("Studio portrait");
  await panel.getByLabel("New image filename", { exact: true }).fill("garden-desk.svg");
  await panel.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Details for images/garden-desk.svg", exact: true })).toBeVisible();
  await expect.poll(async () => (await storedDraft(page, ".editor/media.json"))?.content).toContain("images/garden-desk.svg");
  const renamed = await source();
  expect(renamed).toEqual(before.replaceAll("studio-desk.svg", "garden-desk.svg"));
  await closeLibrary(page);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDraft(page, ".editor/media.json"))?.content).toContain("images/studio-desk.svg");
  await expect.poll(() => storedDraft(page, "images/garden-desk.svg")).toBeUndefined();
  await expect.poll(source).toEqual(before);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(source).toEqual(renamed);
  await expect.poll(async () => (await storedDraft(page, ".editor/media.json"))?.content).toContain("images/garden-desk.svg");
  await expect.poll(async () => (await storedDraft(page, "images/studio-desk.svg"))?.deleted).toBe(true);
});

test("delete keeps metadata and binary deletion together until Undo", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const panel = library(page);
  await panel.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  await panel.getByLabel("Default alt text", { exact: true }).fill("Restore me");
  await panel.getByRole("button", { name: "Save metadata", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, ".editor/media.json"))?.content).toContain("Restore me");
  await panel.getByRole("button", { name: "Delete image…", exact: true }).click();
  await panel.getByRole("button", { name: "Delete images", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true })).toHaveCount(0);
  await expect.poll(async () => (await storedDraft(page, "images/studio-desk.svg"))?.deleted).toBe(true);
  await closeLibrary(page);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDraft(page, ".editor/media.json"))?.content).toContain("Restore me");
  await expect.poll(() => storedDraft(page, "images/studio-desk.svg")).toBeUndefined();
});

test("real optimisation worker resizes images and retains SVG and explicit originals", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const result = await page.evaluate(async (modulePath) => {
    const { optimiseMedia, DEFAULT_MEDIA_OPTIMISE } = await import(modulePath) as typeof import("../../src/page-builder/media-optimise");
    const canvas = document.createElement("canvas"); canvas.width = 128; canvas.height = 64;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#25813f"; ctx.fillRect(0, 0, 128, 64);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), "image/png"));
    const resized = await optimiseMedia(new File([blob], "garden.png", { type: "image/png" }), { ...DEFAULT_MEDIA_OPTIMISE, maxWidth: 64, responsive: false });
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'], "logo.svg", { type: "image/svg+xml" });
    const untouched = await optimiseMedia(svg, DEFAULT_MEDIA_OPTIMISE);
    const unsupported = new File(["original unsupported bytes"], "photo.heic");
    const kept = await optimiseMedia(unsupported, { ...DEFAULT_MEDIA_OPTIMISE, keepOriginal: true });
    return { width: resized.outputs[0].width, height: resized.outputs[0].height, type: resized.outputs[0].blob.type, svg: await untouched.outputs[0].blob.text(), original: await kept.outputs[0].blob.text() };
  }, "/src/page-builder/media-optimise.ts");
  expect(result.width).toBe(64); expect(result.height).toBe(32); expect(result.type).toBe("image/webp");
  expect(result.svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"'); expect(result.original).toBe("original unsupported bytes");
});

test("optimisation preview cannot replace a newer binary revision", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await page.evaluate(async (modulePaths) => {
    const { configureMediaPicker, openMediaPicker } = await import(modulePaths.picker) as typeof import("../../src/page-builder/media-picker");
    const { createMediaWorkspace } = await import(modulePaths.workspace) as typeof import("../../src/page-builder/media-workspace");
    let version = "binary-A", commits = 0;
    let bytes = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>'], { type: "image/svg+xml" });
    configureMediaPicker(createMediaWorkspace(async () => ({
      key: "receipt-browser", scope: { account: "test", repoId: 1, repo: "test/repo", branch: "main" },
      drafts: { get() { return undefined; }, save() { throw new Error("Legacy mutation"); }, remove() { throw new Error("Legacy mutation"); } },
      paths: ["index.html", "images/a.svg"], items: [{ path: "images/a.svg" }], pages: ["index.html"], components: {},
      assertLive() {}, async read(path) { return path === "index.html" ? '<img src="/images/a.svg">' : undefined; },
      async blob() { return bytes; }, assetVersion() { return version; }, async applyBatch() { commits++; },
      async write() { throw new Error("Legacy mutation"); }, changed() { throw new Error("Legacy mutation"); }, async rename() { throw new Error("Legacy mutation"); }, async remove() { throw new Error("Legacy mutation"); }, async openPage() {},
    })));
    Object.assign(window, { mediaReceiptProbe: {
      replace() { version = "binary-B"; bytes = new Blob(["newer binary B"], { type: "image/svg+xml" }); },
      state() { return { version, commits }; },
    } });
    await openMediaPicker();
  }, { picker: "/src/page-builder/media-picker.ts", workspace: "/src/page-builder/media-workspace.ts" });
  const panel = page.getByRole("dialog", { name: "Images", exact: true });
  await panel.getByRole("button", { name: "Details for images/a.svg", exact: true }).click();
  await panel.getByRole("button", { name: "Optimise image…", exact: true }).click();
  await panel.getByRole("button", { name: "Preview optimisation", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Add optimised copies", exact: true })).toBeEnabled();
  await page.evaluate(() => (window as unknown as { mediaReceiptProbe: { replace(): void } }).mediaReceiptProbe.replace());
  await panel.getByRole("button", { name: "Add optimised copies", exact: true }).click();
  await expect(panel.locator(".media-library__message")).toContainText("changed since its optimisation preview");
  const state = await page.evaluate(() => (window as unknown as { mediaReceiptProbe: { state(): { version: string; commits: number } } }).mediaReceiptProbe.state());
  expect(state).toEqual({ version: "binary-B", commits: 0 });
});

test("cancelling optimisation aborts pending worker work and keeps Add disabled", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const panel = library(page);
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  let release: (() => void) | undefined;
  await page.route("**/src/page-builder/image-optimise.worker.ts*", async (route) => {
    await new Promise<void>((resolve) => { release = resolve; });
    await route.continue().catch(() => undefined);
  });
  await panel.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  await panel.getByRole("button", { name: "Optimise image…", exact: true }).click();
  await panel.getByRole("button", { name: "Preview optimisation", exact: true }).click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  release!();
  await expect(panel.getByRole("button", { name: "Add optimised copies", exact: true })).not.toBeVisible();
  await closeLibrary(page);
  await expect(panel).not.toBeVisible();
  expect(errors).toEqual([]);
});

test("the editor CSP permits decoding generated image Blob URLs", async ({ page, baseURL }) => {
  const response = await page.goto(baseURL!);
  expect(response?.headers()["content-security-policy"]).toMatch(/img-src[^;]*blob:/);
  const width = await page.evaluate(async () => {
    const url = URL.createObjectURL(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="24" height="12"><rect width="24" height="12"/></svg>'], { type: "image/svg+xml" }));
    const image = new Image(); image.src = url;
    try { await image.decode(); return image.naturalWidth; } finally { URL.revokeObjectURL(url); }
  });
  expect(width).toBe(24);
});
