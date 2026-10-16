import { expect, test, type Page } from "@playwright/test";
import { openEditor, openMedia } from "../support/scenarios";
import { storedDraft } from "./drafts";
import { animatedGif } from "./animated-gif";

// Improve images (slice 74): Media's More lists pages with pictures to improve; a row is fixed in
// one change, Undo puts it back. Default fixture group (the frozen native starter).
test.beforeEach(({ page }) => page.setDefaultTimeout(20_000));

const pane = (page: Page) => page.getByRole("region", { name: "Media", exact: true });
const tab = (page: Page) => page.getByRole("tab", { name: "Media", exact: true });

/** A 640 × 360 PNG still for the stubbed YouTube service. */
async function stillPng(page: Page) {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 360;
    const context = canvas.getContext("2d")!; context.fillStyle = "#3a6"; context.fillRect(0, 0, 640, 360);
    return canvas.toDataURL("image/png").split(",")[1];
  });
}
/** A 2000 × 1000 JPEG of noise: well over 200 KB, so it is heavy. */
async function heavyJpeg(page: Page, seed: number) {
  return page.evaluate(start => {
    const canvas = document.createElement("canvas"); canvas.width = 2000; canvas.height = 1000;
    const context = canvas.getContext("2d")!, pixels = context.createImageData(canvas.width, canvas.height);
    let value = start;
    for (let i = 0; i < pixels.data.length; i += 4) {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      pixels.data[i] = value & 255; pixels.data[i + 1] = value >>> 8 & 255; pixels.data[i + 2] = value >>> 16 & 255; pixels.data[i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/jpeg", .95).split(",")[1];
  }, seed);
}
async function commit(page: Page, baseURL: string | undefined, data: { path: string; content?: string; base64?: string }) {
  expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data })).status()).toBe(204);
}
const pageHtml = (title: string, picture: string) =>
  `<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><title>${title}</title></head>\n<body>\n<main><h1>${title}</h1>\n<img src="/${picture}" alt="${title} photo">\n</main>\n</body>\n</html>\n`;

/** Pages, each with its own heavy JPEG, then Media → More → Improve images. */
async function openImprove(page: Page, baseURL: string | undefined, titles: string[]) {
  await page.goto(baseURL!);
  for (const [index, title] of titles.entries()) {
    const slug = title.toLowerCase();
    await commit(page, baseURL, { path: `images/${slug}.jpg`, base64: await heavyJpeg(page, 35 + index) });
    await commit(page, baseURL, { path: `${slug}/index.html`, content: pageHtml(title, `images/${slug}.jpg`) });
  }
  await showImprove(page, baseURL);
  for (const title of titles) await expect(row(page, title)).toBeVisible();
}
/** The editor on the home page, then Media → More → Improve images. */
async function showImprove(page: Page, baseURL: string | undefined) {
  await openEditor(page, baseURL);
  await openMedia(page);
  await pane(page).getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Improve images/ }).click();
  await expect(pane(page).getByRole("heading", { name: "Improve images", exact: true })).toBeVisible();
}
const row = (page: Page, title: string) => pane(page).locator(".media-improve__row").filter({ has: page.getByText(title, { exact: true }) });

