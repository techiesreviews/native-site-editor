import { readFileSync } from "node:fs";
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

test("hovering an item of a list shows Add after the last one; it adds a copy with placeholder text, one undo step", { tag: "@smoke" }, async ({ page, baseURL }) => {
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

test("a card grid listing pages makes a new page and its card together, selected, with Open page; undo takes both back", { tag: "@smoke" }, async ({ page, baseURL }) => {
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
  await expect(popover(page).getByRole("combobox", { name: "URL prefix" })).toHaveValue("/work/");
  await expect(popover(page).locator(".card-add__slug")).toHaveText("oak-ash/");
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

test("a selected card has no move arrows, duplicates and goes, and Card only adds one with no page", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const cards = frame(page).locator("card-project");
  await cards.nth(1).locator("h3[slot=title]").click();
  await expect(bar(page).getByRole("button", { name: "Select card" })).toBeVisible();
  await bar(page).getByRole("button", { name: "Select card" }).click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Card project");
  // Only a whole section moves from the bar: a card has no move arrows.
  for (const name of ["Move left", "Move right", "Move up", "Move down"]) await expect(bar(page).getByRole("button", { name, exact: true })).toHaveCount(0);
  await expect(cards.locator("h3[slot=title]")).toHaveText(["Fern & Kettle", "Harbour Lane Pottery"]);

  await bar(page).getByRole("button", { name: "Duplicate" }).click();
  await expect(cards.locator("h3[slot=title]")).toHaveText(["Fern & Kettle", "Harbour Lane Pottery", "Harbour Lane Pottery"]);
  await bar(page).getByRole("button", { name: "Remove" }).click();
  await expect(status(page)).toHaveText("Card removed");
  await expect(cards.locator("h3[slot=title]")).toHaveText(["Fern & Kettle", "Harbour Lane Pottery"]);

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

async function pasteInto(page: Page, source: string) {
  const textbox = page.locator(`#content [role="textbox"]`).first();
  await expect(textbox).toBeAttached({ timeout: 20_000 });
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), source);
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
}

test("review: typing in the page's code between creating and undoing still undoes the card and its page together", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await frame(page).locator("card-project").first().hover();
  await addCard(page).click();
  await popover(page).getByRole("textbox", { name: "Page title" }).fill("Oak");
  await page.keyboard.press("Enter");
  await expect(frame(page).locator("card-project")).toHaveCount(3);
  await expect.poll(async () => Boolean(await storedDraft(page, "work/oak/index.html"))).toBe(true);
  // Typing in the source clears the visual history; Monaco's own undo now takes the steps back.
  const textbox = page.locator(`#content [role="textbox"]`).first();
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.type("x");
  await page.keyboard.press("ControlOrMeta+Z");
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(frame(page).locator("card-project")).toHaveCount(2);
  await expect.poll(async () => await storedDraft(page, "work/oak/index.html")).toBeUndefined();
  await page.keyboard.press("ControlOrMeta+Shift+Z");
  await expect(frame(page).locator("card-project")).toHaveCount(3);
  await expect.poll(async () => Boolean(await storedDraft(page, "work/oak/index.html"))).toBe(true);
});

// Cards of plain HTML with relative links and a grid of facts inside each card.
const nestedHome = `<!doctype html>
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
        <article class="card">
          <h3><a href="work/fern-and-kettle/">Fern &amp; Kettle</a></h3>
          <div class="fact">Cafe</div>
          <div class="fact">2025</div>
        </article>
        <article class="card">
          <h3><a href="work/harbour-lane-pottery/">Harbour Lane Pottery</a></h3>
          <div class="fact">Ceramics</div>
          <div class="fact">2024</div>
        </article>
      </div>
    </section>
  </main>
</body>
</html>
`;

test("review: a card holding a grid of its own is its grid's card; Alt+arrows leave it in place; relative links count in the Pages tab", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await pasteInto(page, nestedHome);
  const cards = frame(page).locator("article.card");
  await expect(cards).toHaveCount(2);
  // Select the second card: the outer grid is its grid, a list of pages, so Add card asks for a page.
  await cards.nth(1).locator(".fact").first().click();
  await bar(page).getByRole("button", { name: "Select card" }).click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Article");
  await bar(page).getByRole("button", { name: "Add card" }).click();
  await expect(popover(page)).toBeVisible();
  await page.keyboard.press("Escape");
  // Alt+Up pressed in the canvas does not move a card: only sections move.
  await frame(page).locator("html").dispatchEvent("keydown", { key: "ArrowUp", altKey: true, bubbles: true });
  await page.waitForTimeout(300);
  await expect(status(page)).not.toHaveText("Card moved left");
  await expect(cards.locator("h3")).toHaveText(["Fern & Kettle", "Harbour Lane Pottery"]);
  // The Pages tab finds the grid through its relative links.
  await openPages(page);
  await item(page, "Work").hover();
  await explorer(page).getByRole("button", { name: "Add subpage to Work" }).click();
  await expect(explorer(page).getByRole("checkbox", { name: "Add a card to “Recent work” on Home" })).toBeChecked();
});

test("overlapping card and section Add controls remain clickable; popup tracks scroll and Undo restores cards", async ({ page, baseURL }) => {
  // A two-column grid's next row occupies the gap before the adjacent section.
  // The section plus must move clear of the centred Add button.
  const source = readFileSync("fixtures/native-cards/index.html", "utf8");
  const fixture = source
    .replace('class="cards"', 'class="cards" style="grid-template-columns:repeat(2,minmax(0,1fr));width:200%"')
    .replace('id="services"', 'id="services" style="margin-top:112px"')
    .replace('class="page"', 'class="page" style="padding-bottom:700px"');
  await open(page, baseURL);
  await pasteInto(page, fixture);
  await expect.poll(() => homeDraft(page)).toBe(fixture);
  await frame(page).locator("html").evaluate(() => window.scrollTo(0, 220));
  await frame(page).locator("#work .cards").click({ position: { x: 2, y: 2 } });
  await expect(addCard(page)).toBeVisible();
  const button = (await addCard(page).boundingBox())!;
  const sectionPlus = page.getByRole("button", { name: /Add a section before “What we do/ });
  await expect(sectionPlus).toBeVisible();
  await sectionPlus.focus();
  const hitSection = () => sectionPlus.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  });
  await expect.poll(hitSection).toBe(true);
  const plus = (await sectionPlus.boundingBox())!;
  expect(plus.x + plus.width <= button.x || plus.x >= button.x + button.width).toBe(true);
  await sectionPlus.click();
  await expect(page.getByRole("dialog", { name: "Add to the page" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Add to the page" })).toBeHidden();
  await expect(sectionPlus).toBeFocused();
  await expect.poll(hitSection).toBe(true);
  const hitAdd = () => addCard(page).evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  });
  expect(await hitAdd()).toBe(true);
  expect(await page.locator(".card-ghost").evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return document.elementFromPoint(rect.x + 4, rect.bottom - 4)?.matches(".native-preview-frame");
  })).toBe(true);
  await addCard(page).click();
  await expect(popover(page)).toBeVisible();
  await page.setViewportSize({ width: 1100, height: 900 });
  await expect.poll(hitAdd).toBe(true);
  await expect(popover(page).getByRole("textbox", { name: "Page title" })).toBeFocused();
  // With the block rail the canvas is too narrow for the popover beside the
  // button, so it opens above it, over the grid, and moves with the button.
  // 40px still leaves room above (the button is about 280px under the pane's top).
  await expect.poll(async () => {
    const [pop, add] = [(await popover(page).boundingBox())!, (await addCard(page).boundingBox())!];
    return Math.abs(add.y - (pop.y + pop.height) - 8) <= 1;
  }).toBe(true);
  const before = (await page.locator(".card-ghost").boundingBox())!;
  const beforePopup = (await popover(page).boundingBox())!;
  await frame(page).locator("html").evaluate(() => window.scrollBy(0, 40));
  await expect.poll(async () => (await page.locator(".card-ghost").boundingBox())!.y).toBeCloseTo(before.y - 40, 0);
  expect(await hitAdd()).toBe(true);
  await expect.poll(async () => (await popover(page).boundingBox())!.y).toBeCloseTo(beforePopup.y - 40, 0);
  // Scrolled on until no room is left above the button, it goes below it, never over it.
  await frame(page).locator("html").evaluate(() => window.scrollBy(0, 80));
  await expect.poll(async () => (await page.locator(".card-ghost").boundingBox())!.y).toBeCloseTo(before.y - 120, 0);
  expect(await hitAdd()).toBe(true);
  const scrolledAdd = (await addCard(page).boundingBox())!;
  await expect.poll(async () => Math.abs((await popover(page).boundingBox())!.y - (scrolledAdd.y + scrolledAdd.height + 8)) <= 1).toBe(true);
  await expect(popover(page).getByRole("textbox", { name: "Page title" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(popover(page)).toBeHidden();
  await expect(addCard(page)).toBeFocused();
  await addCard(page).click();
  await expect(popover(page)).toBeVisible();
  await frame(page).locator("#services h2").click();
  await expect(popover(page)).toBeHidden();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Heading");
  await expect(page.getByRole("treeitem", { name: "Heading What we do", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(frame(page).locator("card-project")).toHaveCount(2);
  expect(await homeDraft(page)).toBe(fixture);
  await frame(page).locator("card-project").first().hover();
  await addCard(page).click();
  await popover(page).getByRole("button", { name: "Card only", exact: true }).click();
  await expect(frame(page).locator("card-project")).toHaveCount(3);
  await page.locator(".code-editor__undo").click();
  await expect(frame(page).locator("card-project")).toHaveCount(2);
});

test("a stale grid report cannot restore controls or edit the previous source", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.evaluate(() => {
    window.addEventListener("message", (event) => {
      if (event.data?.source === "astro-native-preview" && event.data.type === "item-grids" && event.data.hover) {
        (window as unknown as { savedGridReport: unknown }).savedGridReport = event.data;
      }
    });
  });
  await frame(page).locator("card-project").first().hover();
  await expect(addCard(page)).toBeVisible();
  const old = await page.evaluate(() => (window as unknown as { savedGridReport: unknown }).savedGridReport);
  expect(old).toBeTruthy();
  await addCard(page).click();
  await expect(popover(page)).toBeVisible();
  const replacement = nestedHome.replace('<div class="cards">', '<div class="spacer">Different source</div><div class="cards">');
  await pasteInto(page, replacement);
  await expect(frame(page).locator("article.card")).toHaveCount(2);
  await expect(popover(page)).toBeHidden();
  await page.evaluate((data) => {
    const frame = document.querySelector<HTMLIFrameElement>(".native-preview-frame")!;
    window.dispatchEvent(new MessageEvent("message", { data, source: frame.contentWindow }));
  }, old);
  await expect(addCard(page)).toBeHidden();
  expect(await homeDraft(page)).toBe(replacement);
  await frame(page).locator("article.card").first().hover();
  await addCard(page).click();
  await popover(page).getByRole("button", { name: "Card only", exact: true }).click();
  await expect(frame(page).locator("article.card")).toHaveCount(3);
  expect(await homeDraft(page)).toContain('<div class="spacer">Different source</div>');
  await page.locator(".code-editor__undo").click();
  await expect.poll(() => homeDraft(page)).toBe(replacement);
});
test('only a fully occluded section plus is hidden, remains keyboard reachable, and drag targets stay visible',async({page,baseURL})=>{
  await open(page,baseURL);
  await page.evaluate(async()=>{
    const {createInsertControls}=await import('/src/components/insert-controls.ts');
    const pane=document.createElement('div');pane.id='collision-fixture';Object.assign(pane.style,{position:'fixed',left:'20px',top:'100px',width:'100px',height:'160px',zIndex:'100',background:'white'});
    const frame=document.createElement('div');Object.assign(frame.style,{width:'100px',height:'160px'});pane.append(frame);document.body.append(pane);
    const blocker=document.createElement('button');blocker.className='card-ghost__add';blocker.textContent='Card';Object.assign(blocker.style,{position:'absolute',left:'0',top:'34px',width:'100px',height:'32px',zIndex:'21'});pane.append(blocker);
    const controls=createInsertControls(pane,frame,{onOpen:()=>pane.dataset.open='true'});
    controls.update([{path:'fixture',parent:[],index:0,top:50,left:0,width:100,before:'First'},{path:'fixture',parent:[],index:1,top:120,left:0,width:100,before:''}]);controls.hover({parent:[],index:0});
    Object.assign(window,{collisionControls:controls});
  });
  const fixture=page.locator('#collision-fixture'),first=fixture.getByRole('button',{name:'Add a section before “First”'}),last=fixture.getByRole('button',{name:'Add a section at the end'});
  await expect(first).toHaveCSS('opacity','0');await expect(last).toHaveCSS('opacity','1');
  await first.focus();await expect(first).toHaveCSS('opacity','1');
  expect(await first.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
  await page.keyboard.press('Enter');await expect(fixture).toHaveAttribute('data-open','true');
  // A section dragged from the Add panel over the first gap.
  await page.evaluate(()=>(window as any).collisionControls.showDrop({parent:[],index:0}));
  await expect(first).toBeHidden();await expect(fixture.locator('.is-target .insert-point__drop')).toBeVisible();
  await page.evaluate(()=>{(window as any).collisionControls.showDrop(undefined);(window as any).collisionControls.destroy();document.querySelector('#collision-fixture')!.remove();});
});
test('collision placement uses real screen rectangles under a scaled preview pane',async({page,baseURL})=>{
  await open(page,baseURL);
  await page.evaluate(async()=>{
    const {createInsertControls}=await import('/src/components/insert-controls.ts');
    const pane=document.createElement('div');pane.id='scaled-collision';Object.assign(pane.style,{position:'fixed',left:'20px',top:'100px',width:'400px',height:'160px',zIndex:'100',transform:'scale(.9)',transformOrigin:'top left'});
    const frame=document.createElement('div');Object.assign(frame.style,{width:'400px',height:'160px',transform:'scale(.75)',transformOrigin:'top left'});pane.append(frame);document.body.append(pane);
    const blocker=document.createElement('button');blocker.className='card-ghost__add';blocker.textContent='Card';Object.assign(blocker.style,{position:'absolute',left:'0',top:'34px',width:'220px',height:'32px',zIndex:'21'});pane.append(blocker);
    const controls=createInsertControls(pane,frame,{onOpen:()=>pane.dataset.open='true'});controls.update([{path:'scaled',parent:[],index:0,top:50,left:0,width:300,before:'Scaled'}]);controls.hover({parent:[],index:0});Object.assign(window,{scaledControls:controls});
  });
  const plus=page.locator('#scaled-collision .insert-point__plus');
  await expect.poll(()=>plus.evaluate(el=>{const r=el.getBoundingClientRect();const other=document.querySelector('#scaled-collision .card-ghost__add')!.getBoundingClientRect();return r.left>=other.right||r.right<=other.left;})).toBe(true);
  expect(await plus.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
  await plus.click();await expect(page.locator('#scaled-collision')).toHaveAttribute('data-open','true');
  await page.evaluate(()=>{(window as any).scaledControls.destroy();document.querySelector('#scaled-collision')!.remove();});
});

const box = (locator: ReturnType<Page["locator"]>) => locator.boundingBox().then((b) => b!);
const apart = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x + a.width <= b.x + 0.5 || b.x + b.width <= a.x + 0.5 || a.y + a.height <= b.y + 0.5 || b.y + b.height <= a.y + 0.5;

test("below a grid the ghost stops where the next content starts; the page is not moved or changed", async ({ page, baseURL }) => {
  // Two columns, both full, and the next section flush under the grid: a
  // whole card's ghost would cover it. The ghost becomes a strip ending at the
  // section's top; the page's own layout and DOM stay as authored.
  const source = readFileSync("fixtures/native-cards/index.html", "utf8");
  const fixture = source
    .replace('class="cards"', 'class="cards" style="grid-template-columns:repeat(2,minmax(0,1fr))"')
    .replace('id="services"', 'id="services" style="margin-top:0"');
  await open(page, baseURL);
  await pasteInto(page, fixture);
  await expect.poll(() => homeDraft(page)).toBe(fixture);
  // The page's DOM, less the editor's own contenteditable on the heading being edited.
  const main = () => frame(page).locator("#main").evaluate((el) => {
    const copy = el.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("[contenteditable]").forEach((edited) => edited.removeAttribute("contenteditable"));
    return copy.outerHTML;
  });
  const services = frame(page).locator("#services");
  const offset = () => services.evaluate((el) =>
    el.getBoundingClientRect().top - el.ownerDocument.querySelector("#work .cards")!.getBoundingClientRect().bottom);
  const domBefore = await main();
  const offsetBefore = await offset();

  await frame(page).locator("card-project").nth(1).locator("h3[slot=title]").click();
  await expect(addCard(page)).toBeVisible();
  await expect(page.locator(".card-ghost")).toHaveClass(/is-strip/);
  const ghost = await box(page.locator(".card-ghost"));
  expect(ghost.y + ghost.height).toBeLessThanOrEqual((await box(services)).y + 0.5);
  expect(apart(await box(addCard(page)), await box(services.locator("h2")))).toBe(true);
  // The section plus before the next section and the Add button never overlap.
  const sectionPlus = page.getByRole("button", { name: /Add a section before “What we do/ });
  await frame(page).locator("#services h2").hover();
  await expect(sectionPlus).toBeVisible();
  expect(apart(await box(sectionPlus), await box(addCard(page)))).toBe(true);
  // Nothing in the page moved or changed: same DOM, same gap, same source.
  expect(await main()).toBe(domBefore);
  expect(await offset()).toBe(offsetBefore);
  expect(await homeDraft(page)).toBe(fixture);

  // The popover opens from the strip; its title takes typing; clicking the
  // next section closes it and selects that section's heading.
  await addCard(page).click();
  await expect(popover(page)).toBeVisible();
  const title = popover(page).getByRole("textbox", { name: "Page title" });
  await expect(title).toBeFocused();
  await title.fill("Draft");
  await expect(title).toHaveValue("Draft");
  // It opens up over the grid, clear of the next section.
  expect(apart(await box(popover(page)), await box(services.locator("h2")))).toBe(true);
  expect((await box(popover(page))).y + (await box(popover(page))).height).toBeLessThanOrEqual((await box(services)).y + 0.5);
  await frame(page).locator("#services h2").click();
  await expect(popover(page)).toBeHidden();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Heading");
  await expect(page.getByRole("treeitem", { name: "Heading What we do", exact: true })).toHaveAttribute("aria-selected", "true");
  expect(await main()).toBe(domBefore);
  expect(await homeDraft(page)).toBe(fixture);

  // Card only adds exactly one card; Undo gives the source back byte for byte.
  await frame(page).locator("card-project").nth(1).locator("h3[slot=title]").click();
  await addCard(page).click();
  await popover(page).getByRole("button", { name: "Card only", exact: true }).click();
  await expect(frame(page).locator("card-project")).toHaveCount(3);
  expect((await homeDraft(page)).match(/<card-project>/g)).toHaveLength(3);
  await page.locator(".code-editor__undo").click();
  await expect(frame(page).locator("card-project")).toHaveCount(2);
  await expect.poll(() => homeDraft(page)).toBe(fixture);
});

test("with room below the grid the ghost fills it; a list's ghost stops at the section after it", async ({ page, baseURL }) => {
  const source = readFileSync("fixtures/native-cards/index.html", "utf8");
  const fixture = source
    .replace('class="cards"', 'class="cards" style="grid-template-columns:repeat(2,minmax(0,1fr))"')
    .replace('id="services"', 'id="services" style="margin-top:80px"')
    .replace("    </section>\n  </main>", '    </section>\n    <section class="flow" id="after" style="margin-top:0"><h2>After</h2></section>\n  </main>')
    // A CSS grid section with a side column: an aside beside the cards, lower
    // than them, shares none of the ghost's columns and does not cut it.
    .replace('class="flow" id="work"', 'class="flow" id="work" style="display:grid;grid-template-columns:1fr 160px;column-gap:24px"')
    .replace("<h2>Recent work</h2>", '<h2 style="grid-column:1/-1">Recent work</h2>')
    .replace("      </div>\n    </section>\n    <section class=\"flow\" id=\"services\"", '      </div>\n      <aside id="side" style="align-self:end;margin-bottom:-200px">Side note</aside>\n    </section>\n    <section class="flow" id="services"');
  expect(fixture).toContain('id="after"');
  expect(fixture).toContain('id="side"');
  await open(page, baseURL);
  await pasteInto(page, fixture);
  await expect.poll(() => homeDraft(page)).toBe(fixture);
  await frame(page).locator("card-project").first().locator("h3[slot=title]").click();
  await frame(page).locator("#work .cards").evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().bottom - 120));
  await expect(addCard(page)).toBeVisible();
  await expect(page.locator(".card-ghost")).not.toHaveClass(/is-strip/);
  const ghost = await box(page.locator(".card-ghost"));
  const services = await box(frame(page).locator("#services"));
  const side = await box(frame(page).locator("#side"));
  expect(side.y).toBeGreaterThan(ghost.y);
  expect(side.x).toBeGreaterThanOrEqual(ghost.x + ghost.width);
  expect(ghost.y + ghost.height).toBeLessThanOrEqual(services.y + 0.5);
  expect(ghost.y + ghost.height).toBeGreaterThan(services.y - 2);
  // A column list: its ghost stays above the section that follows.
  await frame(page).locator("ul.services li").nth(1).hover();
  await expect(addCard(page)).toHaveAccessibleName("Add an item to What we do");
  const listGhost = await box(page.locator(".card-ghost"));
  const after = await box(frame(page).locator("#after"));
  expect(listGhost.y + listGhost.height).toBeLessThanOrEqual(after.y + 0.5);
  expect(apart(await box(addCard(page)), await box(frame(page).locator("#after h2")))).toBe(true);
  expect(await homeDraft(page)).toBe(fixture);
});

test("near the pane's top or in a narrow pane the popover never covers its button, and its title takes typing", async ({ page, baseURL }) => {
  const source = readFileSync("fixtures/native-cards/index.html", "utf8");
  const fixture = source
    .replace('class="cards"', 'class="cards" style="grid-template-columns:repeat(2,minmax(0,1fr))"')
    .replace('id="services"', 'id="services" style="margin-top:0"')
    .replace('class="page"', 'class="page" style="padding-bottom:1200px"');
  await open(page, baseURL);
  await pasteInto(page, fixture);
  await expect.poll(() => homeDraft(page)).toBe(fixture);
  const card = frame(page).locator("card-project").nth(1).locator("h3[slot=title]");
  for (const size of [{ width: 1440, height: 1000 }]) {
    await page.setViewportSize(size);
    await card.click();
    // The grid's bottom just under the pane's top: no room above the button.
    await frame(page).locator("html").evaluate(() => {
      const cards = document.querySelector("#work .cards")!;
      window.scrollBy(0, cards.getBoundingClientRect().bottom - 40);
    });
    await expect(addCard(page)).toBeVisible();
    await addCard(page).click();
    await expect(popover(page)).toBeVisible();
    const title = popover(page).getByRole("textbox", { name: "Page title" });
    await expect(title).toBeFocused();
    await expect.poll(async () => apart(await box(popover(page)), await box(addCard(page)))).toBe(true);
    // Scrolling back up step by step moves the grid down through the band
    // where the popover just fits, or just does not fit, above the button.
    for (let step = 0; step < 50; step++) {
      await frame(page).locator("html").evaluate(() => window.scrollBy(0, -6));
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      if (!(await addCard(page).isVisible())) break;
      const pop = await box(popover(page));
      const button = await box(addCard(page));
      expect(apart(pop, button), `step ${step}: popover ${JSON.stringify(pop)} over button ${JSON.stringify(button)}`).toBe(true);
    }
    await expect(title).toBeFocused();
    await title.fill("Near the top");
    await expect(title).toHaveValue("Near the top");
    await expect(popover(page).getByRole("button", { name: "Card only", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(popover(page)).toBeHidden();
    await frame(page).locator("html").evaluate(() => window.scrollTo(0, 0));
  }
  expect(await homeDraft(page)).toBe(fixture);
});

test("a grid slotted into a component stops its ghost at the template's content after the slot", async ({ page, baseURL }) => {
  // card-project's template has its default <slot> before the paragraph that
  // holds its link: a list slotted there is followed by the link on screen,
  // not in the page's DOM.
  const source = readFileSync("fixtures/native-cards/index.html", "utf8");
  const fixture = source.replace(
    '<a slot="link" href="/work/fern-and-kettle/">Read about Fern &amp; Kettle</a>\n        </card-project>',
    '<a slot="link" href="/work/fern-and-kettle/">Read about Fern &amp; Kettle</a>\n          <ul class="facts" style="margin:0"><li>Menu</li><li>Hours</li></ul>\n        </card-project>');
  expect(fixture).toContain('class="facts"');
  await open(page, baseURL);
  await pasteInto(page, fixture);
  await expect.poll(() => homeDraft(page)).toBe(fixture);
  await frame(page).locator("ul.facts li").nth(1).hover();
  await expect(addCard(page)).toHaveAccessibleName(/Add an item/);
  const ghost = await box(page.locator(".card-ghost"));
  const link = await box(frame(page).locator("card-project").first().locator("a[slot=link]"));
  const last = await box(frame(page).locator("ul.facts li").last());
  expect(link.y).toBeGreaterThan(last.y);
  expect(ghost.y + ghost.height).toBeLessThanOrEqual(link.y + 0.5);
  expect(apart(await box(addCard(page)), link)).toBe(true);
  expect(await homeDraft(page)).toBe(fixture);
});

test("in a pane too narrow for the popover beside its button, it opens above it when it fits and below it when not, never over it", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const results = await page.evaluate(async () => {
    const { createCardGridControls } = await import("/src/components/card-grid-controls.ts");
    const pane = document.createElement("div");
    Object.assign(pane.style, { position: "fixed", left: "20px", top: "60px", width: "360px", height: "520px", zIndex: "100", background: "white" });
    const frame = document.createElement("div");
    Object.assign(frame.style, { width: "360px", height: "520px" });
    pane.append(frame);
    document.body.append(pane);
    const controls = createCardGridControls(pane, frame, {
      describe: () => ({ noun: "card", label: "Work", collection: "/work/" }),
      plan: () => ({ ok: true, value: { route: "/work/x/" } }),
      addCard: () => {},
      addPage: async () => undefined,
    });
    const grid = (top: number) => ({ path: "index.html", parent: [1, 1], index: 1, position: 1, count: 2, row: true, beside: false,
      ghost: { top, left: 20, width: 320, height: 32 } });
    const frameFor = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const out: { top: number; overlap: boolean; above: boolean; focused: boolean }[] = [];
    controls.update({ hover: null, selected: grid(300) });
    (pane.querySelector(".card-ghost__add") as HTMLElement).click();
    await frameFor();
    for (let top = 0; top <= 480; top += 4) {
      controls.update({ hover: null, selected: grid(top) });
      await frameFor();
      const button = pane.querySelector(".card-ghost__add")!.getBoundingClientRect();
      const form = pane.querySelector(".card-add")!.getBoundingClientRect();
      const overlap = !(form.right <= button.left || button.right <= form.left || form.bottom <= button.top + 0.5 || button.bottom <= form.top + 0.5);
      out.push({ top, overlap, above: form.bottom <= button.top + 0.5, focused: document.activeElement?.classList.contains("card-add__input") ?? false });
    }
    controls.destroy();
    pane.remove();
    return out;
  });
  expect(results.filter((r) => r.overlap)).toEqual([]);
  // Near the top it opens below; with room above it opens above.
  expect(results[0].above).toBe(false);
  expect(results[results.length - 1].above).toBe(true);
  expect(results.every((r) => r.focused)).toBe(true);
});

test("a slotted list's ghost stops at the next element in its own slot", async ({ page, baseURL }) => {
  // The list and a paragraph after it both go to card-project's default slot.
  const source = readFileSync("fixtures/native-cards/index.html", "utf8");
  const fixture = source.replace(
    '<a slot="link" href="/work/fern-and-kettle/">Read about Fern &amp; Kettle</a>\n        </card-project>',
    '<a slot="link" href="/work/fern-and-kettle/">Read about Fern &amp; Kettle</a>\n          <ul class="facts" style="margin:0"><li>Menu</li><li>Hours</li></ul>\n          <p class="after-facts" style="margin:0">Open daily</p>\n        </card-project>');
  expect(fixture).toContain('class="after-facts"');
  await open(page, baseURL);
  await pasteInto(page, fixture);
  await expect.poll(() => homeDraft(page)).toBe(fixture);
  const main = () => frame(page).locator("#main").evaluate((el) => el.outerHTML);
  const domBefore = await main();
  await frame(page).locator("ul.facts li").nth(1).hover();
  await expect(addCard(page)).toHaveAccessibleName(/Add an item/);
  const ghost = await box(page.locator(".card-ghost"));
  const after = await box(frame(page).locator("p.after-facts"));
  const last = await box(frame(page).locator("ul.facts li").last());
  expect(after.y).toBeGreaterThanOrEqual(last.y + last.height - 1);
  expect(ghost.y + ghost.height).toBeLessThanOrEqual(after.y);
  expect(apart(await box(addCard(page)), after)).toBe(true);
  expect(await main()).toBe(domBefore);
  expect(await homeDraft(page)).toBe(fixture);
});

test("a grid's own trailing link after its cards stops the ghost, which never covers it", async ({ page, baseURL }) => {
  const source = readFileSync("fixtures/native-cards/index.html", "utf8");
  const fixture = source
    .replace('class="cards"', 'class="cards" style="grid-template-columns:repeat(2,minmax(0,1fr))"')
    .replace("        </card-project>\n      </div>", '        </card-project>\n        <a class="more" href="/work/" style="grid-column:1/-1">View all work</a>\n      </div>')
    .replace('id="services"', 'id="services" style="margin-top:120px"');
  expect(fixture).toContain('class="more"');
  await open(page, baseURL);
  await pasteInto(page, fixture);
  await expect.poll(() => homeDraft(page)).toBe(fixture);
  const main = () => frame(page).locator("#main").evaluate((el) => {
    const copy = el.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("[contenteditable]").forEach((edited) => edited.removeAttribute("contenteditable"));
    return copy.outerHTML;
  });
  const domBefore = await main();
  await frame(page).locator("card-project").nth(1).locator("h3[slot=title]").click();
  await frame(page).locator("#work .cards").evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().bottom - 300));
  await expect(addCard(page)).toBeVisible();
  const ghost = await box(page.locator(".card-ghost"));
  const more = await box(frame(page).locator("a.more"));
  expect(ghost.y + ghost.height).toBeLessThanOrEqual(more.y);
  expect(apart(await box(addCard(page)), more)).toBe(true);
  expect(await main()).toBe(domBefore);
  expect(await homeDraft(page)).toBe(fixture);
});

test("Make component on a grid of plain cards makes the section and a card component, the cards its instances, one undo step", async ({ page, baseURL }) => {
  // Recent work with its cards written out as plain HTML (as Detach leaves them).
  const home = readFileSync("fixtures/native-cards/index.html", "utf8");
  const plain = home.replace(/<card-project>\s*<p slot="note">([^<]*)<\/p>\s*<h3 slot="title">([^<]*)<\/h3>\s*<p slot="body" class="body">([^<]*)<\/p>\s*<a slot="link" href="([^"]*)">([^<]*)<\/a>\s*<\/card-project>/g,
    `<article class="project">
          <p class="note">$1</p>
          <h3>$2</h3>
          <p class="body">$3</p>
          <a href="$4">$5</a>
        </article>`);
  expect(plain.match(/<article class="project">/g)).toHaveLength(2);
  // The session (its cookie) comes with the first load; the edit lands on GitHub, the reload reads it.
  await open(page, baseURL);
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { repo: "native-cards", path: "index.html", content: plain } });
  await page.reload();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(status(page)).toContainText("Up to date with main", { timeout: 30_000 });
  const section = frame(page).locator("#work");
  await expect(section.locator("article.project h3")).toHaveText(["Fern & Kettle", "Harbour Lane Pottery"]);
  const before = (await section.boundingBox())!;
  const cardBoxes = async (cards: import("@playwright/test").Locator) => Promise.all((await cards.all()).map(async (one) => (await one.boundingBox())!));
  const beforeCards = await cardBoxes(section.locator("article.project"));

  await page.getByRole("tree", { name: "Page structure" }).getByRole("treeitem", { name: /^Section Recent work/ }).locator(".page-structure__label").first().click();
  await bar(page).getByRole("button", { name: "Make component", exact: true }).click();
  // Named from its heading; Edit component mode opens on it.
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "components/section-recent-work/section-recent-work.html");
  await expect(status(page)).toContainText("Made the component <section-recent-work>: components/section-recent-work/section-recent-work.html, and <card-recent-work>");
  await page.getByRole("button", { name: "Done editing component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");

  // Four files and the page, written together; each card keeps its own content in its slots.
  await expect.poll(async () => (await storedDraft(page, "components/section-recent-work/section-recent-work.html"))?.content ?? "").toContain("<slot><card-recent-work></card-recent-work></slot>");
  const card = (await storedDraft(page, "components/card-recent-work/card-recent-work.html"))!.content;
  expect(card).toContain(`<slot name="title"><h3>Fern &amp; Kettle</h3></slot>`);
  expect(card).toContain(`<slot name="note"><p class="note">Cafe · Identity and site · 2025</p></slot>`);
  expect((await storedDraft(page, "components/card-recent-work/card-recent-work.css"))?.content).toContain(":host");
  expect((await storedDraft(page, "components/section-recent-work/section-recent-work.css"))?.content).toContain(":host");
  const written = await homeDraft(page);
  expect(written).toContain(`<section-recent-work id="work">`);
  expect(written.match(/<card-recent-work>/g)).toHaveLength(2);
  expect(written).toContain(`<h3 slot="title">Harbour Lane Pottery</h3>`);
  expect(written).toContain(`<a slot="link" href="/work/harbour-lane-pottery/">Read about Harbour Lane Pottery</a>`);

  // The page looks the same.
  const made = frame(page).locator("section-recent-work");
  await expect(made.locator("card-recent-work > h3")).toHaveText(["Fern & Kettle", "Harbour Lane Pottery"]);
  await expect(made.locator("card-recent-work > a")).toHaveText(["Read about Fern & Kettle", "Read about Harbour Lane Pottery"]);
  const after = (await made.boundingBox())!;
  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
  const afterCards = await cardBoxes(made.locator(":scope > card-recent-work"));
  expect(afterCards).toHaveLength(2);
  // Each card where it was in its section (the preview may have scrolled to the selection).
  afterCards.forEach((box, index) => {
    const was = beforeCards[index];
    expect(Math.abs(box.x - after.x - (was.x - before.x))).toBeLessThanOrEqual(1);
    expect(Math.abs(box.y - after.y - (was.y - before.y))).toBeLessThanOrEqual(1);
    expect(Math.abs(box.width - was.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.height - was.height)).toBeLessThanOrEqual(1);
  });

  // One undo takes the page and all four files back.
  await page.locator(".code-editor__undo").first().click();
  await expect(section.locator("article.project h3")).toHaveText(["Fern & Kettle", "Harbour Lane Pottery"]);
  await expect.poll(async () => await storedDraft(page, "components/card-recent-work/card-recent-work.html")).toBeUndefined();
  for (const file of ["section-recent-work/section-recent-work.html", "section-recent-work/section-recent-work.css", "card-recent-work/card-recent-work.css"]) expect(await storedDraft(page, `components/${file}`)).toBeUndefined();
  expect(await storedDraft(page, "index.html")).toBeUndefined();
  // Redo writes them all again.
  await page.locator(".code-editor__redo").first().click();
  await expect(made.locator("card-recent-work > h3")).toHaveText(["Fern & Kettle", "Harbour Lane Pottery"]);
  await expect.poll(async () => (await storedDraft(page, "components/card-recent-work/card-recent-work.html"))?.content).toBe(card);
  expect(await homeDraft(page)).toBe(written);
  for (const file of ["section-recent-work/section-recent-work.html", "section-recent-work/section-recent-work.css", "card-recent-work/card-recent-work.css"]) expect(await storedDraft(page, `components/${file}`)).toBeDefined();
});

