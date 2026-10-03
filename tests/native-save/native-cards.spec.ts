import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";

// Card grids (src/page-builder/cards.ts, docs/page-builder/cards.md): a
// container with two or more items of one kind gets "Add card" after its
// last item; a grid whose items link to pages under one URL is a list of
// those pages, and adding to it can make the page too, from a sibling's
// structure, as one undo step. The fixture `native-cards` (id 540,
// fixtures/native-cards) has a home page whose two cards link to
// /work/fern-and-kettle/ and /work/harbour-lane-pottery/, and a plain list.
const pageErrors: string[] = [];

test.beforeEach(async ({ page, baseURL }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.request.post(`${baseURL}/__demo/slow?ms=0`);
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const status = (page: Page) => page.locator("#status");
const bar = (page: Page) => page.locator(".edit-bar");
const explorer = (page: Page) => page.locator("#explorer");
const item = (page: Page, name: string) => explorer(page).getByRole("treeitem", { name, exact: true });
const addCard = (page: Page) => page.locator(".card-ghost__add");
const popover = (page: Page) => page.getByRole("dialog", { name: "New card with its own page" });

async function open(page: Page, baseURL: string | undefined, file = "index.html") {
  await page.goto(`${baseURL}/#repo=540&branch=main&file=${encodeURIComponent(file)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", file, { timeout: 30_000 });
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
  await expect(status(page)).toContainText("Up to date with main", { timeout: 30_000 });
  await expect(frame(page).locator("card-project").first()).toBeVisible();
}

async function openPages(page: Page) {
  if (!(await explorer(page).isVisible())) await page.locator("#explorer-toggle").click();
  await expect(explorer(page)).toBeVisible();
  await explorer(page).getByRole("tab", { name: "Pages" }).click();
}

async function homeDraft(page: Page) {
  return (await storedDraft(page, "index.html"))?.content ?? "";
}

test("hovering an item of a list shows Add after the last one; it adds a copy with placeholder text, one undo step", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await frame(page).locator("ul.services li").nth(1).hover();
  await expect(addCard(page)).toBeVisible();
  await expect(addCard(page)).toHaveAccessibleName("Add an item to What we do");
  // The ghost sits below the last item, where the next one goes.
  const last = (await frame(page).locator("ul.services li").last().boundingBox())!;
  const ghost = (await page.locator(".card-ghost").boundingBox())!;
  expect(ghost.y).toBeGreaterThanOrEqual(last.y + last.height - 1);
  expect(Math.abs(ghost.x - last.x)).toBeLessThanOrEqual(1);

  await addCard(page).click();
  await expect(status(page)).toHaveText("Item added to What we do");
  await expect(frame(page).locator("ul.services li")).toHaveText(["Plain HTML sites", "Editing workshops", "Hosting set-up", "New item"]);
  expect(await homeDraft(page)).toContain("        <li>Hosting set-up</li>\n        <li>New item</li>\n      </ul>");
  // The new item is selected.
  await expect(bar(page)).toBeVisible();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("List item");

  await page.locator(".code-editor__undo").click();
  await expect(frame(page).locator("ul.services li")).toHaveCount(3);
});

test("a card grid listing pages makes a new page and its card together, selected, with Open page; undo takes both back", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await frame(page).locator("card-project").first().hover();
  await expect(addCard(page)).toHaveAccessibleName("Add a card with its own page to Recent work");
  await expect(addCard(page)).toHaveText("Add card");
  // Two cards in a row of three: the ghost is the third column.
  const second = (await frame(page).locator("card-project").nth(1).boundingBox())!;
  const ghost = (await page.locator(".card-ghost").boundingBox())!;
  expect(ghost.x).toBeGreaterThan(second.x + second.width);
  expect(Math.abs(ghost.y - second.y)).toBeLessThanOrEqual(1);

  await addCard(page).click();
  await expect(popover(page)).toBeVisible();
  await expect(popover(page)).toContainText("In “Recent work”, linking to a new page under /work/.");
  const title = popover(page).getByRole("textbox", { name: "Page title" });
  await expect(title).toBeFocused();
  await expect(popover(page).getByRole("button", { name: "Create page and card" })).toBeDisabled();
  await title.fill("Harbour Lane Pottery");
  await expect(popover(page)).toContainText("The URL /work/harbour-lane-pottery/ is taken by work/harbour-lane-pottery/index.html.");
  await title.fill("Oak & Ash");
  await expect(popover(page).locator(".card-add__url")).toHaveText("URL /work/oak-ash/");
  await page.keyboard.press("Enter");
  await expect(popover(page)).toBeHidden();
  await expect(status(page)).toHaveText("Created the page Oak & Ash at /work/oak-ash/ and its card in Recent work");

  // The card, after the last one, selected, linking to the page.
  const cards = frame(page).locator("card-project");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(2).locator("h3[slot=title]")).toHaveText("Oak & Ash");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Card project");
  await expect(bar(page).getByRole("button", { name: "Open page" })).toBeVisible();
  const home = await homeDraft(page);
  expect(home).toContain(`          <a slot="link" href="/work/harbour-lane-pottery/">Read about Harbour Lane Pottery</a>
        </card-project>
        <card-project>
          <p slot="note">Project</p>
          <h3 slot="title">Oak &amp; Ash</h3>
          <p slot="body" class="body">No description yet.</p>
          <a slot="link" href="/work/oak-ash/">Read about Oak &amp; Ash</a>
        </card-project>
      </div>`);

  // The page: a sibling's structure, its own title and address, its text reset where siblings differ.
  const created = (await storedDraft(page, "work/oak-ash/index.html"))!.content;
  expect(created).toContain("<title>Oak &amp; Ash · Larkspur Studio</title>");
  expect(created).toContain(`<meta name="description" content="">`);
  expect(created).toContain(`<link rel="canonical" href="https://larkspur.example/work/oak-ash/">`);
  expect(created).toContain(`<meta property="og:url" content="https://larkspur.example/work/oak-ash/">`);
  expect(created).toContain(`<card-note><p slot="text">Note</p></card-note>`);
  expect(created).toContain("<h1>Oak &amp; Ash</h1>");
  expect(created).toContain(`<p class="lead">A sentence or two about Oak &amp; Ash.</p>`);
  expect(created).toContain("<h2>The brief</h2>");
  expect(created).toContain(`<p><a href="/#work">Back to all work</a></p>`);
  expect(created).not.toContain("Harbour");

  // One undo takes the card and the page back; redo brings both.
  await page.locator(".code-editor__undo").click();
  await expect(cards).toHaveCount(2);
  await expect.poll(async () => (await storedDraft(page, "work/oak-ash/index.html"))?.content).toBeUndefined();
  await page.locator(".code-editor__redo").click();
  await expect(cards).toHaveCount(3);
  await expect.poll(async () => (await storedDraft(page, "work/oak-ash/index.html"))?.content).toBe(created);

  // Open page goes to it.
  await frame(page).locator("card-project").nth(2).locator("h3[slot=title]").click();
  await bar(page).getByRole("button", { name: "Select card" }).click();
  await bar(page).getByRole("button", { name: "Open page" }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "work/oak-ash/index.html");
  await expect(frame(page).locator("h1")).toHaveText("Oak & Ash");
});

test("a selected card moves left and right, duplicates and goes, and Card only adds one with no page", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const cards = frame(page).locator("card-project");
  await cards.nth(1).locator("h3[slot=title]").click();
  await expect(bar(page).getByRole("button", { name: "Select card" })).toBeVisible();
  await bar(page).getByRole("button", { name: "Select card" }).click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Card project");
  await expect(bar(page).getByRole("button", { name: "Move right" })).toBeDisabled();
  await bar(page).getByRole("button", { name: "Move left" }).click();
  await expect(status(page)).toHaveText("Card moved left");
  await expect(cards.locator("h3[slot=title]")).toHaveText(["Harbour Lane Pottery", "Fern & Kettle"]);
  await expect(bar(page).getByRole("button", { name: "Move left" })).toBeDisabled();

  await bar(page).getByRole("button", { name: "Duplicate" }).click();
  await expect(cards.locator("h3[slot=title]")).toHaveText(["Harbour Lane Pottery", "Harbour Lane Pottery", "Fern & Kettle"]);
  await bar(page).getByRole("button", { name: "Remove" }).click();
  await expect(status(page)).toHaveText("Card removed");
  await expect(cards.locator("h3[slot=title]")).toHaveText(["Harbour Lane Pottery", "Fern & Kettle"]);

  // Add card from the bar opens the same popover; Card only adds a placeholder card with no address.
  await bar(page).getByRole("button", { name: "Add card" }).click();
  await expect(popover(page)).toBeVisible();
  await popover(page).getByRole("button", { name: "Card only" }).click();
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(2).locator("h3[slot=title]")).toHaveText("Untitled project");
  expect(await homeDraft(page)).toContain(`<a slot="link" href="">Read about Untitled project</a>`);
  expect(await storedDraft(page, "work/untitled-project/index.html")).toBeUndefined();
});

test("a subpage made in the Pages tab gets its card, deleting it takes the card along, and a card follows its page's new URL", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await openPages(page);
  await item(page, "Work").hover();
  await explorer(page).getByRole("button", { name: "Add subpage to Work" }).click();
  const offer = explorer(page).getByRole("checkbox", { name: "Add a card to “Recent work” on Home" });
  await expect(offer).toBeChecked();
  await explorer(page).getByRole("textbox", { name: /title$/ }).fill("Meadow Row");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("Created the page Meadow Row at /work/meadow-row/, with its card in “Recent work” on Home.");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "work/meadow-row/index.html");
  await expect(frame(page).locator("h1")).toHaveText("Meadow Row");
  expect(await homeDraft(page)).toContain(`<a slot="link" href="/work/meadow-row/">Read about Meadow Row</a>`);

  // Deleting it offers to take its card from Home too.
  await openPages(page);
  await item(page, "Meadow Row · Larkspur Studio").focus();
  await page.keyboard.press("Delete");
  const dialog = page.getByRole("dialog", { name: "Delete the page Meadow Row · Larkspur Studio (work/meadow-row/index.html)?" });
  await expect(dialog.getByRole("checkbox", { name: "Also remove its card from “Recent work” on Home" })).toBeChecked();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(status(page)).toHaveText("Deleted the page Meadow Row · Larkspur Studio and its card.");
  expect(await homeDraft(page)).not.toContain("meadow-row");

  // Change URL rewrites the card's link.
  await openPages(page);
  await explorer(page).getByRole("button", { name: "Change the URL of Fern & Kettle · Larkspur Studio, /work/fern-and-kettle/" }).click();
  const url = explorer(page).getByRole("textbox", { name: /URL/ });
  await url.fill("/work/fern/");
  await page.keyboard.press("Enter");
  await expect(status(page)).toContainText("URL changed to /work/fern/");
  await expect.poll(() => homeDraft(page)).toContain(`<a slot="link" href="/work/fern/">Read about Fern &amp; Kettle</a>`);
});