test("a heavy JPEG is listed, fixed to a lighter WebP with copies, and Undo restores it", { tag: "@smoke" }, async ({ page, baseURL }) => {
  await openImprove(page, baseURL, ["Photos"]);
  const photos = row(page, "Photos");
  await expect(photos).toContainText("1 picture · lighter files");
  // The row opens to its picture, ticked.
  await photos.getByRole("button", { name: /Photos/ }).first().click();
  await expect(photos.getByRole("checkbox", { name: "Improve photos.jpg", exact: true })).toBeChecked();
  await expect(photos).toContainText("Heavy: a lighter file");
  // Fix is a 36 px secondary with an edge, so Fix all stays the one primary; ticks are 20 px.
  const fix = pane(page).getByRole("button", { name: "Fix Photos", exact: true });
  expect(await fix.evaluate(button => [button.getBoundingClientRect().height, getComputedStyle(button).borderTopStyle, button.classList.contains("primary")])).toEqual([36, "solid", false]);
  expect(await photos.getByRole("checkbox").first().evaluate(box => box.getBoundingClientRect().width)).toBe(20);

  await pane(page).getByRole("button", { name: "Fix Photos", exact: true }).click();
  await expect(pane(page).locator(".media-improve__changed")).toContainText("Photos");
  const fixed = await storedDraft(page, "photos/index.html");
  expect(fixed?.content).toContain('src="/images/photos.webp"');
  expect(fixed?.content).toMatch(/srcset="[^"]*\/images\/photos-480\.webp 480w/);
  expect(fixed?.content).toMatch(/width="\d+" height="\d+"/);
  expect(fixed?.content).toContain('alt="Photos photo"');
  // Nothing goes live until published: the lighter files are drafts.
  expect((await storedDraft(page, "images/photos.webp"))?.path).toBe("images/photos.webp");

  // The menu counts the current screen after Fix, without waiting for the screen to lend widths.
  const remaining = await pane(page).locator(".media-improve__row").count();
  await pane(page).getByRole("button", { name: "Back", exact: true }).click();
  await pane(page).getByRole("button", { name: "More", exact: true }).click();
  const menu = page.getByRole("menuitem", { name: /^Improve images/ });
  await expect(menu).toHaveText(remaining ? `Improve images (${remaining})` : "Improve images");
  await menu.click();
  await pane(page).getByRole("button", { name: "Undo Photos", exact: true }).click();
  await expect(pane(page).locator(".media-improve__changed")).toHaveCount(0);
  await expect.poll(async () => (await storedDraft(page, "photos/index.html"))?.content ?? pageHtml("Photos", "images/photos.jpg")).toBe(pageHtml("Photos", "images/photos.jpg"));
  await expect.poll(async () => await storedDraft(page, "images/photos.webp")).toBeUndefined();
  await expect(row(page, "Photos")).toContainText("1 picture · lighter files");
  const restored = await pane(page).locator(".media-improve__row").count();
  await pane(page).getByRole("button", { name: "Back", exact: true }).click();
  await pane(page).getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: /^Improve images/ })).toHaveText(`Improve images (${restored})`);
});

// Slice 118: "Leave alone everywhere" on one row skips the picture on every page; the editor's Undo brings it back.
test("leave a picture used on two pages alone everywhere: both rows skip it, and Undo restores it", async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  await commit(page, baseURL, { path: "images/shared.jpg", base64: await heavyJpeg(page, 71) });
  for (const title of ["North", "South"]) await commit(page, baseURL, { path: `${title.toLowerCase()}/index.html`, content: pageHtml(title, "images/shared.jpg") });
  await showImprove(page, baseURL);
  const north = row(page, "North"), south = row(page, "South");
  await north.getByRole("button", { name: /North/ }).first().click();
  await expect(north.getByRole("checkbox", { name: "Improve shared.jpg", exact: true })).toBeChecked();
  await north.getByRole("button", { name: "Leave shared.jpg alone everywhere", exact: true }).click();
  // One entry with no page in the site's records; both rows show it left alone with nothing to fix.
  await expect.poll(async () => JSON.parse((await storedDraft(page, ".editor/media.json"))?.content ?? "{}").leftAsIs).toEqual([{ picture: "images/shared.jpg" }]);
  await expect(north).toContainText("Left alone everywhere");
  await expect(north.getByRole("checkbox", { name: "Improve shared.jpg", exact: true })).not.toBeChecked();
  await expect(north.getByRole("button", { name: "Leave shared.jpg alone everywhere", exact: true })).toHaveCount(0);
  await south.getByRole("button", { name: /South/ }).first().click();
  await expect(south).toContainText("Left alone everywhere");
  await expect(south.getByRole("checkbox", { name: "Improve shared.jpg", exact: true })).not.toBeChecked();
  for (const title of ["North", "South"]) await expect(pane(page).getByRole("button", { name: `Fix ${title}`, exact: true })).toBeDisabled();

  // The editor's Undo takes the one step back: both rows improve the picture again.
  await page.keyboard.press("Escape");
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDraft(page, ".editor/media.json"))?.content ?? "").not.toContain("images/shared.jpg");
  // The open screen reads the plan again: both rows improve the picture, still open.
  if (!(await pane(page).isVisible())) { await page.locator("#explorer-toggle").click(); await tab(page).click(); }
  for (const title of ["North", "South"]) {
    await expect(pane(page).getByRole("button", { name: `Fix ${title}`, exact: true })).toBeEnabled();
    await expect(row(page, title).getByRole("checkbox", { name: "Improve shared.jpg", exact: true })).toBeChecked();
  }
  await expect(pane(page)).not.toContainText("Left alone everywhere");
});

