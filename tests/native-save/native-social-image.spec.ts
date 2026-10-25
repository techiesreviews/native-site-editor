// Default fixture, nightly: real picker, image worker and one atomic settings draft batch; the
// Social image popup (slice 44) frames the sharing copy.
import { expect, test, type Page } from "@playwright/test";
import { storedDraft, storedDrafts } from "./drafts";
import { openPageSettingsFromPages } from "./settings-entry";
import { animatedGif } from "./animated-gif";

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const panel = (page: Page) => page.getByRole("dialog", { name: "Site settings", exact: true });

async function pages(page: Page) {
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
}
async function fixture(page: Page, baseURL: string | undefined, address: boolean) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero img")).toBeVisible({ timeout: 30_000 });
  const original = await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 2400; canvas.height = 1600;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#23794c"; ctx.fillRect(200, 100, 1800, 1400);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "images/sharing-source.png", base64: original } })).status()).toBe(204);
  const config = JSON.parse(await (await page.request.get(`${baseURL}/__demo/file?path=.editor/config.json`)).text());
  config.site = { ...config.site, ...(address ? { url: "https://sharing.example/" } : {}) };
  if (!address) delete config.site.url;
  expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: ".editor/config.json", content: JSON.stringify(config) } })).status()).toBe(204);
  await page.reload();
  await expect(frame(page).locator(".hero img")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  return original;
}

