import { expect, test, type Page } from "@playwright/test";
import { publishButton } from "./publish";
import { storedDraft } from "./drafts";

// Default fixture group: native-starter. Nightly only; slice 63 adds placement smoke coverage.
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const mounted = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")!);
const saved = async (page: Page, baseURL: string | undefined, path = "index.html") => {
  const response = await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`);
  expect(response.ok()).toBe(true); return response.text();
};
async function open(page: Page, baseURL: string | undefined, video = true) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  const source = `<!doctype html>\n<html lang="en">\n<head><title>Video page</title></head>\n<body>\n  <section id="scene">\n    <h1>Video page</h1>\n    ${video ? '<video src="/media/clip.mp4" poster="/images/placeholder.svg" controls preload="none" playsinline width="400" height="240" aria-label="Clip"><track kind="subtitles" src="/media/clip.vtt" srclang="en"></video>' : '<p>Section words</p>'}\n  </section>\n</body>\n</html>`;
  for (const [path, content] of Object.entries({ "index.html": source, "media/clip.mp4": "seeded video bytes", ".editor/media.json": JSON.stringify({ version: 2, collections: [], files: { "media/clip.mp4": { still: "images/placeholder.svg" } } }) })) {
    const response = await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } });
    expect(response.ok()).toBe(true);
  }
  await page.reload();
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await expect(frame(page).locator("#scene")).toBeVisible();
  await expect(page.locator("#content [role='textbox']").first()).toBeAttached();
  await page.request.post(`${baseURL}/__demo/slow?ms=0`);
}
async function save(page: Page) {
  await expect(publishButton(page)).toBeEnabled();
  await publishButton(page).click();
  await expect(page.locator("#status")).toHaveText(/Up to date with main|Selected files saved to GitHub\./, { timeout: 30_000 });
  await expect(publishButton(page)).toBeDisabled();
}
test("selected video loops silently, saves with player, then returns to play with sound on tap", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const video = frame(page).locator("#scene > video");
  await expect(video).not.toHaveAttribute("controls");
  await video.click();
  const loop = bar(page).getByRole("checkbox", { name: "Looping video", exact: true });
  await expect(loop).not.toBeChecked();
  const before = await mounted(page);
  await loop.check();
  await expect.poll(() => mounted(page)).toContain("muted loop");
  // One Undo restores the page and removes every newly created player file.
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => mounted(page)).toBe(before);
  for (const path of ["scripts/media-player.js", "scripts/media-online.js", "styles/media-player.css"]) expect(await storedDraft(page, path)).toBeUndefined();
  await video.click();
  await bar(page).getByRole("checkbox", { name: "Looping video", exact: true }).check();
  await expect.poll(() => mounted(page)).toContain("muted loop");
  await save(page);
  const on = await saved(page, baseURL);
  expect(on).toMatch(/<video[^>]*playsinline[^>]*muted loop/);
  expect(on).not.toContain("autoplay");
  // The subtitles track stays, so switching looping off again loses nothing.
  expect(on).toContain('<track kind="subtitles" src="/media/clip.vtt" srclang="en">');
  expect(on).toContain('<script type="module" src="/scripts/media-player.js"></script>');
  expect(await saved(page, baseURL, "scripts/media-player.js")).toContain("Looping video");
  await video.click();
  await bar(page).getByRole("checkbox", { name: "Looping video", exact: true }).uncheck();
  await expect.poll(() => mounted(page)).toContain('preload="none"');
  await save(page);
  const off = await saved(page, baseURL);
  const tag = /<video[^>]*>/.exec(off)?.[0] ?? "";
  expect(tag).toContain('preload="none"');
  expect(tag).toContain("controls");
  expect(tag).toContain("playsinline");
  expect(tag).not.toMatch(/\b(?:muted|loop|autoplay)\b/);
  expect(off).toContain('<track kind="subtitles" src="/media/clip.vtt" srclang="en">');
  expect(off.match(/src="\/scripts\/media-player.js"/g)).toHaveLength(1);
});
test("section background picked from Media saves as first child with player; Remove removes it", async ({ page, baseURL }) => {
  await open(page, baseURL, false);
  // Escape from a selected text child selects its section parent.
  await frame(page).locator("#scene p").click();
  await page.keyboard.press("Escape");
  await bar(page).getByRole("button", { name: "Background video", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Choose image", exact: true });
  await expect(picker.locator(".media-library__place")).toContainText("Background video");
  await picker.getByRole("button", { name: "Choose media/clip.mp4", exact: true }).click();
  await picker.getByRole("button", { name: "Use image", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect.poll(() => mounted(page)).toContain('<video data-background src="/media/clip.mp4"');
  await save(page);
  const content = await saved(page, baseURL);
  expect(content).toMatch(/<section id="scene">\s*<video data-background src="\/media\/clip.mp4" poster="\/images\/placeholder.svg" muted loop playsinline preload="none"><\/video>/);
  expect(content).toContain('src="/scripts/media-player.js"');
  await expect(frame(page).locator("#scene > :first-child")).toHaveJSProperty("tagName", "VIDEO");
  await frame(page).locator("#scene p").click();
  await page.keyboard.press("Escape");
  await bar(page).getByRole("button", { name: "Remove background video", exact: true }).click();
  await expect.poll(() => mounted(page)).not.toContain("data-background");
  await save(page);
  expect(await saved(page, baseURL)).not.toContain("data-background");
});
