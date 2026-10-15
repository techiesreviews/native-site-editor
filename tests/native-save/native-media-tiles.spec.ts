// Tiles, the list, the phone One bar and the phone selection bar (slice 107, UX audit).
import { test, expect, type Page } from "@playwright/test";
import { filterButton, filterTo } from "./media-filter";

const pane = (page: Page) => page.getByRole("region", { name: "Media", exact: true });
const tile = (page: Page, path: string) => pane(page).locator(`.media-library__card[data-path="${path}"]`);

/** A noisy JPEG (noise does not compress), `width`×`height`, as base64. */
async function noisyJpeg(page: Page, width: number, height: number) {
  return page.evaluate(([w, h]) => {
    const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
    const context = canvas.getContext("2d")!, pixels = context.createImageData(w, h);
    let value = 7;
    for (let i = 0; i < pixels.data.length; i += 4) {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      pixels.data[i] = value & 255; pixels.data[i + 1] = value >>> 8 & 255; pixels.data[i + 2] = value >>> 16 & 255; pixels.data[i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.92).split(",")[1];
  }, [width, height]);
}
async function webp(page: Page, width: number, height: number, alpha: boolean) {
  return page.evaluate(async ([w, h, see]) => {
    const canvas = new OffscreenCanvas(w as number, h as number), context = canvas.getContext("2d")!;
    context.fillStyle = "#1b2a1f";
    if (see) context.fillRect(10, 10, 20, 20); else context.fillRect(0, 0, w as number, h as number);
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/webp" })).arrayBuffer());
    return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(""));
  }, [width, height, alpha]);
}
async function seed(page: Page, baseURL: string | undefined, files: { path: string; content?: string; base64?: string }[]) {
  await page.goto(baseURL!);
  for (const data of files) expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data })).status()).toBe(204);
}
async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main");
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Media", exact: true }).click();
  await expect(pane(page).getByRole("button", { name: "Details for images/studio-desk.svg", exact: true })).toBeVisible();
}
const drawn = (page: Page, path: string) => tile(page, path).locator("img").evaluate(image => {
  const picture = image as HTMLImageElement;
  return picture.complete ? { width: picture.naturalWidth, height: picture.naturalHeight, src: picture.src } : undefined;
});

test("heavy JPEGs show a small copy of their picture, never the document icon", async ({ page, baseURL }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(baseURL!);
  // About 2.2 MB (read whole, once refused over 2 MB) and about 6 MB (streamed raw from GitHub).
  const [middle, large] = [await noisyJpeg(page, 1620, 1620), await noisyJpeg(page, 2400, 2100)];
  expect(middle.length * 3 / 4).toBeGreaterThan(2.1 * 1024 * 1024);
  expect(large.length * 3 / 4, "its base64 JSON is over the 4 MB read").toBeGreaterThan(3.2 * 1024 * 1024);
  await seed(page, baseURL, [{ path: "images/allotment-harvest.jpg", base64: middle }, { path: "images/workshop-panorama.jpg", base64: large }]);
  await open(page, baseURL);
  for (const [path, size] of [["images/allotment-harvest.jpg", { width: 480, height: 480 }], ["images/workshop-panorama.jpg", { width: 549, height: 480 }]] as const) {
    await tile(page, path).scrollIntoViewIfNeeded();
    await expect.poll(() => drawn(page, path), { timeout: 30_000 }).toMatchObject({ ...size, src: expect.stringMatching(/^blob:/) });
    await expect(tile(page, path)).not.toHaveClass(/is-file/);
  }
});

test("see-through and wider-than-2:1 pictures show whole; photos fill the square", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(baseURL!);
  await seed(page, baseURL, [
    { path: "images/banner.webp", base64: await webp(page, 900, 300, false) },
    { path: "images/square.webp", base64: await webp(page, 300, 300, false) },
    { path: "images/mark.webp", base64: await webp(page, 300, 300, true) },
  ]);
  await open(page, baseURL);
  const fit = (path: string) => tile(page, path).locator("img").evaluate(image => getComputedStyle(image).objectFit);
  await expect.poll(() => fit("images/banner.webp")).toBe("contain");
  await expect.poll(() => fit("images/mark.webp")).toBe("contain");
  await expect(tile(page, "images/mark.webp").locator("img")).toHaveAttribute("data-transparent", "");
  await expect.poll(() => drawn(page, "images/square.webp")).toMatchObject({ width: 300 });
  expect(await fit("images/square.webp")).toBe("cover");
  // Their dark number and circle are for the tile's light backing only: list rows keep the theme's words.
  await page.emulateMedia({ colorScheme: "dark" });
  await pane(page).getByRole("button", { name: /^Filter/ }).click();
  await page.getByRole("menuitemradio", { name: "List", exact: true }).click();
  const words = (path: string) => tile(page, path).locator(".media-library__usage").evaluate(usage => getComputedStyle(usage).color);
  await expect.poll(() => words("images/mark.webp")).toBe(await words("images/square.webp"));
  expect(await words("images/banner.webp")).toBe(await words("images/square.webp"));
});

