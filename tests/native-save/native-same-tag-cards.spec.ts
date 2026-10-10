import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";

// Sturdy-base 45: an element's end stops at its parent's end tag
// (src/native-source-location.ts `markedRange`), so the last `div` card in a
// `div` grid has its own source range like the cards before it: the grid is
// a grid, and the edit bar's writes on that card land in that card. The
// fixture `native-cards` (id 540) with its home page replaced by such a grid.
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
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const addCard = (page: Page) => page.locator(".card-ghost__add");
const homeDraft = async (page: Page) => (await storedDraft(page, "index.html"))?.content ?? "";

const card = (title: string, fact: string) => `        <div class="card">
          <h3>${title}</h3>
          <div class="fact">${fact}</div>
        </div>
`;
const divGridHome = `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <title>Small websites · Larkspur Studio</title>
  <link rel="stylesheet" href="/styles/site.css">
</head>
<body>
  <main class="page" id="main">
    <section class="flow" id="work">
      <h2>Recent work</h2>
      <div class="cards">
${card("Fern &amp; Kettle", "Cafe")}${card("Harbour Lane Pottery", "Ceramics")}${card("Meadow Row Allotments", "Allotments")}      </div>
    </section>
  </main>
</body>
</html>
`;

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=540&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
  await expect(status(page)).toContainText("Up to date with main", { timeout: 30_000 });
  const textbox = page.locator(`#content [role="textbox"]`).first();
  await expect(textbox).toBeAttached({ timeout: 20_000 });
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), divGridHome);
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
  await expect.poll(() => homeDraft(page)).toBe(divGridHome);
}

test("the last div card in a div grid is a card: its heading and the card itself edit through the bar, in that card", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const cards = frame(page).locator("div.card");
  await expect(cards).toHaveCount(3);

  // The grid is a grid: hovering its last card offers Add card.
  await cards.last().hover();
  await expect(addCard(page)).toHaveAccessibleName("Add a card to Recent work");

  // The last card's heading level changes in that card only.
  await cards.last().locator("h3").click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Heading");
  await bar(page).getByRole("combobox", { name: "Heading level" }).selectOption("h4");
  const leveled = divGridHome.replace("<h3>Meadow Row Allotments</h3>", "<h4>Meadow Row Allotments</h4>");
  await expect.poll(() => homeDraft(page)).toBe(leveled);

  // The card itself: Select card, then Duplicate copies exactly that card after it.
  await bar(page).getByRole("button", { name: "Select card" }).click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Block");
  await bar(page).getByRole("button", { name: "Duplicate" }).click();
  await expect(cards.locator("h3, h4")).toHaveText(["Fern & Kettle", "Harbour Lane Pottery", "Meadow Row Allotments", "Meadow Row Allotments"]);
  const last = card("Meadow Row Allotments", "Allotments").replace(/h3>/g, "h4>");
  await expect.poll(() => homeDraft(page)).toBe(leveled.replace(last, last + last));

  // Remove takes the selected copy, and the page reads as before the duplicate.
  await bar(page).getByRole("button", { name: "Remove" }).click();
  await expect(cards).toHaveCount(3);
  await expect.poll(() => homeDraft(page)).toBe(leveled);
});
