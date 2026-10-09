import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { editorMounted } from "./drafts";

// Add card on an instance's card slot (src/page-builder/card-slot.ts): an
// items slot whose fallback is a card component adds a fresh instance of
// that card, its template's fallbacks in its slots, however many items the
// slot holds. Default fixture group: native-cards (#repo=540), whose Recent
// work is turned into a `section-work` instance here.
const pageErrors: string[] = [];

test.beforeEach(({ page }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const addCard = (page: Page) => page.locator(".card-ghost__add");
const source = async (page: Page) => (await editorMounted(page), page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")));
const undo = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "index.html"));

const fresh = [
  "<card-project>",
  '        <p slot="note">Project</p>',
  '        <h3 slot="title">Untitled project</h3>',
  '        <p slot="body" class="body">No description yet.</p>',
  "      </card-project>",
].join("\n");

/** The home page with Recent work as a `section-work` instance whose unnamed slot's fallback is a card-project, keeping `keep` of its cards. */
async function openSectionWork(page: Page, baseURL: string | undefined, keep: number) {
  await page.goto(`${baseURL}/#repo=540&branch=main&file=index.html`);
  await expect(frame(page).locator("#work .cards card-project").first()).toBeVisible({ timeout: 30_000 });
  const edit = (path: string, content: string) => page.request.post(`${baseURL}/__demo/external-edit`, { data: { repo: "native-cards", path, content } });
  await edit("components/section-work/section-work.html", '<section class="flow">\n  <slot name="title"><h2>Recent work</h2></slot>\n  <div class="cards"><slot><card-project></card-project></slot></div>\n</section>\n');
  await edit("components/section-work/section-work.css", ":host { display: block; }\n.cards { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }\n");
  const home = (await source(page))!;
  const cards = [...home.matchAll(/\n {8}<card-project>[\s\S]*?<\/card-project>/g)].map((match) => match[0]);
  expect(cards).toHaveLength(2);
  const made = home.replace(/<section class="flow" id="work">\n {6}<h2>Recent work<\/h2>\n {6}<div class="cards">[\s\S]*?<\/div>\n {4}<\/section>/,
    `<section-work id="work">\n      <h2 slot="title">Recent work</h2>${cards.slice(0, keep).map((card) => card.replace(/\n {2}/g, "\n")).join("")}\n    </section-work>`);
  expect(made).toContain("</section-work>");
  await edit("index.html", made);
  await page.reload();
  await expect(frame(page).locator("section-work > h2")).toBeVisible({ timeout: 30_000 });
  await editorMounted(page);
  await expect.poll(() => source(page)).toBe(made);
  return made;
}

test("Add card on an empty items slot adds the slot's card component with its fallbacks; undo removes it", async ({ page, baseURL }) => {
  const made = await openSectionWork(page, baseURL, 0);
  await expect(frame(page).locator("section-work > card-project")).toHaveCount(0);
  // Anywhere in the instance shows where its first card goes.
  await frame(page).locator("section-work > h2").hover();
  await expect(addCard(page)).toBeVisible();
  await expect(addCard(page)).toHaveAccessibleName("Add a card to Recent work");
  await addCard(page).click();
  await expect.poll(() => source(page)).toBe(made.replace('<h2 slot="title">Recent work</h2>', `<h2 slot="title">Recent work</h2>\n      ${fresh}`));
  await expect(frame(page).locator("section-work > card-project > h3")).toHaveText("Untitled project");
  // The new card is selected.
  await expect(page.getByRole("toolbar", { name: "Edit bar", exact: true }).locator(".edit-bar__kind")).toHaveText(/Card project/);
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toBe(made);
  await expect(frame(page).locator("section-work > card-project")).toHaveCount(0);
});

test("with one card, Add card adds a fresh card from the fallback beside it, not a copy", async ({ page, baseURL }) => {
  const made = await openSectionWork(page, baseURL, 1);
  await frame(page).locator("section-work > card-project").hover();
  await expect(addCard(page)).toBeVisible();
  // The grid's columns put the second card beside the first.
  const [first, ghost] = await Promise.all([frame(page).locator("section-work > card-project").boundingBox(), page.locator(".card-ghost").boundingBox()]);
  expect(Math.abs(ghost!.y - first!.y)).toBeLessThan(2);
  expect(ghost!.x).toBeGreaterThan(first!.x + first!.width);
  await addCard(page).click();
  await expect.poll(() => source(page)).toBe(made.replace("</card-project>\n    </section-work>", `</card-project>\n      ${fresh}\n    </section-work>`));
  await expect(frame(page).locator("section-work > card-project").nth(1).locator(":scope > h3")).toHaveText("Untitled project");
  await expect(frame(page).locator("section-work > card-project").first().locator(":scope > h3")).toHaveText("Fern & Kettle");
});

test("of two named card slots, the one whose part of the template is under the pointer gets the card", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=540&branch=main&file=index.html`);
  await expect(frame(page).locator("#work .cards card-project").first()).toBeVisible({ timeout: 30_000 });
  const edit = (path: string, content: string) => page.request.post(`${baseURL}/__demo/external-edit`, { data: { repo: "native-cards", path, content } });
  await edit("components/section-pair/section-pair.html", '<section>\n  <slot name="title"><h2>Pair</h2></slot>\n  <div class="first"><slot name="first"><card-project></card-project></slot></div>\n  <div class="second"><slot name="second"><card-project></card-project></slot></div>\n</section>\n');
  await edit("components/section-pair/section-pair.css", ":host { display: block; }\n.first, .second { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding: 32px 0 48px; }\n");
  const home = (await source(page))!;
  const made = home.replace(/<section class="flow" id="work">[\s\S]*?<\/div>\n {4}<\/section>/, [
    '<section-pair id="work">',
    '      <h2 slot="title">Pair</h2>',
    '      <card-project slot="first">',
    '        <h3 slot="title">One</h3>',
    "      </card-project>",
    '      <card-project slot="second">',
    '        <h3 slot="title">Two</h3>',
    "      </card-project>",
    "    </section-pair>",
  ].join("\n"));
  expect(made).toContain("</section-pair>");
  await edit("index.html", made);
  await page.reload();
  await expect(frame(page).locator("section-pair > h2")).toBeVisible({ timeout: 30_000 });
  await editorMounted(page);
  await expect.poll(() => source(page)).toBe(made);
  // With a card of the first list selected, the second list's padding below its card (its template part) still names the second.
  await frame(page).locator("section-pair > card-project[slot=first]").click();
  await expect(page.getByRole("toolbar", { name: "Edit bar", exact: true })).toBeVisible();
  const second = frame(page).locator("section-pair > card-project[slot=second]");
  await second.evaluate((el) => el.scrollIntoView({ block: "start" }));
  const box = (await second.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 24);
  await expect(addCard(page)).toBeVisible();
  // On its way to the button the pointer leaves the list; the ghost stays with the second.
  const ghostAt = (await page.locator(".card-ghost").boundingBox())!;
  expect(ghostAt.y).toBeGreaterThan(box.y - 2);
  await addCard(page).hover();
  await expect.poll(async () => (await page.locator(".card-ghost").boundingBox())!.y).toBe(ghostAt.y);
  await addCard(page).click();
  await expect.poll(() => source(page)).toContain('<h3 slot="title">Two</h3>\n      </card-project>\n      <card-project slot="second">\n        <p slot="note">Project</p>');
  await expect(frame(page).locator("section-pair > card-project[slot=first]")).toHaveCount(1);
  // Its ghost sat beside the second list's card, in that list's own grid.
  await expect(frame(page).locator("section-pair > card-project[slot=second]")).toHaveCount(2);
  const [a, b] = await Promise.all([0, 1].map((n) => frame(page).locator("section-pair > card-project[slot=second]").nth(n).boundingBox()));
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(2);
});

test("a fresh card shows Link to a page… at its foot: the cards' folder first, then Other pages; Esc leaves the card blank", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=540&branch=main&file=index.html`);
  await expect(frame(page).locator("#work .cards card-project").first()).toBeVisible({ timeout: 30_000 });
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { repo: "native-cards", path: "about/index.html", content: '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <title>About · Larkspur Studio</title>\n</head>\n<body>\n  <main>\n    <h1>About us</h1>\n  </main>\n</body>\n</html>\n' } });
  const made = await openSectionWork(page, baseURL, 1);
  await frame(page).locator("section-work > card-project").hover();
  await addCard(page).click();
  const added = made.replace("</card-project>\n    </section-work>", `</card-project>\n      ${fresh}\n    </section-work>`);
  await expect.poll(() => source(page)).toBe(added);

  const picker = page.getByRole("group", { name: "Link the new card to a page" });
  const input = page.getByRole("combobox", { name: "Link to a page" });
  await expect(input).toBeFocused();
  // Hung from the new card's foot, or over its top when the pane has no room below it.
  const boxes = () => Promise.all([frame(page).locator("section-work > card-project").nth(1).boundingBox(), picker.boundingBox()]);
  await expect.poll(async () => {
    const [card, box] = await boxes();
    return Math.min(Math.abs(box!.y - (card!.y + card!.height - 6)), Math.abs(box!.y + box!.height - (card!.y + 6)));
  }).toBeLessThan(3);
  const [card, box] = await boxes();
  expect(box!.x).toBeLessThan(card!.x + card!.width);
  expect(box!.x + box!.width).toBeGreaterThan(card!.x);

  // The cards' folder first, the page they link to greyed; then the rest, not the grid's own page.
  const list = page.getByRole("listbox", { name: "Pages" });
  const under = list.getByRole("group", { name: "Under /work/" });
  const other = list.getByRole("group", { name: "Other pages" });
  await expect(list.getByRole("group")).toHaveCount(2);
  await expect(under.getByRole("option")).toHaveText([/^Fern & Kettle\/work\/fern-and-kettle\/In this grid$/, /^Harbour Lane Pottery\/work\/harbour-lane-pottery\/$/]);
  await expect(under.getByRole("option").first()).toHaveAttribute("aria-disabled", "true");
  // A page in the grid can't be picked: clicking it leaves the combobox open and the card as it is.
  await under.getByRole("option").first().click({ force: true });
  await expect(input).toBeFocused();
  expect(await source(page)).toBe(added);
  await expect(other.getByRole("option")).toHaveText([/^About us\/about\/$/]);
  await expect(list.getByRole("option", { name: /Larkspur|Small websites/ })).toHaveCount(0);
  // The first page that can be picked is active, and arrows skip the greyed one.
  await expect(under.getByRole("option", { name: /Harbour Lane Pottery/ })).toHaveAttribute("aria-selected", "true");
  await input.press("ArrowDown");
  await expect(other.getByRole("option")).toHaveAttribute("aria-selected", "true");
  await input.press("ArrowDown");
  await expect(under.getByRole("option", { name: /Harbour Lane Pottery/ })).toHaveAttribute("aria-selected", "true");
  // Search covers every page, by title or address.
  await input.fill("abo");
  await expect(list.getByRole("group")).toHaveCount(1);
  await expect(other.getByRole("option")).toHaveText([/^About us/]);
  await input.fill("harbour-lane");
  await expect(list.getByRole("option")).toHaveText([/^Harbour Lane Pottery/]);
  await input.fill("nothing like it");
  await expect(list).toHaveText("No page matches.");

  // Esc closes it and leaves the card blank, still selected.
  await input.press("Escape");
  await expect(picker).toHaveCount(0);
  await expect.poll(() => source(page)).toBe(added);
  await expect(page.getByRole("toolbar", { name: "Edit bar", exact: true }).locator(".edit-bar__kind")).toHaveText(/Card project/);

  // Undo takes the next card away, and its combobox with it.
  await frame(page).locator("section-work > card-project").nth(1).hover();
  await addCard(page).click();
  await expect(input).toBeFocused();
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toBe(added);
  await expect(picker).toHaveCount(0);
});

