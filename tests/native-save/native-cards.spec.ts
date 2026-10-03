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

test("review: a card holding a grid of its own is its grid's card; Alt+arrows move it from the canvas; relative links count in the Pages tab", async ({ page, baseURL }) => {
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
  // Alt+Up pressed in the canvas moves the selected card.
  await frame(page).locator("html").dispatchEvent("keydown", { key: "ArrowUp", altKey: true, bubbles: true });
  await expect(status(page)).toHaveText("Card moved left");
  await expect(cards.locator("h3")).toHaveText(["Harbour Lane Pottery", "Fern & Kettle"]);
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
  const before = (await page.locator(".card-ghost").boundingBox())!;
  const beforePopup = (await popover(page).boundingBox())!;
  await frame(page).locator("html").evaluate(() => window.scrollBy(0, 80));
  await expect.poll(async () => (await page.locator(".card-ghost").boundingBox())!.y).toBeCloseTo(before.y - 80, 0);
  expect(await hitAdd()).toBe(true);
  await expect.poll(async () => (await popover(page).boundingBox())!.y).toBeLessThan(beforePopup.y);
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
  await page.evaluate(()=>(window as any).collisionControls.dragStart({parent:[],index:0}));
  await page.evaluate(()=>(window as any).collisionControls.dragTarget({parent:[],index:0}));
  await expect(first).toBeHidden();await expect(fixture.locator('.is-target .insert-point__drop')).toBeVisible();
  await page.evaluate(()=>{(window as any).collisionControls.dragEnd();(window as any).collisionControls.destroy();document.querySelector('#collision-fixture')!.remove();});
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