test("list rows line their names up whether or not a file has a picture, and say their usage once", async ({ page, baseURL }) => {
  for (const [width, height] of [[1280, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.goto(baseURL!);
    // A JPEG that is not a picture falls back to its icon.
    await seed(page, baseURL, [{ path: "images/broken.jpg", content: "not a picture" }]);
    await open(page, baseURL);
    await pane(page).getByRole("button", { name: /^Filter/ }).click();
    await page.getByRole("menuitemradio", { name: "List", exact: true }).click();
    await expect(tile(page, "images/broken.jpg")).toHaveClass(/is-file/);
    const rows = await pane(page).locator(".media-library__card").evaluateAll(cards => cards.map(card => ({
      name: Math.round(card.querySelector(".media-library__name")!.getBoundingClientRect().left),
      picture: Math.round(card.querySelector(".media-library__thumbnail > :is(img, .media-library__type-picture)")!.getBoundingClientRect().width),
      count: getComputedStyle(card.querySelector(".media-library__count")!).display,
    })));
    expect(rows.length).toBeGreaterThan(2);
    expect(new Set(rows.map(row => row.name)).size, `${width}: one name column`).toBe(1);
    expect(new Set(rows.map(row => row.picture))).toEqual(new Set([48]));
    expect(new Set(rows.map(row => row.count)), "the number shows only on tiles").toEqual(new Set(["none"]));
    await page.goto("about:blank");
  }
});

test("phones: search keeps most of the One bar, and the selection bar is one row with removal last in ⋯", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, baseURL);
  const library = pane(page), bar = library.locator(".media-library__bar");
  const share = async () => {
    const [search, whole] = await Promise.all([library.locator(".media-library__search").boundingBox(), bar.boundingBox()]);
    return search!.width / (whole!.width - 24);
  };
  expect(await share()).toBeGreaterThanOrEqual(0.55);
  // Filter (slice 116) is the funnel alone while it shows everything; + and More sit beside it.
  await expect(filterButton(library)).toHaveAccessibleName("Filter: All");
  await expect(filterButton(library).locator(".media-library__filter-label")).toBeHidden();
  await expect(library.getByRole("button", { name: "Add files", exact: true })).toBeVisible();
  // Typed words stay whole.
  await library.getByLabel("Search media", { exact: true }).fill("studio desk");
  expect(await library.getByLabel("Search media", { exact: true }).evaluate(input => input.scrollWidth <= input.clientWidth)).toBe(true);
  await library.getByLabel("Search media", { exact: true }).fill("");

  for (const path of ["images/studio-desk.svg", "images/placeholder.svg"]) await library.getByLabel(`Select ${path}`, { exact: true }).check();
  const selection = library.getByRole("group", { name: "Selected files", exact: true });
  const clear = selection.getByRole("button", { name: "2 selected. Clear selection", exact: true });
  expect(await clear.innerText()).toBe("2");
  const box = await selection.boundingBox();
  expect(box!.height).toBeLessThanOrEqual(56.5);
  const controls = await selection.getByRole("button").evaluateAll(buttons => buttons.filter(b => b.checkVisibility()).map(b => ({ label: b.getAttribute("aria-label") ?? b.textContent, top: Math.round(b.getBoundingClientRect().top) })));
  expect(controls.map(control => control.label)).toEqual(["2 selected. Clear selection", "Add to collection", "More for selected files"]);
  expect(new Set(controls.map(control => control.top)).size).toBe(1);
  await selection.getByRole("button", { name: "More for selected files", exact: true }).click();
  const items = page.getByRole("menu", { name: "More for selected files", exact: true }).getByRole("menuitem");
  await expect(items.last()).toHaveText("Remove files…");
  await items.last().click();
  await expect(library.getByRole("heading", { name: /^Remove 2 files\?$/ })).toBeVisible();
  await library.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(selection.getByRole("button", { name: "More for selected files", exact: true })).toBeFocused();
  await clear.click();
  await expect(selection).toBeHidden();
  await expect(library.getByLabel("Select images/studio-desk.svg", { exact: true })).not.toBeChecked();
});

