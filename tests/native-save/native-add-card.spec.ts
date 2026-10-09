import { expect, test, type Page } from "@playwright/test";
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