async function chooseDefault(page: Page) {
  await pages(page);
  await page.getByRole("button", { name: "Site settings", exact: true }).click();
  await panel(page).getByRole("tab", { name: "Social", exact: true }).click();
  // An empty Social image: its Image button opens the picker for still pictures.
  await panel(page).getByRole("button", { name: "Choose default social image", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Choose image", exact: true });
  await expect(picker.getByRole("button", { name: "Choose images/sharing-source.png", exact: true })).toBeVisible();
  await expect(picker.getByRole("button", { name: /^Choose .*\.svg$/ })).toHaveCount(0);
  await picker.getByRole("button", { name: "Choose images/sharing-source.png", exact: true }).click();
  await picker.getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(panel(page).getByLabel("Default social image", { exact: true })).toHaveValue("/images/sharing-source.png");
}

async function output(page: Page, path: string, at?: { x: number; y: number }) {
  return page.evaluate(async ({ path, at }) => {
    const { draftStore } = await import("/src/drafts.ts");
    const { uploadBytes, uploadKey } = await import("/src/uploads.ts");
    const draft = draftStore().get({ account: "native-demo-user", repoId: 501, repo: "native-demo-user/native-demo", branch: "main" }, path);
    if (!draft?.sourceSha) throw new Error("No sharing copy draft.");
    const blob = await uploadBytes().get(uploadKey(draft, draft.sourceSha));
    if (!blob) throw new Error("No sharing copy bytes.");
    const bitmap = await createImageBitmap(blob);
    const dimensions: { width: number; height: number; type: string; green?: boolean } = { width: bitmap.width, height: bitmap.height, type: blob.type };
    if (at) {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      const [r, g, b] = ctx.getImageData(at.x, at.y, 1, 1).data;
      dimensions.green = g > 100 && r < 80 && b < 120;
    }
    bitmap.close();
    return dimensions;
  }, { path, at });
}

for (const address of [true, false]) {
  test(`default social image saves one centred JPEG ${address ? "at a full site address" : "without an address and explains it"}`, async ({ page, baseURL }) => {
    const original = await fixture(page, baseURL, address);
    await chooseDefault(page);
    if (!address) await expect(panel(page)).toContainText("Your site has no web address yet");
    await panel(page).getByRole("button", { name: "Apply site settings", exact: true }).click();
    await expect(panel(page)).not.toBeVisible();
    const path = "media/images/sharing-source-social.jpg", link = (address ? "https://sharing.example" : "") + "/" + path;
    for (const file of ["index.html", "about/index.html"]) await expect.poll(async () => (await storedDraft(page, file))?.content).toContain(`property="og:image" content="${link}"`);
    expect((await storedDraft(page, ".editor/config.json"))?.content).toContain(`"socialImage": "${link}"`);
    expect(await output(page, path)).toEqual({ width: 1200, height: 630, type: "image/jpeg" });
    expect(await storedDraft(page, "images/sharing-source.png")).toBeUndefined();
    expect((await (await page.request.get(`${baseURL}/__demo/file?path=images/sharing-source.png`)).body()).toString("base64")).toBe(original);
    expect((await storedDrafts(page)).filter(draft => draft.path.startsWith("media/images/"))).toHaveLength(1);
    if (!address) {
      await expect(page.locator("#status")).toContainText("linked without a web address");
      await pages(page); await openPageSettingsFromPages(page);
      const pagePanel = page.getByRole("dialog", { name: "Page settings", exact: true });
      await pagePanel.getByRole("tab", { name: "Social", exact: true }).click();
      await expect(pagePanel).toContainText("Your site has no web address yet");
      await pagePanel.getByRole("button", { name: "Cancel", exact: true }).click();
    }
    await page.locator(".code-editor__undo").first().click();
    await expect.poll(async () => (await storedDrafts(page)).length).toBe(0);
  });
}

test("a site address set in the same Apply gives the sharing copy its full address, with one Undo", async ({ page, baseURL }) => {
  await fixture(page, baseURL, false);
  await chooseDefault(page);
  await panel(page).getByRole("tab", { name: "General", exact: true }).click();
  await panel(page).getByLabel("Site address", { exact: true }).fill("https://name.github.io/my-site/");
  await panel(page).getByRole("button", { name: "Apply site settings", exact: true }).click();
  // The site's links move into the new folder in the same step (slice 80).
  await panel(page).getByRole("group", { name: /^This updates \d+ links in \d+ files to the new address\./ }).getByRole("button", { name: "Update links", exact: true }).click();
  await expect(panel(page)).not.toBeVisible();
  await expect(page.locator("#status")).toContainText(/Social image set as a draft\. Updated \d+ links in \d+ files to the new address\./);
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toMatch(/href="\/my-site\/styles\//);
  const link = "https://name.github.io/my-site/media/images/sharing-source-social.jpg";
  for (const file of ["index.html", "about/index.html"]) await expect.poll(async () => (await storedDraft(page, file))?.content).toContain(`property="og:image" content="${link}"`);
  const config = (await storedDraft(page, ".editor/config.json"))?.content ?? "";
  expect(config).toContain(`"socialImage": "${link}"`);
  expect(config).toContain('"url": "https://name.github.io/my-site/"');
  await expect(page.locator("#status")).toContainText("Added the .nojekyll file GitHub Pages needs.");
  expect((await storedDraft(page, ".nojekyll"))?.content).toBe("");
  await expect(page.locator("#status")).not.toContainText("linked without a web address");
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDrafts(page)).length).toBe(0);
});

test("a sharing copy preserves an existing .nojekyll without reading or rewriting it", async ({ page, baseURL }) => {
  await fixture(page, baseURL, true);
  expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: ".nojekyll", content: "keep this" } })).status()).toBe(204);
  await page.reload();
  await expect(frame(page).locator(".hero img")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await chooseDefault(page);
  await panel(page).getByRole("button", { name: "Apply site settings", exact: true }).click();
  await expect(panel(page)).toBeHidden();
  await expect(page.locator("#status")).toContainText("Social image set as a draft.");
  await expect(page.locator("#status")).not.toContainText("Added the .nojekyll");
  expect(await storedDraft(page, ".nojekyll")).toBeUndefined();
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDrafts(page)).length).toBe(0);
});