test("phones: with 30 collections Filter scrolls inside the window, and a collection named All still marks Filter as narrowing", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const names = ["All", ...Array.from({ length: 29 }, (_, at) => `Trip ${at + 1}`)];
  await seed(page, baseURL, [{ path: ".editor/media.json", content: JSON.stringify({ version: 2, collections: names,
    files: { "images/studio-desk.svg": { collections: ["All"] } } }) }]);
  await open(page, baseURL);
  const library = pane(page), filter = filterButton(library), menu = page.getByRole("menu", { name: "Filter", exact: true });
  await filter.click();
  const box = await menu.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  // The last choices are reached by scrolling the menu.
  const list = menu.getByRole("menuitemradio", { name: "List", exact: true });
  await list.scrollIntoViewIfNeeded();
  await expect(list).toBeInViewport();
  await expect(menu.getByRole("menuitem", { name: "Manage collections…", exact: true })).toBeAttached();
  await list.click();
  await expect(library.locator(".media-library__grid")).toHaveClass(/media-library__grid--list/);
  // A collection named "All": its words show and Filter wears the narrowing colour.
  await filter.click();
  await menu.getByRole("group", { name: "Collections", exact: true }).getByRole("menuitemradio", { name: "All", exact: true }).click();
  await expect(filter).toHaveAttribute("data-narrowed", "");
  await expect(filter.locator(".media-library__filter-label")).toHaveText("All");
  await expect(filter.locator(".media-library__filter-label")).toBeVisible();
  await expect.poll(() => library.locator(".media-library__card").count()).toBe(1);
  await filterTo(library, "All collections");
  await expect(filter).not.toHaveAttribute("data-narrowed", "");
  await expect(filter.locator(".media-library__filter-label")).toBeHidden();
});

test("phones: inside a collection, ⋯ offers Take out before Remove, and Take out keeps the file", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, baseURL, [{ path: ".editor/media.json", content: JSON.stringify({ version: 2, collections: ["Picks"],
    files: { "images/studio-desk.svg": { collections: ["Picks"] } } }) }]);
  await open(page, baseURL);
  const library = pane(page);
  await filterTo(library, "Picks");
  // Narrowed, Filter shows its words whole in place of the funnel; search keeps at least 40 %.
  const label = filterButton(library).locator(".media-library__filter-label");
  await expect(label).toHaveText("Picks");
  expect(await label.evaluate(words => words.scrollWidth <= words.clientWidth)).toBe(true);
  const [search, whole] = await Promise.all([library.locator(".media-library__search").boundingBox(), library.locator(".media-library__bar").boundingBox()]);
  expect(search!.width / (whole!.width - 24)).toBeGreaterThanOrEqual(0.4);
  await library.getByLabel("Select images/studio-desk.svg", { exact: true }).check();
  const selection = library.getByRole("group", { name: "Selected files", exact: true });
  await expect(selection.getByRole("button", { name: "Take out of Picks", exact: true })).toBeHidden();
  await selection.getByRole("button", { name: "More for selected files", exact: true }).click();
  const items = page.getByRole("menu", { name: "More for selected files", exact: true }).getByRole("menuitem");
  await expect(items).toHaveText(["Select all shown", "Optimise heavy images", "Take out of Picks", "Remove file…"]);
  await items.filter({ hasText: "Take out of Picks" }).click();
  await expect(page.locator(".editor-toast__text")).toHaveText("Took 1 file out of \"Picks\". It stays in Media under All.");
  await filterTo(library, "All collections");
  await expect(tile(page, "images/studio-desk.svg")).toBeVisible();
});

test("wider screens keep one selection row with every action in view", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, baseURL);
  const library = pane(page);
  await library.getByLabel("Select images/studio-desk.svg", { exact: true }).check();
  const selection = library.getByRole("group", { name: "Selected files", exact: true });
  await expect(selection.getByRole("button", { name: "1 selected. Clear selection", exact: true })).toHaveText("1 selected");
  await expect(selection.getByRole("button", { name: "Remove file", exact: true })).toBeVisible();
  await selection.getByRole("button", { name: "More for selected files", exact: true }).click();
  await expect(page.getByRole("menu", { name: "More for selected files", exact: true }).getByRole("menuitem")).toHaveText(["Select all shown", "Optimise heavy images"]);
});
