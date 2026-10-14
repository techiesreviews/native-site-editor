import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Media", exact: true }).click();
  await expect(page.getByRole("region", { name: "Media", exact: true })).toBeVisible();
}
const library = (page: Page) => page.getByRole("region", { name: "Media", exact: true });
async function closeLibrary(page: Page) { await page.getByRole("tab", { name: "Pages", exact: true }).click(); await page.keyboard.press("Escape"); }

test("image library searches repository images and shows transitive page usage", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const panel = library(page);
  await expect(panel.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true })).toBeVisible();
  await expect.poll(() => panel.locator(".media-library__card img").first().evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await panel.getByLabel("Search media", { exact: true }).fill("studio-desk");
  await expect(panel.locator(".media-library__card")).toHaveCount(1);
  await panel.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  await expect(panel.locator("summary").filter({ hasText: "Usage" })).toContainText(/Used on \d+ pages?|No uses found|Not checked yet/);
  await expect(panel.getByLabel("Description", { exact: true })).toBeVisible();
});

test("rename updates references and metadata in one Undo", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const source = () => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html") as string);
  const before = await source();
  const panel = library(page);
  await panel.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  await panel.getByLabel("Description", { exact: true }).fill("Studio portrait");
  await panel.getByLabel("New collection", { exact: true }).fill("Studio portraits");
  await panel.getByRole("button", { name: "Save details", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, ".editor/media.json"))?.content).toContain("Studio portrait");
  await panel.getByLabel("File name", { exact: true }).fill("garden-desk.svg");
  await panel.getByRole("button", { name: "Save details", exact: true }).click();
  // File details reopens on the renamed file; Back shows its tile.
  await expect(panel.getByLabel("File name", { exact: true })).toHaveValue("garden-desk.svg");
  await panel.getByRole("button", { name: "Back", exact: true }).click();
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

test("one Save details with a description, Always keep and a new name is one Undo step", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const source = () => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html") as string);
  const before = await source();
  expect(await storedDraft(page, ".editor/media.json")).toBeUndefined();
  const panel = library(page);
  await panel.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  await panel.getByLabel("Description", { exact: true }).fill("Studio portrait");
  await panel.getByRole("checkbox", { name: "Always keep", exact: true }).check();
  await panel.getByLabel("File name", { exact: true }).fill("garden-desk.svg");
  await panel.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(panel.getByLabel("File name", { exact: true })).toHaveValue("garden-desk.svg");
  await expect(panel.getByLabel("Description", { exact: true })).toHaveValue("Studio portrait");
  await expect(panel.getByRole("checkbox", { name: "Always keep", exact: true })).toBeChecked();
  const records = JSON.parse((await storedDraft(page, ".editor/media.json"))!.content!);
  expect(records.files["images/garden-desk.svg"]).toEqual({ description: { text: "Studio portrait" }, alwaysKeep: true });
  await expect.poll(source).toEqual(before.replaceAll("studio-desk.svg", "garden-desk.svg"));
  await closeLibrary(page);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDraft(page, ".editor/media.json")).toBeUndefined();
  await expect.poll(() => storedDraft(page, "images/garden-desk.svg")).toBeUndefined();
  await expect.poll(source).toEqual(before);
});

test("a taken name refuses the whole Save details", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const panel = library(page);
  await panel.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  await panel.getByLabel("Description", { exact: true }).fill("Never saved");
  await panel.getByLabel("File name", { exact: true }).fill("placeholder.svg");
  await panel.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(panel.locator(".media-library__message")).toContainText("images/placeholder.svg is taken. Try images/placeholder-2.svg.");
  expect(await storedDraft(page, ".editor/media.json")).toBeUndefined();
  await expect(panel.getByLabel("Description", { exact: true })).toHaveValue("Never saved");
});