test("page social image and other page fields share one draft batch and preview own site addresses", async ({ page, baseURL }) => {
  await fixture(page, baseURL, true);
  await pages(page); await openPageSettingsFromPages(page);
  const settings = page.getByRole("dialog", { name: "Page settings", exact: true });
  await settings.getByLabel("Title", { exact: true }).fill("Sharing page");
  await settings.getByRole("tab", { name: "Social", exact: true }).click();
  await settings.getByLabel("Social image", { exact: true }).fill("https://sharing.example/images/sharing-source.png");
  await expect(settings.locator(".site-settings__card-image")).toBeVisible();
  await settings.getByRole("button", { name: "Apply page settings", exact: true }).click();
  await expect(settings).not.toBeVisible();
  const draft = await storedDraft(page, "index.html");
  expect(draft?.content).toContain("<title>Sharing page</title>");
  expect(draft?.content).toContain('property="og:image" content="https://sharing.example/media/images/sharing-source-social.jpg"');
  expect(await storedDraft(page, ".editor/config.json")).toBeUndefined();
  expect(await storedDraft(page, "about/index.html")).toBeUndefined();
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDrafts(page)).length).toBe(0);
});

test("choosing the picture a page already links still makes its sharing copy", async ({ page, baseURL }) => {
  await fixture(page, baseURL, true);
  const home = await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text();
  const tag = '<meta property="og:image" content="/images/sharing-source.png">';
  const linked = /<meta property="og:image"[^>]*>/.test(home) ? home.replace(/<meta property="og:image"[^>]*>/, tag) : home.replace("</head>", `  ${tag}\n</head>`);
  expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "index.html", content: linked } })).status()).toBe(204);
  await page.reload();
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await pages(page); await openPageSettingsFromPages(page);
  const settings = page.getByRole("dialog", { name: "Page settings", exact: true });
  await settings.getByRole("tab", { name: "Social", exact: true }).click();
  await expect(settings.getByLabel("Social image", { exact: true })).toHaveValue("/images/sharing-source.png");
  // A still picture opens the popup; Done with the frame left in the middle still makes its copy.
  await settings.getByRole("button", { name: "Change social image", exact: true }).click();
  const popup = page.getByRole("dialog", { name: "Social image", exact: true });
  await expect(popup).toContainText("sharing-source.png");
  await expect(popup.locator(".image-popup__card b")).toHaveText("Native Studio");
  await popup.getByRole("button", { name: "Done", exact: true }).click();
  await expect(popup).toHaveCount(0);
  await settings.getByRole("button", { name: "Apply page settings", exact: true }).click();
  await expect(settings).not.toBeVisible();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content)
    .toContain('property="og:image" content="https://sharing.example/media/images/sharing-source-social.jpg"');
  expect(await output(page, "media/images/sharing-source-social.jpg")).toEqual({ width: 1200, height: 630, type: "image/jpeg" });
});

