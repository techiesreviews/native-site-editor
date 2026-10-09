import { expect, test, type Locator, type Page } from "@playwright/test";
import { editorMounted } from "./drafts";

// Page Structure in a block's drag (ticket 12 §6–8): over the canvas the
// tree unfolds to the target and shows the same spot as an indented line;
// dragged in the tree (a row, or a block from the rail) the gap under the
// pointer is the place and its x the depth, as in file trees; a Section
// snaps between page bands. Folded containers spring open during a hold or
// open at once when targeted, then fold back unless opened by the user.
// Default fixture group: native-cards (#repo=540),
// <main> › hero, #work (h2, Div (grid) › two cards), #services (h2, ul).
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const rail = (page: Page) => page.getByRole("navigation", { name: "Blocks" });
const ghost = (page: Page) => page.locator(".pb-drag-ghost");
const where = (page: Page) => page.locator(".pb-drag-ghost__where");
const line = (page: Page) => page.locator(".page-structure__drop");
const row = (page: Page, node: string) => page.locator(`.page-structure__tree [role='treeitem'][data-node='${node}']`);
const source = async (page: Page) => (await editorMounted(page), page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")));
const flat = (html: string | undefined) => (html ?? "").replace(/\s+(?=<)/g, "");
const undo = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "index.html"));
const bands = (page: Page) => frame(page).locator("main > section").evaluateAll((els) => els.map((el) => el.id || el.className));
// The line's depth (its level less one).
const depth = (page: Page) => line(page).evaluate((el) => (el as HTMLElement).style.getPropertyValue("--depth"));
const lineY = async (page: Page) => (await line(page).boundingBox())!.y;

