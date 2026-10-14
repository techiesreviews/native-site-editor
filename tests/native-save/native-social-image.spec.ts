// Default fixture, nightly: real picker, image worker and one atomic settings draft batch.
import { expect, test, type Page } from "@playwright/test";
import { storedDraft, storedDrafts } from "./drafts";
import { openPageSettingsFromPages } from "./settings-entry";

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
  await panel(page).getByRole("button", { name: "Choose default image…", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Choose image", exact: true });
  await picker.getByRole("button", { name: "Choose images/sharing-source.png", exact: true }).click();
  await picker.getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(panel(page).getByLabel("Default social image", { exact: true })).toHaveValue("/images/sharing-source.png");
}

async function output(page: Page, path: string) {
  return page.evaluate(async path => {
    const { draftStore } = await import("/src/drafts.ts");
    const { uploadBytes, uploadKey } = await import("/src/uploads.ts");
    const draft = draftStore().get({ account: "native-demo-user", repoId: 501, repo: "native-demo-user/native-demo", branch: "main" }, path);
    if (!draft?.sourceSha) throw new Error("No sharing copy draft.");
    const blob = await uploadBytes().get(uploadKey(draft, draft.sourceSha));
    if (!blob) throw new Error("No sharing copy bytes.");
    const bitmap = await createImageBitmap(blob);
    const dimensions = { width: bitmap.width, height: bitmap.height, type: blob.type }; bitmap.close();
    return dimensions;
  }, path);
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