// Picking a page fills the fresh card (slice 53, ticket 09 §4–5): a card-project with an image slot, and a work page with an og:image.
const imageTemplate = [
  "<article>",
  '  <slot name="image"><img src="/images/placeholder.svg" alt=""></slot>',
  '  <card-note><slot name="note" slot="text"><p>Project</p></slot></card-note>',
  '  <slot name="title"><h3>Untitled project</h3></slot>',
  '  <slot name="body"><p class="body">No description yet.</p></slot>',
  "  <slot></slot>",
  '  <p class="actions"><slot name="link"></slot></p>',
  "</article>",
  "",
].join("\n");
const freshWithImage = fresh.replace("<card-project>\n", '<card-project>\n        <img slot="image" src="/images/placeholder.svg" alt="">\n');

async function openFillable(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=540&branch=main&file=index.html`);
  await expect(frame(page).locator("#work .cards card-project").first()).toBeVisible({ timeout: 30_000 });
  const edit = (path: string, content: string) => page.request.post(`${baseURL}/__demo/external-edit`, { data: { repo: "native-cards", path, content } });
  await edit("components/card-project/card-project.html", imageTemplate);
  await edit("images/harbour.svg", '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="80" viewBox="0 0 320 80"><rect width="320" height="80" fill="#c9733a"/></svg>\n');
  const harbour = readFileSync(new URL("../../fixtures/native-cards/work/harbour-lane-pottery/index.html", import.meta.url), "utf8");
  await edit("work/harbour-lane-pottery/index.html", harbour.replace("<link rel=\"stylesheet\"", '<meta property="og:image" content="https://larkspur.example/images/harbour.svg">\n  <link rel="stylesheet"'));
  const made = await openSectionWork(page, baseURL, 1);
  await frame(page).locator("section-work > card-project").hover();
  await addCard(page).click();
  const added = made.replace("</card-project>\n    </section-work>", `</card-project>\n      ${freshWithImage}\n    </section-work>`);
  await expect.poll(() => source(page)).toBe(added);
  await expect(page.getByRole("combobox", { name: "Link to a page" })).toBeFocused();
  return { made, added };
}

const harbourCard = [
  "<card-project>",
  '        <img slot="image" src="/images/harbour.svg" alt="">',
  '        <p slot="note">Ceramics studio · Portfolio · 2025</p>',
  '        <h3 slot="title">Harbour Lane Pottery</h3>',
  '        <p slot="body" class="body">A quiet portfolio for a working potter.</p>',
  '        <a slot="link" href="/work/harbour-lane-pottery/">Read about Harbour Lane Pottery</a>',
  "      </card-project>",
].join("\n");

test("picking a page fills the new card from it and a strip lists each part's source; undo takes the fill back, then the card", { tag: "@smoke" }, async ({ page, baseURL }) => {
  const { made, added } = await openFillable(page, baseURL);
  const input = page.getByRole("combobox", { name: "Link to a page" });
  await page.getByRole("option", { name: /Harbour Lane Pottery/ }).click();
  const filled = added.replace(freshWithImage, harbourCard);
  await expect.poll(() => source(page)).toBe(filled);
  const card = frame(page).locator("section-work > card-project").nth(1);
  await expect(card.locator(":scope > h3")).toHaveText("Harbour Lane Pottery");
  await expect(card.locator(":scope > p.body")).toHaveText("A quiet portfolio for a working potter.");
  // The preview shows the page's og:image (the source has its address, above).
  await expect.poll(() => card.locator(":scope > img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(320);
  await expect(card.locator(":scope > a")).toHaveAttribute("href", "/work/harbour-lane-pottery/");
  await expect(card.locator(":scope > a")).toHaveText("Read about Harbour Lane Pottery");
  // The combobox gives way to the strip: the page, then each slot and where its content came from.
  await expect(input).toHaveCount(0);
  const strip = page.getByRole("group", { name: "Where the card's content came from" });
  await expect(strip).toBeVisible();
  await expect(strip.locator(".card-fill__title")).toHaveText("Filled from Harbour Lane Pottery /work/harbour-lane-pottery/");
  await expect(strip.getByRole("listitem")).toHaveText([
    "Imageog:image/images/harbour.svg",
    "Note<card-note>Ceramics studio · Portfolio · 2025",
    "Titleh1Harbour Lane Pottery",
    "Bodymeta descriptionA quiet portfolio for a working potter.",
    "Contentkept",
    "Linkaddress/work/harbour-lane-pottery/",
  ]);
  await expect(strip.getByRole("button", { name: "Change page" })).toBeFocused();
  // The card stays selected.
  await expect(page.getByRole("toolbar", { name: "Edit bar", exact: true }).locator(".edit-bar__kind")).toHaveText(/Card project/);
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toBe(added);
  await expect(strip).toHaveCount(0);
  await expect(card.locator(":scope > h3")).toHaveText("Untitled project");
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toBe(made);
  await expect(frame(page).locator("section-work > card-project")).toHaveCount(1);
});

test("Change page fills the card again from the card as it was added; Esc there goes back to the strip; close hides it", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=540&branch=main&file=index.html`);
  await expect(frame(page).locator("#work .cards card-project").first()).toBeVisible({ timeout: 30_000 });
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { repo: "native-cards", path: "about/index.html", content: '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <title>About · Larkspur Studio</title>\n</head>\n<body>\n  <main>\n    <h1>About us</h1>\n  </main>\n</body>\n</html>\n' } });
  const { added } = await openFillable(page, baseURL);
  const input = page.getByRole("combobox", { name: "Link to a page" });
  await input.press("Enter");
  const filled = added.replace(freshWithImage, harbourCard);
  await expect.poll(() => source(page)).toBe(filled);
  const strip = page.getByRole("group", { name: "Where the card's content came from" });
  await strip.getByRole("button", { name: "Change page" }).click();
  await expect(input).toBeFocused();
  await expect(strip).toHaveCount(0);
  // Esc from Change page keeps the fill and shows the strip again.
  await input.press("Escape");
  await expect(strip).toBeVisible();
  expect(await source(page)).toBe(filled);
  await strip.getByRole("button", { name: "Change page" }).click();
  await input.fill("about");
  await input.press("Enter");
  // A page without a note, description or image: those keep the new card's own text, not Harbour Lane's.
  await expect.poll(() => source(page)).toBe(added.replace(freshWithImage, [
    "<card-project>",
    '        <img slot="image" src="/images/placeholder.svg" alt="">',
    '        <p slot="note">Project</p>',
    '        <h3 slot="title">About us</h3>',
    '        <p slot="body" class="body">No description yet.</p>',
    '        <a slot="link" href="/about/">Read about About us</a>',
    "      </card-project>",
  ].join("\n")));
  await expect(strip.locator(".card-fill__title")).toHaveText("Filled from About us /about/");
  await expect(strip.getByRole("listitem").filter({ hasText: /^Body/ })).toHaveText("BodykeptNo description yet.");
  // Undo takes the second fill back to the first, which has no strip.
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toBe(filled);
  await expect(strip).toHaveCount(0);
  // A new card's strip closes with its ×, the card as filled.
  await frame(page).locator("section-work > card-project").nth(1).hover();
  await addCard(page).click();
  await input.press("Enter");
  await expect(strip).toBeVisible();
  const twice = await source(page);
  await strip.getByRole("button", { name: "Close" }).click();
  await expect(strip).toHaveCount(0);
  expect(await source(page)).toBe(twice);
});