// Tall enough that the whole page and the tree show: points measured before a press stay put.
test.use({ viewport: { width: 1400, height: 1500 } });

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=540&branch=main&file=index.html`);
  await expect(frame(page).locator("#work .cards card-project").first()).toBeVisible({ timeout: 30_000 });
  await editorMounted(page);
  await expect(row(page, "1.1")).toBeVisible();
  await expect.poll(() => frame(page).locator("#work .cards").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBeGreaterThan(1);
}

async function unfold(page: Page, node: string) {
  if ((await row(page, node).getAttribute("aria-expanded")) === "false") await row(page, node).locator(".page-structure__toggle").click();
  await expect(row(page, node)).toHaveAttribute("aria-expanded", "true");
}

async function box(locator: Locator) {
  const b = (await locator.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, top: b.y, bottom: b.y + b.height };
}

/** The x in the tree that asks for `level` (its line starts 10 px in, 14 px per level). */
async function levelX(page: Page, level: number) {
  return (await page.locator(".page-structure__tree").boundingBox())!.x + 10 + (level - 1) * 14 + 3;
}

/** A point in the frame (an element's box, `fx`/`fy` across it, plus `dx` px), in page coordinates. */
async function pointIn(page: Page, selector: string, fx = 0.5, fy = 0.5, dx = 0) {
  const frameBox = (await page.locator(".native-preview-frame").boundingBox())!;
  const r = await frame(page).locator(selector).first().evaluate((el) => { const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, width: b.width, height: b.height }; });
  return { x: frameBox.x + r.left + r.width * fx + dx, y: frameBox.y + r.top + r.height * fy };
}

/** Presses at `from` and moves past the 7 px threshold to `to`. */
async function pressAndMove(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 8) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + 10, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps });
  await expect(ghost(page)).toBeVisible();
}

test("a canvas drag unfolds Structure to its target and shows the spot as an indented line", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const original = await source(page);
  await expect(row(page, "1.1")).toHaveAttribute("aria-expanded", "false");
  const from = await pointIn(page, "#services h2", 0.2);
  const between = await pointIn(page, "#work .cards card-project:nth-child(2)", 0, 0.3, -3);
  await pressAndMove(page, from, between);
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Div (grid) › after Card project");
  // The label names the block only; the line is the place.
  await expect(where(page)).toBeHidden();
  // Down to the grid, one level in, before the second card's row; the grid's row tinted.
  await expect(row(page, "1.1")).toHaveAttribute("aria-expanded", "true");
  await expect(row(page, "1.1.1")).toHaveAttribute("aria-expanded", "true");
  await expect(line(page)).toBeVisible();
  expect(await depth(page)).toBe("3");
  expect(Math.abs(await lineY(page) - (await box(row(page, "1.1.1.1"))).top)).toBeLessThan(4);
  await expect(row(page, "1.1.1")).toHaveClass(/is-drop-target/);
  await expect(page.locator(".page-structure__tree .is-drop-target")).toHaveCount(1);
  // Escape: what the drag unfolded folds back.
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(line(page)).toBeHidden();
  await expect(row(page, "1.1")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".page-structure__tree .is-drop-target")).toHaveCount(0);
  expect(await source(page)).toBe(original);

  // Dropped: the moved block's row shows, selected.
  await pressAndMove(page, from, between);
  await expect(line(page)).toBeVisible();
  await page.mouse.up();
  await expect.poll(async () => flat(await source(page))).toMatch(/<\/card-project><h2>What we do<\/h2><card-project>/);
  await expect(row(page, "1.1.1.1")).toHaveAttribute("aria-selected", "true");
  await expect(line(page)).toBeHidden();
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toBe(original);
});

test("a row dragged in Structure takes its depth from the pointer's x", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const original = await source(page);
  await unfold(page, "1.1");
  await unfold(page, "1.2");
  await unfold(page, "1.1.1");
  await unfold(page, "1.1.1.0");
  await unfold(page, "1.1.1.1");
  const heading = await box(row(page, "1.2.0"));
  await pressAndMove(page, { x: heading.x, y: heading.y }, { x: heading.x, y: heading.y - 12 });
  await expect(page.locator(".pb-drag-ghost__name")).toHaveText("Heading");
  await expect(row(page, "1.2.0")).toHaveClass(/is-drag-source/);
  // After the grid's open subtree, the pointer stays in the gap while x changes depth.
  const y = (await box(row(page, "1.2"))).top - 1;
  await page.mouse.move(await levelX(page, 4), y, { steps: 4 });
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Div (grid) › after Card project");
  expect(await depth(page)).toBe("3");
  await expect(row(page, "1.1.1")).toHaveClass(/is-drop-target/);
  await page.mouse.move(await levelX(page, 3), y, { steps: 4 });
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Section › after Div (grid)");
  expect(await depth(page)).toBe("2");
  await expect(row(page, "1.1")).toHaveClass(/is-drop-target/);
  await expect(row(page, "1.1.1")).not.toHaveClass(/is-drop-target/);
  // Further left, <main> would refuse a Heading: it stays at the nearest depth that takes it.
  await page.mouse.move(await levelX(page, 1), y, { steps: 4 });
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Section › after Div (grid)");
  await page.mouse.up();
  await expect.poll(async () => flat(await source(page))).toMatch(/<\/div><h2>What we do<\/h2><\/section>/);
  await expect(frame(page).locator("#services > h2")).toHaveCount(0);
  await expect(page.locator("#status")).toHaveText("Heading moved. Into Section › after Div (grid)");
  await expect(row(page, "1.1.2")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".page-structure__tree .is-drag-source, .page-structure__tree .is-drop-target")).toHaveCount(0);
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toBe(original);
});

test("a Section dragged in Structure snaps between page bands", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const original = await source(page);
  await unfold(page, "1.1");
  const hero = await box(row(page, "1.0"));
  await pressAndMove(page, { x: hero.x, y: hero.y }, { x: hero.x, y: hero.y + 12 });
  await expect(page.locator(".pb-drag-ghost__name")).toHaveText("Section");
  // Over the header: the first gap, which is where it is.
  await page.mouse.move(hero.x, (await box(row(page, "0"))).y, { steps: 4 });
  await expect(ghost(page)).toHaveAttribute("data-where", "Stays where it is");
  await expect(line(page)).toBeHidden();
  // Over the footer: after the last band, whatever the x.
  await page.mouse.move(await levelX(page, 5), (await box(row(page, "2"))).y, { steps: 6 });
  await expect(line(page)).toBeVisible();
  expect(await depth(page)).toBe("1");
  expect(Math.abs(await lineY(page) - (await box(row(page, "1.2"))).bottom)).toBeLessThan(4);
  await expect(row(page, "1")).toHaveClass(/is-drop-target/);
  // Over a nested row deep in #work's lower half, far right: after #work, at the bands' depth.
  await page.mouse.move(await levelX(page, 6), (await box(row(page, "1.1.1"))).y, { steps: 6 });
  await expect(ghost(page)).toHaveAttribute("data-where", "Between page bands › after Section");
  expect(await depth(page)).toBe("1");
  expect(Math.abs(await lineY(page) - (await box(row(page, "1.2"))).top)).toBeLessThan(4);
  await page.mouse.up();
  await expect.poll(() => bands(page)).toEqual(["work", "hero flow", "services"]);
  await expect(page.locator("#status")).toHaveText("Section moved. Between page bands › after Section");
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toBe(original);
});

test("a block from the rail drops in Structure at the depth the pointer's x picks", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const original = await source(page);
  await unfold(page, "1.1");
  await unfold(page, "1.1.1");
  const button = await box(rail(page).getByRole("button", { name: "Paragraph", exact: true }));
  const y = (await box(row(page, "1.2"))).top - 1;
  await pressAndMove(page, button, { x: await levelX(page, 4), y });
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Div (grid) › after Card project");
  expect(await depth(page)).toBe("3");
  await page.mouse.up();
  await expect.poll(async () => flat(await source(page))).toMatch(/<\/card-project><p>Text<\/p><\/div>/);
  await expect(page.getByRole("toolbar", { name: "Edit bar", exact: true }).locator(".edit-bar__kind")).toHaveText("Paragraph");
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toBe(original);
});

test("a card's row in a section component's items slot drags below the other card, one undo step", async ({ page, baseURL }) => {
  await open(page, baseURL);
  // Recent work made a section component: its cards fill the unnamed (items) slot.
  const edit = async (path: string, content: string) => {
    const response = await page.request.post(`${baseURL}/__demo/external-edit`, { data: { repo: "native-cards", path, content } });
    expect(response.ok()).toBe(true);
  };
  await edit("components/section-work/section-work.html", '<section class="flow">\n  <slot name="title"><h2>Recent work</h2></slot>\n  <div class="cards"><slot><card-project></card-project></slot></div>\n</section>\n');
  await edit("components/section-work/section-work.css", ":host { display: block; }\n.cards { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }\n");
  const made = (await source(page))!.replace('<section class="flow" id="work">', '<section-work id="work">').replace('<h2>Recent work</h2>\n      <div class="cards">', '<h2 slot="title">Recent work</h2>')
    .replace(/<\/card-project>\n      <\/div>\n    <\/section>/, "</card-project>\n    </section-work>");
  expect(made).toContain("</card-project>\n    </section-work>");
  await edit("index.html", made);
  await page.reload();
  const titles = frame(page).locator('section-work > card-project h3[slot="title"]');
  await expect(titles).toHaveText(["Fern & Kettle", "Harbour Lane Pottery"]);
  await editorMounted(page);
  await unfold(page, "1.1");
  const original = await source(page);
  // The title fills a named slot: its row stays sealed.
  await expect(row(page, "1.1.0")).toBeVisible();
  const title = await box(row(page, "1.1.0"));
  await page.mouse.move(title.x, title.y);
  await page.mouse.down();
  await page.mouse.move(title.x, title.y + 20, { steps: 4 });
  await expect(ghost(page)).toBeHidden();
  await page.mouse.up();
  // The first card's row, to the gap below the second card at its own depth (level 3, the instance's items).
  const first = await box(row(page, "1.1.1"));
  await pressAndMove(page, { x: first.x, y: first.y }, { x: first.x, y: first.y + 12 });
  await expect(page.locator(".pb-drag-ghost__name")).toHaveText("Card project");
  await expect(row(page, "1.1.1")).toHaveClass(/is-drag-source/);
  // x at level 3 first: a deeper x over the folded second card would open it (slice 38);
  // then the gap under that card, which no held row springs open.
  await page.mouse.move(await levelX(page, 3), first.y + 12, { steps: 2 });
  await page.mouse.move(await levelX(page, 3), (await box(row(page, "1.1.2"))).bottom + 1, { steps: 4 });
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Section work › items › after Card project");
  await expect(row(page, "1.1.2")).toHaveAttribute("aria-expanded", "false");
  await page.mouse.up();
  await expect(titles).toHaveText(["Harbour Lane Pottery", "Fern & Kettle"]);
  await expect.poll(async () => flat(await source(page))).toMatch(/Harbour Lane Pottery<\/h3>.*Fern &amp; Kettle<\/h3>.*<\/section-work>/);
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toBe(original);
});

test("a held rail Paragraph springs a folded Section open and a drop elsewhere folds it back", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const original = await source(page);
  const hero = row(page, "1.0");
  await expect(hero).toHaveAttribute("aria-expanded", "false");
  const button = await box(rail(page).getByRole("button", { name: "Paragraph", exact: true }));
  // The upper half picks before the Section; the row itself waits for the hold.
  await pressAndMove(page, button, { x: await levelX(page, 2), y: (await box(hero)).top + 3 }, 1);
  await expect(hero).toHaveAttribute("aria-expanded", "true");
  await expect(hero).not.toHaveClass(/is-spring/);
  // Drop in another Section, so the spring-opened branch closes at drag end.
  await page.mouse.move(await levelX(page, 3), (await box(row(page, "1.2"))).bottom - 3);
  await expect(row(page, "1.2")).toHaveAttribute("aria-expanded", "true");
  await expect(ghost(page)).toHaveAttribute("data-where", /^Into Section/);
  await page.mouse.up();
  await expect.poll(async () => flat(await source(page))).toMatch(/<p>Text<\/p>/);
  await expect(hero).toHaveAttribute("aria-expanded", "false");
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toBe(original);
});

test("fold-back affects only drag-opened rows below the pointer; user-opened rows survive a drop", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const original = await source(page);
  await unfold(page, "1.1");
  const button = await box(rail(page).getByRole("button", { name: "Paragraph", exact: true }));
  const services = row(page, "1.2");
  await expect(services).toHaveAttribute("aria-expanded", "false");
  await pressAndMove(page, button, { x: await levelX(page, 2), y: (await box(services)).top + 3 }, 1);
  await expect(services).toHaveAttribute("aria-expanded", "true");
  // Move above the drag-opened Section: it closes without shifting this row.
  await page.mouse.move(await levelX(page, 3), (await box(row(page, "1.1.0"))).bottom - 3);
  await expect(services).toHaveAttribute("aria-expanded", "false");
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Section › after Heading");
  await page.mouse.up();
  await expect.poll(async () => flat(await source(page))).toMatch(/<h2>Recent work<\/h2><p>Text<\/p>/);
  await expect(row(page, "1.1")).toHaveAttribute("aria-expanded", "true");
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toBe(original);
});

test("x asking for inside a folded Div opens its row immediately, including under reduced motion", async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, baseURL);
  const original = await source(page);
  await unfold(page, "1.1");
  const div = row(page, "1.1.1");
  await expect(div).toHaveAttribute("aria-expanded", "false");
  const button = await box(rail(page).getByRole("button", { name: "Paragraph", exact: true }));
  await pressAndMove(page, button, { x: await levelX(page, 4), y: (await box(div)).bottom - 3 });
  await expect(div).toHaveAttribute("aria-expanded", "true");
  await expect(div).not.toHaveClass(/is-spring/);
  await expect(row(page, "1.1.1.0")).toBeVisible();
  await expect(div).toHaveClass(/is-drop-target/);
  await expect(line(page)).toBeVisible();
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Div (grid) › before Card project");
  expect(await depth(page)).toBe("3");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(div).toHaveAttribute("aria-expanded", "false");
  await expect(row(page, "1.1")).toHaveAttribute("aria-expanded", "true");
  expect(await source(page)).toBe(original);
});