test("the Social image popup moves the sharing copy's frame; Apply writes a fresh copy", async ({ page, baseURL }) => {
  await fixture(page, baseURL, true);
  await chooseDefault(page);
  await panel(page).getByRole("button", { name: "Apply site settings", exact: true }).click();
  await expect(panel(page)).not.toBeVisible();
  const first = "https://sharing.example/media/images/sharing-source-social.jpg";
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toContain(`content="${first}"`);
  // The centred copy cuts through the green square at its top middle.
  expect(await output(page, "media/images/sharing-source-social.jpg", { x: 600, y: 2 })).toMatchObject({ width: 1200, height: 630, green: true });

  await pages(page);
  await page.getByRole("button", { name: "Site settings", exact: true }).click();
  await panel(page).getByRole("tab", { name: "Social", exact: true }).click();
  const field = panel(page).getByLabel("Default social image", { exact: true });
  await expect(field).toHaveValue(first);
  const image = panel(page).getByRole("button", { name: "Change default social image", exact: true });
  // Slice 109: the trigger is the picture, 64 px, and a secondary Change… button.
  await expect(image).toHaveText("Change…");
  const thumb = panel(page).locator(".site-settings__thumb");
  await expect(thumb.locator("img")).toBeVisible();
  expect((await thumb.boundingBox())!.width).toBe(64);
  await image.click();
  // The copy re-opens on its picture, fixed to the sharing shape: no shape menu, Turn or large editor.
  const popup = page.getByRole("dialog", { name: "Social image", exact: true });
  await expect(popup.locator(".image-popup__where")).toHaveText("sharing-source.png");
  await expect(popup.locator(".image-popup__shape")).toHaveText("Sharing 1200 × 630");
  await expect(popup.getByRole("menu")).toHaveCount(0);
  await expect(popup.getByRole("button", { name: "Open large editor" })).toHaveCount(0);
  await expect(popup.getByRole("group", { name: "Turn" })).toHaveCount(0);
  await expect(popup.locator(".image-popup__card-site")).toHaveText("sharing.example");
  await expect(popup).toContainText("Saves a sharing copy of this frame");
  // Its own centred layer above the dialog, on the dialog's surface; the form stays whole under it.
  const box = (await popup.locator(".image-popup").boundingBox())!, view = page.viewportSize()!;
  expect(Math.abs(box.x + box.width / 2 - view.width / 2)).toBeLessThanOrEqual(2);
  expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(view.height);
  expect(await popup.locator(".image-popup").evaluate(element => getComputedStyle(element).backgroundColor))
    .toBe(await panel(page).evaluate(element => getComputedStyle(element).backgroundColor));
  const square = popup.getByRole("slider", { name: "Focus point" });
  await expect(square).toBeFocused();
  await expect(square).toHaveAttribute("aria-valuetext", /^50% across, 50% down/);
  // Escape leaves everything as it was, and the settings stay open.
  await page.keyboard.press("Shift+ArrowUp");
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(panel(page)).toBeVisible();
  await expect(field).toHaveValue(first);
  await expect(image).toBeFocused();

  // Done and then the settings' Cancel change nothing.
  await image.click();
  await expect(square).toBeFocused();
  await page.keyboard.press("Shift+ArrowDown");
  await popup.getByRole("button", { name: "Done", exact: true }).click();
  await expect(field).toHaveValue("/images/sharing-source.png");
  const drafts = JSON.stringify(await storedDrafts(page));
  await panel(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(panel(page)).not.toBeVisible();
  expect(JSON.stringify(await storedDrafts(page))).toBe(drafts);
  await pages(page);
  await page.getByRole("button", { name: "Site settings", exact: true }).click();
  await panel(page).getByRole("tab", { name: "Social", exact: true }).click();
  await expect(field).toHaveValue(first);

  // Move the frame to the top, Done: the field holds the picture until Apply.
  await image.click();
  await expect(square).toBeFocused();
  for (let step = 0; step < 5; step++) await page.keyboard.press("Shift+ArrowUp");
  await expect(square).toHaveAttribute("aria-valuetext", /^50% across, 0% down/);
  await popup.getByRole("button", { name: "Done", exact: true }).click();
  await expect(popup).toHaveCount(0);
  await expect(field).toHaveValue("/images/sharing-source.png");
  await expect(panel(page)).toContainText("Sharing frame chosen. Apply to save it.");
  // Re-opened before Apply, the moved frame is still there.
  await image.click();
  await expect(square).toHaveAttribute("aria-valuetext", /^50% across, 0% down/);
  await popup.getByRole("button", { name: "Close without changes", exact: true }).click();
  await panel(page).getByRole("button", { name: "Apply site settings", exact: true }).click();
  await expect(panel(page)).not.toBeVisible();

  // A new copy under a fresh name, cut from the top: above the green square.
  const second = "media/images/sharing-source-social-2.jpg";
  for (const file of ["index.html", "about/index.html"]) await expect.poll(async () => (await storedDraft(page, file))?.content).toContain(`property="og:image" content="https://sharing.example/${second}"`);
  expect((await storedDraft(page, ".editor/config.json"))?.content).toContain(`"socialImage": "https://sharing.example/${second}"`);
  expect(await output(page, second, { x: 600, y: 2 })).toMatchObject({ width: 1200, height: 630, type: "image/jpeg", green: false });
  const records = JSON.parse((await storedDraft(page, ".editor/media.json"))!.content);
  expect(records.files[second]).toMatchObject({ sharing: true, trimmedFrom: { source: "images/sharing-source.png", trim: { x: 0, y: 0, width: 1 } } });
  expect(records.files["media/images/sharing-source-social.jpg"]).toBeUndefined();
  // Re-opened, the popup shows the copy's frame on its picture.
  await pages(page);
  await page.getByRole("button", { name: "Site settings", exact: true }).click();
  await panel(page).getByRole("tab", { name: "Social", exact: true }).click();
  await image.click();
  await expect(square).toHaveAttribute("aria-valuetext", /^50% across, 0% down/);
  await page.keyboard.press("Escape");
  await panel(page).getByRole("button", { name: "Cancel", exact: true }).click();
  // One Undo puts the first copy back.
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toContain(`content="${first}"`);
});

// Slice 109: the Social image popup is its own layer above Site settings; a press on its backdrop
// closes it unchanged and the settings stay open.
test("a press on the Social image layer's backdrop closes it unchanged; Site settings stay open", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await fixture(page, baseURL, true);
  await chooseDefault(page);
  const field = panel(page).getByLabel("Default social image", { exact: true });
  const value = await field.inputValue();
  await panel(page).getByRole("button", { name: "Change default social image", exact: true }).click();
  const popup = page.getByRole("dialog", { name: "Social image", exact: true });
  const square = popup.getByRole("slider", { name: "Focus point" });
  await expect(square).toBeFocused();
  // The fixture's picture is see-through around its green square: the picture and the link card sit on
  // slice 106's checkerboard.
  await expect(popup.locator(".image-popup__pic[data-transparent]")).toHaveCount(1);
  await expect(popup.locator(".image-popup__card-image[data-transparent]")).toHaveCount(1);
  expect(await popup.locator(".image-popup__picbox").evaluate(element => getComputedStyle(element).backgroundImage)).toContain("conic-gradient");
  await page.keyboard.press("Shift+ArrowUp");
  // Settings are under the layer: inert until it closes.
  await expect(panel(page).getByRole("button", { name: "Apply site settings", exact: true })).toBeVisible();
  await page.mouse.click(12, 12);
  await expect(popup).toHaveCount(0);
  await expect(panel(page)).toBeVisible();
  await expect(field).toHaveValue(value);
  await expect(panel(page)).not.toContainText("Sharing frame chosen");
  // The settings work again once the layer is gone.
  await panel(page).getByRole("tab", { name: "General", exact: true }).click();
  await expect(panel(page).getByLabel("Site name", { exact: true })).toBeVisible();
});

