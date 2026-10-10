import { expect, test, type Locator, type Page } from "@playwright/test";
import { editorMounted } from "./drafts";

// Default fixture group: native-cards (#repo=540), a Section › Div (grid) › two cards.
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const rail = (page: Page) => page.getByRole("navigation", { name: "Blocks" });
const ghost = (page: Page) => page.locator(".pb-drag-ghost");
const where = (page: Page) => page.locator(".pb-drag-ghost__where");
const source = async (page: Page) => (await editorMounted(page), page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")));
const flat = (html: string | undefined) => (html ?? "").replace(/\s+(?=<)/g, "");

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=540&branch=main&file=index.html`);
  await expect(frame(page).locator("#work .cards card-project").first()).toBeVisible({ timeout: 30_000 });
  await expect(rail(page)).toBeVisible();
  await editorMounted(page);
  // The grid's columns are the stylesheet's: wait for two cards side by side.
  await expect.poll(() => frame(page).locator("#work .cards").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBeGreaterThan(1);
}

/** A point in the frame (an element's box, `fx`/`fy` across it, plus `dx`/`dy` px), in page coordinates. */
async function pointIn(page: Page, selector: string, fx = 0.5, fy = 0.5, dx = 0, dy = 0) {
  const target = frame(page).locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const box = (await page.locator(".native-preview-frame").boundingBox())!;
  const r = await target.evaluate(el => { const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, width: b.width, height: b.height }; });
  return { x: box.x + r.left + r.width * fx + dx, y: box.y + r.top + r.height * fy + dy };
}

/** Presses a rail block and drags it past the 7 px threshold to `to`. */
async function dragFromRail(page: Page, name: string, to: { x: number; y: number }) {
  const button = rail(page).getByRole("button", { name, exact: true });
  const b = (await button.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 12, b.y + b.height / 2, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await expect(ghost(page)).toBeVisible();
  await expect(ghost(page).locator(".pb-drag-ghost__name")).toHaveText(name);
  await expect(ghost(page).locator("svg")).toHaveCount(1);
  await expect(ghost(page).locator("svg.element-icon")).toHaveAttribute("width", "14");
}

// The gap between the grid's two cards.
const betweenCards = (page: Page) => pointIn(page, "#work .cards card-project:nth-child(2)", 0, 0.3, -3);

test("a Paragraph dragged from the rail between two cards of a nested grid lands there, one undo step", { tag: "@smoke" }, async ({ page, baseURL }) => {
  await open(page, baseURL);
  const original = await source(page);
  await dragFromRail(page, "Paragraph", await betweenCards(page));
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Div (grid) › after Card project");
  // The line stands sideways between the cards; nothing outlines the grid.
  await expect(page.locator(".pb-drop__line--v")).toBeVisible();
  await expect(page.locator(".pb-drop__refused, .pb-drop__area")).toHaveCount(0);
  await page.mouse.up();
  await expect(ghost(page)).toHaveCount(0);
  await expect(page.locator(".pb-drop")).toHaveCount(0);
  await expect.poll(async () => flat(await source(page))).toMatch(/<\/card-project><p>Text<\/p><card-project>/);
  await expect(frame(page).locator("#work .cards > card-project + p + card-project")).toHaveCount(1);
  await expect(page.locator(".pb-flash-label")).toBeHidden();
  // The new block is selected.
  await expect(page.getByRole("toolbar", { name: "Edit bar", exact: true }).locator(".edit-bar__kind")).toHaveText("Paragraph");
  expect(await page.evaluate(async () => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "index.html"))).toBe(true);
  await expect.poll(() => source(page)).toBe(original);
});

test("a rail drop while typing keeps the text, ends typing, and takes two undo steps", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const original = await source(page);
  const lead = frame(page).locator(".hero p.lead");
  const originalText = await lead.textContent();
  // Measure the drop before typing so no focus change commits the text first.
  const to = await betweenCards(page);
  await lead.dblclick();
  await expect(lead).toHaveAttribute("contenteditable", /.+/);
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" typed");
  await dragFromRail(page, "Paragraph", to);
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Div (grid) › after Card project");
  await page.mouse.up();
  await expect.poll(async () => flat(await source(page))).toMatch(/<\/card-project><p>Text<\/p><card-project>/);
  await expect(lead).toHaveText(`${originalText} typed`);
  await expect(frame(page).locator("[contenteditable]")).toHaveCount(0);
  expect(await page.evaluate(async () => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "index.html"))).toBe(true);
  await expect.poll(() => source(page)).toBe(original!.replace(`${originalText}</p>`, `${originalText} typed</p>`));
  expect(await page.evaluate(async () => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "index.html"))).toBe(true);
  await expect.poll(() => source(page)).toBe(original);
});

test("Alt steps the target up a level and Escape cancels the drag", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const original = await source(page);
  await dragFromRail(page, "Heading", await betweenCards(page));
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Div (grid) › after Card project");
  await page.keyboard.down("Alt");
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Section › after Heading");
  await expect(page.locator(".pb-drop__line:not(.pb-drop__line--v)")).toBeVisible();
  await page.keyboard.up("Alt");
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Div (grid) › after Card project");
  // Tab steps up too, Shift+Tab back.
  await page.keyboard.press("Tab");
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Section › after Heading");
  await page.keyboard.press("Shift+Tab");
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Div (grid) › after Card project");
  await page.keyboard.press("Escape");
  await expect(ghost(page)).toHaveCount(0);
  await expect(page.locator(".pb-drop")).toHaveCount(0);
  await expect(page.locator("#status")).toHaveText("Heading was not added");
  await page.mouse.up();
  expect(await source(page)).toBe(original);
  await expect(page.locator("#status")).toHaveText("Heading was not added");
});

test("a card's title slot refuses with its reason; a release there adds nothing", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const original = await source(page);
  await dragFromRail(page, "Paragraph", await pointIn(page, "#work card-project h3[slot=title]"));
  await expect(where(page)).toHaveText(/^The “title” slot is filled by editing its text/);
  await expect(ghost(page)).toHaveClass(/is-refused/);
  await expect(page.locator(".pb-drop__refused")).toBeVisible();
  await page.mouse.up();
  await expect(ghost(page)).toHaveCount(0);
  // The reason stays on screen by the pointer after the ghost goes, and in #status.
  await expect(page.locator("#status")).toHaveText(/^The “title” slot is filled by editing its text/);
  await expect(page.locator(".refusal-note")).toHaveText(/^The “title” slot is filled by editing its text/);
  expect(await source(page)).toBe(original);
});

test("an empty Div shows its drop area, and a Section snaps between page bands", async ({ page, baseURL }) => {
  await open(page, baseURL);
  // An empty Div after the services list, from the rail.
  await frame(page).locator("#services ul").click();
  await rail(page).getByRole("button", { name: "Div", exact: true }).click();
  await expect(frame(page).locator("#services > div.flow:empty")).toBeVisible();
  await dragFromRail(page, "Image", await pointIn(page, "#services > div.flow"));
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Div (stack) › empty");
  await expect(page.locator(".pb-drop__area")).toHaveText("Drop into the empty Div (stack)");
  await page.mouse.up();
  await expect(frame(page).locator("#services > div.flow > img")).toBeVisible();
  // A Section over a card goes between bands: after #work when below its middle.
  await dragFromRail(page, "Section", await pointIn(page, "#work .cards card-project", 0.5, 0.9));
  await expect(ghost(page)).toHaveAttribute("data-where", /^Between page bands › /);
  await page.mouse.up();
  await expect.poll(async () => flat(await source(page))).toMatch(/<\/section><section class="flow"><\/section><section class="flow" id="services">/);
});

test("a Paragraph dragged into a section component's items slot lands among its cards, one undo step", async ({ page, baseURL }) => {
  // Recent work as a section component whose unnamed slot holds the cards.
  await page.goto(`${baseURL}/#repo=540&branch=main&file=index.html`);
  await expect(frame(page).locator("#work .cards card-project").first()).toBeVisible({ timeout: 30_000 });
  const edit = (path: string, content: string) => page.request.post(`${baseURL}/__demo/external-edit`, { data: { repo: "native-cards", path, content } });
  await edit("components/section-work/section-work.html", '<section class="flow">\n  <slot name="title"><h2>Recent work</h2></slot>\n  <div class="cards"><slot><card-project></card-project></slot></div>\n</section>\n');
  await edit("components/section-work/section-work.css", ":host { display: block; }\n.cards { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }\n");
  const home = (await source(page))!;
  const made = home.replace('<section class="flow" id="work">', '<section-work id="work">').replace('<h2>Recent work</h2>\n      <div class="cards">', '<h2 slot="title">Recent work</h2>')
    .replace(/<\/card-project>\n      <\/div>\n    <\/section>/, "</card-project>\n    </section-work>");
  expect(made).toContain('</card-project>\n    </section-work>');
  await edit("index.html", made);
  await page.reload();
  await expect(frame(page).locator("section-work card-project").nth(1)).toBeVisible({ timeout: 30_000 });
  await expect(rail(page)).toBeVisible();
  await editorMounted(page);
  await expect.poll(() => frame(page).locator("section-work card-project").nth(1).evaluate(el => el.getBoundingClientRect().top - el.previousElementSibling!.getBoundingClientRect().top)).toBe(0);
  const original = await source(page);
  await dragFromRail(page, "Paragraph", await pointIn(page, "section-work card-project:nth-of-type(2)", 0, 0.3, -6));
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Section work › items › after Card project");
  await expect(page.locator(".pb-drop__line--v")).toBeVisible();
  await page.mouse.up();
  await expect.poll(async () => flat(await source(page))).toMatch(/<\/card-project><p>Text<\/p><card-project>/);
  await expect(frame(page).locator("section-work > card-project + p:not([slot]):has(+ card-project)")).toHaveText("Text");
  expect(await page.evaluate(async () => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "index.html"))).toBe(true);
  await expect.poll(() => source(page)).toBe(original);
});