test("delete keeps metadata and binary deletion together until Undo", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const panel = library(page);
  await panel.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  await panel.getByLabel("Description", { exact: true }).fill("Restore me");
  await panel.getByRole("button", { name: "Save details", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, ".editor/media.json"))?.content).toContain("Restore me");
  await panel.getByRole("button", { name: "Remove file…", exact: true }).click();
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
    const keptSvg = await optimiseMedia(new File([await svg.text()], "Logo.SVG", { type: "image/svg+xml" }), { ...DEFAULT_MEDIA_OPTIMISE, keepOriginal: true });
    const summary = async (value: typeof kept) => ({ outputs: value.outputs.length, extension: value.outputs[0].extension, bytes: await value.outputs[0].blob.text(), before: value.before, after: value.after, note: value.note });
    return { width: resized.outputs[0].width, height: resized.outputs[0].height, type: resized.outputs[0].blob.type, svg: await untouched.outputs[0].blob.text(), svgNote: untouched.note, kept: await summary(kept), keptSvg: await summary(keptSvg) };
  }, "/src/page-builder/media-optimise.ts");
  expect(result.width).toBe(64); expect(result.height).toBe(32); expect(result.type).toBe("image/png"); // A flat graphic keeps the smaller lossless PNG.
  expect(result.svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"'); expect(result.svgNote).toBe("SVG and animated GIF are kept untouched, including their metadata.");
  // Keep original returns the file as is and takes precedence over the SVG/GIF untouched case.
  const keptNote = "Original bytes and metadata are kept. Unsupported formats may not display on the web.";
  expect(result.kept).toEqual({ outputs: 1, extension: "heic", bytes: "original unsupported bytes", before: 26, after: 26, note: keptNote });
  expect(result.keptSvg).toMatchObject({ outputs: 1, extension: "svg", note: keptNote }); expect(result.keptSvg.bytes).toBe(result.svg);
});

test("real worker keeps a smaller source only without its personal details, with identical pixels", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const result = await page.evaluate(async (modulePath) => {
    const { optimiseMedia, mediaImageRecipe } = await import(modulePath) as typeof import("../../src/page-builder/media-optimise");
    const latin = (text: string) => Uint8Array.from(text, char => char.charCodeAt(0));
    const join = (...parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0)); let at = 0; for (const part of parts) { out.set(part, at); at += part.length; } return out; };
    const crc = (bytes: Uint8Array) => { let c = ~0; for (const byte of bytes) { c ^= byte; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; } return ~c >>> 0; };
    const draw = (paint: (ctx: CanvasRenderingContext2D) => void, type: string, quality?: number) => {
      const canvas = document.createElement("canvas"); canvas.width = 400; canvas.height = 300; paint(canvas.getContext("2d")!);
      return new Promise<Uint8Array>(resolve => canvas.toBlob(async blob => resolve(new Uint8Array(await blob!.arrayBuffer())), type, quality));
    };
    const pixels = async (blob: Blob) => {
      const bitmap = await createImageBitmap(blob), canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0); const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      return { width: bitmap.width, height: bitmap.height, hash: crc(new Uint8Array(data.buffer)) };
    };
    // A coarse JPEG with an EXIF segment carrying a location note (orientation absent).
    const tiff = join(latin("Exif\0\0II*\0"), new Uint8Array([8, 0, 0, 0, 0, 0, 0, 0, 0, 0]), latin("GPS 51.5N 0.1W camera serial"));
    const app1 = join(new Uint8Array([255, 225, (tiff.length + 2) >> 8, (tiff.length + 2) & 255]), tiff);
    const coarse = await draw(ctx => { for (let x = 0; x < 400; x += 8) for (let y = 0; y < 300; y += 8) { ctx.fillStyle = `hsl(${(x * 7 + y * 13) % 360} 70% 50%)`; ctx.fillRect(x, y, 8, 8); } }, "image/jpeg", 0.2);
    const jpeg = join(coarse.subarray(0, 2), app1, coarse.subarray(2));
    // A tight 1-bit noise PNG: far smaller than lossy WebP of the same pixels; a tEXt chunk carries a location note.
    const chunk = (type: string, data: Uint8Array) => {
      const typed = join(latin(type), data), out = new Uint8Array(12 + data.length), view = new DataView(out.buffer);
      view.setUint32(0, data.length); out.set(typed, 4); view.setUint32(8 + data.length, crc(typed)); return out;
    };
    const rows = new Uint8Array(300 * 51); let seed = 7;
    for (let i = 0; i < rows.length; i++) if (i % 51) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; rows[i] = seed >>> 24; }
    const idat = new Uint8Array(await new Response(new Blob([rows]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
    const header = new Uint8Array(13); new DataView(header.buffer).setUint32(0, 400); new DataView(header.buffer).setUint32(4, 300); header[8] = 1;
    const stripes = join(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", idat), chunk("IEND", new Uint8Array()));
    const png = join(stripes.subarray(0, 33), chunk("tEXt", latin("Comment\0GPS 51.5N 0.1W")), stripes.subarray(33));
    const run = async (bytes: Uint8Array, name: string, type: string) => {
      const file = new File([bytes], name, { type }), out = await optimiseMedia(file, { ...mediaImageRecipe(), responsive: false });
      const kept = new Uint8Array(await out.outputs[0].blob.arrayBuffer());
      return { before: bytes.length, after: kept.length, extension: out.outputs[0].extension, gps: new TextDecoder("latin1").decode(kept).includes("GPS"),
        source: await pixels(file), output: await pixels(out.outputs[0].blob) };
    };
    return { jpeg: await run(jpeg, "coarse.jpg", "image/jpeg"), png: await run(png, "stripes.png", "image/png") };
  }, "/src/page-builder/media-optimise.ts");
  for (const [kind, extension] of [["jpeg", "jpg"], ["png", "png"]] as const) {
    const value = result[kind];
    expect(value.extension, `${kind} ${value.before} -> ${value.after}`).toBe(extension); expect(value.gps, kind).toBe(false);
    expect(value.after, kind).toBeLessThan(value.before); expect(value.output, kind).toEqual(value.source);
  }
});