// Slice 94: on a phone the Social popup is a sheet with its fixed label (no shape menu) and Done in reach.
test("on a phone the Social image popup shows its fixed label and keeps Done on screen", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page, baseURL, true);
  await chooseDefault(page);
  await panel(page).getByRole("button", { name: "Change default social image", exact: true }).click();
  const popup = page.getByRole("dialog", { name: "Social image", exact: true });
  await expect(popup.locator(".image-popup__shape")).toHaveText("Sharing 1200 × 630");
  for (const [width, height] of [[390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    await expect(popup.getByRole("menu")).toHaveCount(0);
    await expect(popup.getByRole("button", { name: /^Shape/ })).toHaveCount(0);
    await expect(popup.getByRole("button", { name: "Done", exact: true })).toBeInViewport({ ratio: 1 });
    await expect(popup.getByText("Saves a sharing copy of this frame")).toBeInViewport({ ratio: 1 });
  }
  await popup.getByRole("button", { name: "Done", exact: true }).click();
  await expect(popup).toHaveCount(0);
  await expect(panel(page)).toBeVisible();
});

test("an animated picture is not framed: the Image button says so and offers the picker", async ({ page, baseURL }) => {
  await fixture(page, baseURL, true);
  expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "images/moving.gif", base64: animatedGif().toString("base64") } })).status()).toBe(204);
  await page.reload();
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await pages(page); await openPageSettingsFromPages(page);
  const settings = page.getByRole("dialog", { name: "Page settings", exact: true });
  await settings.getByRole("tab", { name: "Social", exact: true }).click();
  await settings.getByLabel("Social image", { exact: true }).fill("/images/moving.gif");
  await settings.getByRole("button", { name: "Change social image", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Choose image", exact: true });
  await expect(picker).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Social image", exact: true })).toHaveCount(0);
  await expect(settings).toContainText("Animated pictures cannot be framed for sharing. Choose a still picture.");
  await picker.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(settings.getByLabel("Social image", { exact: true })).toHaveValue("/images/moving.gif");
});