test("Make component copies the rules that styled the section into its CSS, so its heading, lead and links look the same", async ({ page, baseURL }) => {
  // A section styled by rules scoped to its class (one through an ancestor), and one rule for something inside a slotted part.
  const home = readFileSync("fixtures/native-cards/index.html", "utf8").replace(`    <section class="flow" id="work">`, `    <section class="intro">
      <h2>Made to be changed</h2>
      <p class="lead">Every page is <em>plain HTML</em> you can open and edit.</p>
      <div class="actions">
        <a href="/work/fern-and-kettle/">See the work</a>
        <a href="/#services">What we do</a>
      </div>
    </section>
    <section class="flow" id="work">`);
  const css = `${readFileSync("fixtures/native-cards/styles/site.css", "utf8")}
@layer sections {
  .intro h2 { letter-spacing: 3px; text-transform: uppercase; color: rgb(120, 40, 20); }
}
.intro .lead { font-style: italic; word-spacing: 4px; }
.intro .lead em { color: rgb(200, 0, 0); }
@media (min-width: 1px) {
  main .intro .actions a { text-decoration: none; font-weight: 700; padding: 4px 10px; border: 2px solid currentColor; }
}
`;
  await open(page, baseURL);
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { repo: "native-cards", path: "styles/site.css", content: css } });
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { repo: "native-cards", path: "index.html", content: home } });
  await page.reload();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(status(page)).toContainText("Up to date with main", { timeout: 30_000 });
  const properties = ["letter-spacing", "text-transform", "color", "font-size", "font-style", "word-spacing", "text-decoration-line", "font-weight", "padding-left", "border-top-width"];
  const looks = (locator: import("@playwright/test").Locator) => locator.evaluateAll((elements, names) =>
    elements.map((element) => names.map((name) => `${name}: ${getComputedStyle(element).getPropertyValue(name)}`)), properties);
  const section = frame(page).locator("section.intro");
  await expect(section.locator("h2")).toHaveText("Made to be changed");
  const before = [await looks(section.locator("h2")), await looks(section.locator(".lead")), await looks(section.locator(".actions a"))];
  expect(before[0][0]).toContain("letter-spacing: 3px");
  expect(before[2][1]).toContain("font-weight: 700");

  await page.getByRole("tree", { name: "Page structure" }).getByRole("treeitem", { name: /^Section Made to be changed/ }).locator(".page-structure__label").first().click();
  await bar(page).getByRole("button", { name: "Make component", exact: true }).click();
  await expect(status(page)).toContainText("Made the component <section-made-to-be>");
  // The rule that can't follow is a note in Edit component mode's bar, all of it in the panel it opens, until dismissed.
  const note = page.locator(".canvas-bar").getByRole("note");
  await expect(note).toContainText("1 rule can't follow the parts into the component: .intro .lead em.");
  await note.getByRole("button", { name: /^Note/ }).click();
  await expect(page.locator("#edit-mode-notes")).toBeVisible();
  await expect(page.locator("#edit-mode-notes li")).toHaveText([/1 rule can't follow the parts into the component: \.intro \.lead em\./]);
  await page.keyboard.press("Escape");
  // Dismissed from the keyboard, the focus goes to Done.
  await note.getByRole("button", { name: "Dismiss the notes", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(note).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Done editing component", exact: true })).toBeFocused();
  await expect(page.locator(".canvas-bar .edit-mode__title")).toHaveText("Editing<section-made-to-be>");
  await page.getByRole("button", { name: "Done editing component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");

  // The rules, rewritten to start at the section, in the component's CSS; the site's stylesheet as it was.
  await expect.poll(async () => (await storedDraft(page, "components/section-made-to-be/section-made-to-be.css"))?.content ?? "").toContain(".intro .actions a {");
  const written = (await storedDraft(page, "components/section-made-to-be/section-made-to-be.css"))!.content;
  expect(written).toContain(".intro h2 {\n  letter-spacing: 3px;");
  expect(written).toContain(".intro .lead {\n  font-style: italic;");
  expect(written).toContain("@media (min-width: 1px) {\n  .intro .actions a {");
  expect(written).not.toContain("@layer");
  expect(written).not.toContain(".lead em");
  expect(await storedDraft(page, "styles/site.css")).toBeUndefined();

  // The page looks the same: the heading, lead and links, now slotted into the component.
  const made = frame(page).locator("section-made-to-be");
  await expect(made.locator(":scope > h2")).toHaveText("Made to be changed");
  await expect.poll(async () => [await looks(made.locator(":scope > h2")), await looks(made.locator(":scope > .lead")), await looks(made.locator(":scope > a"))]).toEqual(before);
});

test("queued grid reports cannot close a newly opened card popover before its tracking request is applied", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const states = await page.evaluate(async () => {
    const { createCardGridControls } = await import("/src/components/card-grid-controls.ts");
    const pane = document.createElement("div");
    Object.assign(pane.style, { position: "fixed", left: "20px", top: "60px", width: "360px", height: "520px", zIndex: "100", background: "white" });
    const frame = document.createElement("iframe");
    Object.assign(frame.style, { width: "360px", height: "520px" });
    pane.append(frame);
    document.body.append(pane);
    const requests: { tracking?: number }[] = [];
    frame.contentWindow!.postMessage = (request: { tracking?: number }) => { requests.push(request); };
    const controls = createCardGridControls(pane, frame, {
      describe: () => ({ noun: "card", label: "Work", collection: "/work/" }),
      plan: () => ({ ok: true, value: { route: "/work/x/" } }),
      addCard: () => {},
      addPage: async () => undefined,
    });
    const grid = { path: "index.html", parent: [1, 1], index: 1, position: 1, count: 2, row: true, beside: false,
      ghost: { top: 300, left: 20, width: 320, height: 32 } };
    const add = pane.querySelector<HTMLButtonElement>(".card-ghost__add")!;
    const form = pane.querySelector<HTMLFormElement>(".card-add")!;
    const out: { step: string; open: boolean; focused: boolean }[] = [];
    const record = (step: string) => out.push({ step, open: !form.hidden, focused: form.contains(document.activeElement) });
    controls.update({ hover: grid, selected: null });
    add.click();
    const first = requests.at(-1)?.tracking;
    record("opened");
    // These reports were queued before the frame received the tracking request.
    controls.update({ hover: grid, selected: null });
    controls.update({ hover: null, selected: null });
    record("queued leave");
    controls.update({ hover: grid, selected: null, tracking: first });
    record("tracked");
    form.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    const closed = requests.at(-1)?.tracking;
    add.click();
    const second = requests.at(-1)?.tracking;
    // Reopening the same grid also rejects reports from its previous opening.
    controls.update({ hover: grid, selected: null, tracking: first });
    controls.update({ hover: null, selected: null, tracking: closed });
    record("old opening and closing");
    controls.update({ hover: grid, selected: null, tracking: second });
    record("retracked");
    controls.update({ hover: null, selected: null, tracking: second });
    record("removed grid");
    const removal = requests.at(-1)?.tracking;
    add.click();
    const third = requests.at(-1)?.tracking;
    controls.update({ hover: null, selected: null, tracking: removal });
    record("queued removal");
    // Even unchanged empty geometry must close once this opening is acknowledged.
    controls.update({ hover: null, selected: null, tracking: third });
    record("unavailable tracked grid");
    controls.destroy();
    pane.remove();
    return out;
  });
  expect(states).toEqual([
    { step: "opened", open: true, focused: true },
    { step: "queued leave", open: true, focused: true },
    { step: "tracked", open: true, focused: true },
    { step: "old opening and closing", open: true, focused: true },
    { step: "retracked", open: true, focused: true },
    { step: "removed grid", open: false, focused: false },
    { step: "queued removal", open: true, focused: true },
    { step: "unavailable tracked grid", open: false, focused: false },
  ]);
});