test("optimisation preview cannot replace a newer binary revision", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await page.evaluate(async (modulePaths) => {
    const { configureMediaPicker, mountMediaLibrary } = await import(modulePaths.picker) as typeof import("../../src/page-builder/media-picker");
    const { createMediaWorkspace } = await import(modulePaths.workspace) as typeof import("../../src/page-builder/media-workspace");
    let version = "binary-A", commits = 0;
    let bytes = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>'], { type: "image/svg+xml" });
    configureMediaPicker(createMediaWorkspace(async () => ({
      key: "receipt-browser", scope: { account: "test", repoId: 1, repo: "test/repo", branch: "main" },
      drafts: { get() { return undefined; }, save() { throw new Error("Legacy mutation"); }, remove() { throw new Error("Legacy mutation"); } },
      paths: ["index.html", "images/a.svg"], items: [{ path: "images/a.svg" }], pages: ["index.html"], components: {},
      assertLive() {}, async read(path) { return path === "index.html" ? '<img src="/images/a.svg">' : path === "images/a.svg" ? bytes.text() : undefined; },
      async blob() { return bytes; }, assetVersion() { return version; }, async applyBatch() { commits++; },
      async openPage() {},
    })));
    Object.assign(window, { mediaReceiptProbe: {
      replace() { version = "binary-B"; bytes = new Blob(["newer binary B"], { type: "image/svg+xml" }); },
      state() { return { version, commits }; },
    } });
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;right:0;top:60px;width:900px;height:calc(100vh - 60px);z-index:100;background:var(--surface)";
    document.body.append(host);
    await mountMediaLibrary(host).ready;
  }, { picker: "/src/page-builder/media-picker.ts", workspace: "/src/page-builder/media-workspace.ts" });
  const panel = page.getByRole("region", { name: "Media", exact: true });
  await panel.getByRole("button", { name: "Details for images/a.svg", exact: true }).click();
  await panel.getByRole("button", { name: "Optimise image…", exact: true }).click();
  await panel.getByRole("button", { name: "Preview optimisation", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Add optimised copies", exact: true })).toBeEnabled();
  await page.evaluate(() => (window as typeof window & { mediaReceiptProbe: { replace(): void } }).mediaReceiptProbe.replace());
  await panel.getByRole("button", { name: "Add optimised copies", exact: true }).click();
  await expect(panel.locator(".media-library__message")).toContainText("changed since its optimisation preview");
  const state = await page.evaluate(() => (window as typeof window & { mediaReceiptProbe: { state(): { version: string; commits: number } } }).mediaReceiptProbe.state());
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

// Default fixture, nightly: responsive copies follow an Images-tab rename into placed markup.
test("renaming an image family keeps responsive copies when placing it on a page", async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  for (const width of [1600, 480, 960]) {
    const content = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="240"><rect width="100%" height="100%" fill="green"/></svg>`;
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: width === 1600 ? "images/studio-desk.svg" : `images/studio-desk-${width}w.svg`, content } })).status()).toBe(204);
  }
  await open(page, baseURL);
  const panel = library(page);
  await panel.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  await panel.getByLabel("File name", { exact: true }).fill("garden-family.svg");
  await panel.getByRole("button", { name: "Save details", exact: true }).click();
  // File details reopens on the renamed file; Back shows its tile.
  await expect(panel.getByLabel("File name", { exact: true })).toHaveValue("garden-family.svg");
  await panel.getByRole("button", { name: "Back", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Details for images/garden-family.svg", exact: true })).toBeVisible();
  for (const width of [480, 960]) {
    await expect.poll(async () => (await storedDraft(page, `images/garden-family-${width}w.svg`))?.movedFrom).toBe(`images/studio-desk-${width}w.svg`);
  }
  await closeLibrary(page);
  await page.frameLocator(".native-preview-frame").locator(".hero-image").click();
  await page.getByRole("button", { name: "Choose image…", exact: true }).click();
  const chooser = page.getByRole("dialog", { name: "Choose image", exact: true });
  await chooser.getByRole("button", { name: "Choose images/garden-family.svg", exact: true }).click();
  await chooser.getByRole("button", { name: "Use image", exact: true }).click();
  const image = page.frameLocator(".native-preview-frame").locator(".hero-image");
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toContain('src="/images/garden-family.svg"');
  await expect(image).toHaveAttribute("srcset", /\/images\/garden-family-480w.svg 480w/);
  await expect(image).toHaveAttribute("srcset", /\/images\/garden-family-960w.svg 960w/);
});

// Default fixture: wider text and forwarding travel with the Images rename's single history step.
test("rename rewrites scripts, data, notes and settings with forwarding through Undo and Redo", async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  const before = {
    "app.js": 'const image="\\/images\\/studio-desk.svg?version=1#hero";',
    "data.json": '{"image":"/images/studio-desk.svg"}',
    "sitemap.xml": '<loc>/images/studio-desk.svg?a=1&amp;b=2</loc>',
    "AGENTS.md": 'Use /images/studio-desk.svg.',
    "_headers": '/images/studio-desk.svg\n  Cache-Control: max-age=10\n',
    "_redirects": '/ancient /images/studio-desk.svg 301\n',
  };
  for (const [path, content] of Object.entries({ ...before,
    ".editor/media.json": '{"version":2,"collections":[],"files":{"images/studio-desk.svg":{"alwaysKeep":true}}}',
  })) expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).status()).toBe(204);
  await open(page, baseURL);
  const panel = library(page);
  await panel.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  await panel.getByLabel("File name", { exact: true }).fill("garden-desk.svg");
  await panel.getByRole("button", { name: "Save details", exact: true }).click();
  // File details reopens on the renamed file; Back shows its tile.
  await expect(panel.getByLabel("File name", { exact: true })).toHaveValue("garden-desk.svg");
  await panel.getByRole("button", { name: "Back", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Details for images/garden-desk.svg", exact: true })).toBeVisible();
  for (const [path, content] of Object.entries(before)) {
    const after = content.replaceAll("studio-desk.svg", "garden-desk.svg") + (path === "_redirects" ? '/images/studio-desk.svg /images/garden-desk.svg 301\n' : "");
    await expect.poll(async () => (await storedDraft(page, path))?.content).toBe(after);
  }
  await closeLibrary(page);
  await page.locator(".code-editor__undo").first().click();
  for (const path of Object.keys(before)) await expect.poll(() => storedDraft(page, path)).toBeUndefined();
  await page.locator(".code-editor__redo").first().click();
  for (const [path, content] of Object.entries(before)) {
    const after = content.replaceAll("studio-desk.svg", "garden-desk.svg") + (path === "_redirects" ? '/images/studio-desk.svg /images/garden-desk.svg 301\n' : "");
    await expect.poll(async () => (await storedDraft(page, path))?.content).toBe(after);
  }
});