test("over a card's padding a Paragraph goes in its empty items slot, a line where the slot sits", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await frame(page).locator("#work card-project").first().evaluate(el => el.scrollIntoView({ block: "center" }));
  await dragFromRail(page, "Paragraph", await pointIn(page, "#work card-project", 0.5, 1, 0, -14));
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Card project › items › empty");
  // Between the card's text and its link, not an area over the card.
  await expect(page.locator(".pb-drop__area")).toHaveCount(0);
  await expect.poll(async () => {
    const line = await page.locator(".pb-drop__line:not(.pb-drop__line--v)").boundingBox();
    if (!line) return false;
    const frameBox = (await page.locator(".native-preview-frame").boundingBox())!;
    const [body, link] = await Promise.all(["p[slot=body]", "a[slot=link]"].map(s => frame(page).locator(`#work card-project ${s}`).first().evaluate(el => el.getBoundingClientRect().toJSON())));
    return line.y - frameBox.y > body.bottom - 1 && line.y - frameBox.y < link.top;
  }).toBe(true);
  await page.mouse.up();
  await expect.poll(async () => flat(await source(page))).toMatch(/Read about Fern &amp; Kettle<\/a><p>Text<\/p><\/card-project>/);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the drag label matches a Structure row in ${colorScheme}`, async ({ page, baseURL }) => {
    await page.emulateMedia({ colorScheme });
    await open(page, baseURL);
    const row = page.locator(".page-structure__row").filter({
      has: page.locator(".page-structure__kind").filter({ hasText: /^Section$/ }),
    }).first();
    await expect(row).toBeVisible();
    const rect = (await row.boundingBox())!;
    // Off the canvas still shows only the block, beside the row for comparison.
    await dragFromRail(page, "Section", { x: rect.x + rect.width - 12, y: rect.y + rect.height / 2 });
    await expect(ghost(page)).toBeVisible();
    await expect(where(page)).toBeHidden();
    await expect(ghost(page)).toHaveText("Section");
    // The row's shape, its kind's type and colour.
    const look = (box: Locator, text: Locator) => Promise.all([
      box.evaluate(el => { const style = getComputedStyle(el); return { radius: style.borderRadius, height: style.minHeight }; }),
      text.evaluate(el => { const style = getComputedStyle(el); return { color: style.color, font: style.fontSize, weight: style.fontWeight }; }),
    ]);
    expect(await look(ghost(page), ghost(page).locator(".pb-drag-ghost__name"))).toEqual(await look(row, row.locator(".page-structure__kind")));
    expect(await ghost(page).evaluate(el => getComputedStyle(el).backgroundColor)).toBe(
      await page.locator(".sidebar").evaluate(el => getComputedStyle(el).backgroundColor),
    );
    expect(await ghost(page).locator("svg").innerHTML()).toBe(await row.locator("svg.element-icon").innerHTML());
    await page.keyboard.press("Escape");
    await page.mouse.up();
  });
}