// Nightly: an unticked picture is remembered and skipped; Cancel stops with the rest listed; Undo all.
test("untick a picture, Cancel mid-run, then Undo all", async ({ page, baseURL }) => {
  await openImprove(page, baseURL, ["Alpha", "Beta", "Gamma", "Delta"]);
  const alpha = row(page, "Alpha");
  await alpha.getByRole("button", { name: /Alpha/ }).first().click();
  await alpha.getByRole("checkbox", { name: "Improve alpha.jpg", exact: true }).uncheck();
  // Remembered in the site's records as left as is; the row has nothing left to fix.
  await expect.poll(async () => (await storedDraft(page, ".editor/media.json"))?.content ?? "").toContain('"picture": "images/alpha.jpg"');
  await expect(alpha.getByRole("checkbox", { name: "Improve alpha.jpg", exact: true })).not.toBeChecked();
  await expect(pane(page).getByRole("button", { name: "Fix Alpha", exact: true })).toBeDisabled();

  await pane(page).getByRole("button", { name: "Fix all", exact: true }).click();
  const cancel = pane(page).getByRole("button", { name: "Cancel", exact: true });
  await expect(pane(page).locator(".media-improve__progress")).toContainText(/Improving 1 of \d/);
  await cancel.click();
  await expect(page.locator(".editor-toast__text")).toContainText("Stopped. The rest are still listed.");
  await expect(pane(page).locator(".media-improve__progress")).toHaveCount(0);
  // Rows not reached are still listed; finished ones stay done.
  const left = await pane(page).locator(".media-improve__row").count();
  expect(left).toBeGreaterThan(1);
  expect((await storedDraft(page, "alpha/index.html"))?.content ?? "").not.toContain("alpha.webp");

  // Fix the rest, then Undo all puts every page back in one change.
  await pane(page).getByRole("button", { name: "Fix all", exact: true }).click();
  // The second run's message replaces the first one's "Stopped".
  await expect(page.locator(".editor-toast__text")).toHaveText(/^Changed \d pages?\.$/);
  await expect(pane(page).locator(".media-improve__progress")).toHaveCount(0);
  for (const name of ["beta", "gamma", "delta"]) expect((await storedDraft(page, `${name}/index.html`))?.content).toContain(`${name}.webp`);
  await pane(page).getByRole("button", { name: "Undo all", exact: true }).click();
  await expect(pane(page).locator(".media-improve__changed")).toHaveCount(0);
  for (const name of ["beta", "gamma", "delta"]) {
    await expect.poll(async () => (await storedDraft(page, `${name}/index.html`))?.content ?? "").not.toContain(`${name}.webp`);
    await expect.poll(async () => await storedDraft(page, `images/${name}.webp`)).toBeUndefined();
  }
});

// Slice 101: fixing a GIF row or an old YouTube embed row adds the site's player on a site that has
// none yet. Its files went in as uploads, and the preview's stylesheet reader then re-read the
// new media-player.css forever (the editor froze). They are text drafts now, and the row saves promptly.
const PLAYER_FILES = ["styles/media-player.css", "scripts/media-player.js", "scripts/media-online.js"];
const tourHtml = pageHtml("Tour", "images/placeholder.svg")
  .replace(/<img [^>]*>/, '<iframe src="https://www.youtube.com/embed/aqz-KE-bpKQ" title="Studio tour" width="560" height="315"></iframe>');

/** A fresh site without the player, with one row to fix: a GIF page (Loop) or an old YouTube embed (Tour). */
async function fixPlayerRow(page: Page, baseURL: string | undefined, title: "Loop" | "Tour") {
  await page.goto(baseURL!);
  const cors = { "access-control-allow-origin": "*" }, still = Buffer.from(await stillPng(page), "base64");
  await page.route("https://www.youtube.com/oembed**", route => route.fulfill({ headers: cors, contentType: "application/json", body: JSON.stringify({ title: "Studio tour" }) }));
  await page.route("https://i.ytimg.com/**", route => route.fulfill({ headers: cors, contentType: "image/png", body: still }));
  await page.route("https://www.youtube.com/embed/**", route => route.fulfill({ contentType: "text/html", body: "<title>Stub</title>" }));
  // The site knows its own address, so YouTube's is an outside one.
  await commit(page, baseURL, { path: "CNAME", content: "studio.example\n" });
  if (title === "Loop") {
    await commit(page, baseURL, { path: "images/loop.gif", base64: animatedGif().toString("base64") });
    await commit(page, baseURL, { path: "loop/index.html", content: pageHtml("Loop", "images/loop.gif") });
  } else await commit(page, baseURL, { path: "tour/index.html", content: tourHtml });
  await openEditor(page, baseURL);
  for (const path of PLAYER_FILES) expect(await storedDraft(page, path), `${path} is not in the site yet`).toBeUndefined();
  await openMedia(page);
  await pane(page).getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Improve images/ }).click();
  await expect(row(page, title)).toBeVisible();
  const started = Date.now();
  await pane(page).getByRole("button", { name: `Fix ${title}`, exact: true }).click();
  await expect(pane(page).locator(".media-improve__changed")).toContainText(title, { timeout: 30_000 });
  expect(Date.now() - started, `${title} saves in normal time`).toBeLessThan(30_000);
  const fixed = (await storedDraft(page, `${title.toLowerCase()}/index.html`))?.content ?? "";
  expect(fixed).toMatch(title === "Loop" ? /<video[^>]*src="\/media\/videos\/loop\.mp4"/ : /class="online-video"/);
  expect(fixed).toContain('href="/styles/media-player.css"');
  // The player's files are new text drafts, not uploads.
  for (const path of PLAYER_FILES) {
    const draft = await storedDraft(page, path);
    expect(draft?.content.length, path).toBeGreaterThan(0);
    expect(draft?.upload, path).toBeUndefined();
    expect(draft?.opaque, path).toBeUndefined();
  }
  // The editor still answers: Undo puts the page back and takes the player files away again.
  await pane(page).getByRole("button", { name: `Undo ${title}`, exact: true }).click();
  await expect(pane(page).locator(".media-improve__changed")).toHaveCount(0);
  for (const path of PLAYER_FILES) await expect.poll(async () => await storedDraft(page, path), path).toBeUndefined();
}

test("a GIF row adds the site's player as text and finishes promptly", async ({ page, baseURL }) => {
  await fixPlayerRow(page, baseURL, "Loop");
});

test("an old YouTube embed row adds the site's player as text and finishes promptly", async ({ page, baseURL }) => {
  await fixPlayerRow(page, baseURL, "Tour");
  await expect.poll(async () => (await storedDraft(page, "tour/index.html"))?.content ?? tourHtml).toBe(tourHtml);
});
