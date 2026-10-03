import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

// Components as first-class page builder objects (src/page-builder/components.ts,
// docs/page-builder/components.md): the component accent on instances, the
// properties panel that edits an instance's slots and attributes as page
// source, Edit component with its banner and Used on, Detach and Make
// component. The fixture's index page has three <project-card>s (title and
// body filled; an optional link slot and an unnamed slot with no fallback).
const indexPath = "index.html";
const cardPath = "components/project-card/project-card.html";
const nativeHash = (file = indexPath) => `#repo=501&branch=main&file=${encodeURIComponent(file)}`;

async function open(page: Page, baseURL: string | undefined, file = indexPath) {
  await page.goto(`${baseURL}/${nativeHash(file)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", file, { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").locator("main")).toBeVisible({ timeout: 30_000 });
}

test.beforeEach(async ({ page, baseURL }) => {
  await open(page, baseURL);
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
});

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const tree = (page: Page) => page.getByRole("tree", { name: "Page structure" });
const row = (page: Page, name: string | RegExp) => tree(page).getByRole("treeitem", { name, exact: typeof name === "string" });
const panel = (page: Page) => page.getByRole("region", { name: "Component properties" });
const status = (page: Page) => page.locator("#status");
const select = (page: Page, selector: string) =>
  frame(page).locator(selector).first().evaluate((el) => (el as HTMLElement).click());

async function editorText(page: Page) {
  const textbox = page.locator(`#content [role="textbox"]`).first();
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+C");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  await page.keyboard.press("ArrowRight");
  return text;
}
async function undo(page: Page) {
  await page.locator("#content [role='textbox']").first().focus();
  await page.keyboard.press("ControlOrMeta+Z");
}
// The editor's component accent, as the frame paints it.
const componentColor = (page: Page) => page.evaluate(() => {
  const probe = document.createElement("span");
  probe.style.color = "var(--component)";
  document.body.append(probe);
  const canvas = document.createElement("canvas").getContext("2d")!;
  canvas.fillStyle = getComputedStyle(probe).color;
  canvas.fillRect(0, 0, 1, 1);
  probe.remove();
  const [r, g, b] = canvas.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
});
const box = (page: Page, name: string) => frame(page).locator(`[data-native-selection-box="${name}"]`).first();

async function selectFirstCard(page: Page) {
  await row(page, "Section").locator(".page-structure__toggle").click();
  await row(page, "Project card Reusable cards").click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Project card");
}

test("an instance wears the component accent in the bar, the page structure and the canvas", async ({ page }) => {
  await selectFirstCard(page);
  // The structure row: the component mark, the name unchanged.
  await expect(row(page, "Project card Reusable cards")).toHaveClass(/page-structure__row--component/);
  await expect(row(page, "Project card Reusable cards").locator("svg.component-mark")).toHaveCount(1);
  // What the page slots in names its slot, outside the row's own name.
  await row(page, "Project card Reusable cards").locator(".page-structure__toggle").click();
  await expect(row(page, "Text Reusable cards")).toHaveAttribute("data-slot", "title");
  await expect(row(page, /^Paragraph This card/)).toHaveAttribute("data-slot", "body");
  // The bar's name: the mark and the accent, the tag in its tooltip.
  const kind = bar(page).locator(".edit-bar__kind");
  await expect(kind).toHaveClass(/edit-bar__kind--component/);
  await expect(kind).toHaveAttribute("title", "<project-card>");
  await expect(bar(page).getByRole("button", { name: "Edit Project card component", exact: true })).toBeVisible();
  await expect(bar(page).getByRole("button", { name: "Edit component", exact: true })).toHaveCount(0);
  const pencil = bar(page).getByRole("button", { name: "Edit Project card component", exact: true });
  await page.mouse.move(0, 0);
  await expect(pencil).toHaveCSS("opacity", "0");
  const bounds = await bar(page).boundingBox();
  await kind.hover();
  await expect(pencil).toHaveCSS("opacity", "0.65");
  expect(await bar(page).boundingBox()).toEqual(bounds);
  await pencil.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await expect(pencil).toBeFocused();
  await expect(pencil).toHaveCSS("opacity", "1");
  // The canvas: the selection box in the component accent.
  const accent = await componentColor(page);
  await expect.poll(() => box(page, "selected").evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(accent);

  // The page's own text in the instance: a chip back to the instance, and the instance's outline dashed around it.
  await select(page, "project-card span[slot='title']");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Text");
  const chip = bar(page).getByRole("button", { name: "In the title slot of Project card: select the instance" });
  await expect(chip).toBeVisible();
  await expect(box(page, "instance")).toBeVisible();
  await expect(box(page, "instance")).toHaveCSS("border-top-style", "dashed");
  await expect.poll(() => box(page, "selected").evaluate((el) => getComputedStyle(el).borderTopColor)).not.toBe(accent);
  await expect(row(page, "Text Reusable cards")).toHaveAttribute("aria-selected", "true");
  await chip.click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Project card");
  await expect(row(page, "Project card Reusable cards")).toHaveAttribute("aria-selected", "true");
  await expect(box(page, "instance")).toBeHidden();

  // Inside a template: the chip goes back to the instance on the page.
  await select(page, "project-card:nth-of-type(2)");
  await frame(page).locator("project-card").nth(1).locator("card-note").evaluate((el) => (el as HTMLElement).click());
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", cardPath);
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Card note");
  await expect(bar(page).getByRole("button", { name: "Select this Project card instance" })).toBeVisible();
  await bar(page).getByRole("button", { name: "Select this Project card instance" }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Project card");
  await expect(row(page, "Project card Shared chrome")).toHaveAttribute("aria-selected", "true");
});

test("the properties panel edits an instance's slots and attributes as page source", async ({ page }) => {
  await selectFirstCard(page);
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).locator(".component-panel__name")).toHaveText("Project card");
  await expect(panel(page)).toContainText("One of 3 instances on 1 page");
  const title = panel(page).getByRole("textbox", { name: "Title", exact: true });
  await expect(title).toHaveValue("Reusable cards");
  await expect(panel(page).getByRole("textbox", { name: "Body", exact: true })).toHaveValue(/^This card and the next one share a single template/);

  // Typing writes the page's own slotted text, one undo step until the field is left.
  await title.fill("Reusable card sets");
  await expect(frame(page).locator("project-card").first().locator("span[slot='title']")).toHaveText("Reusable card sets");
  await title.press("Enter");
  expect(await editorText(page)).toContain(`<span slot="title">Reusable card sets</span>`);
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Project card");

  // An optional part: the link paragraph shows only when the page gives it a link.
  const link = panel(page).getByRole("switch", { name: "Show link" });
  await expect(link).toHaveAttribute("aria-checked", "false");
  await link.click();
  await expect(link).toHaveAttribute("aria-checked", "true");
  await expect(frame(page).locator("project-card").first().locator("a[slot='link']")).toHaveText("Link");
  // Switched on, the slot's address is ready to type in.
  const address = panel(page).locator(".component-slot[data-slot='link']").getByRole("combobox", { name: "Address" });
  await expect(address).toBeFocused();
  await address.fill("/about/");
  await address.press("Enter");
  await panel(page).locator(".component-slot[data-slot='link']").getByRole("textbox", { name: "Text" }).fill("About the studio");
  let source = await editorText(page);
  expect(source).toMatch(/<p slot="body">[^\n]*<\/p>\n {6}<a slot="link" href="\/about\/">About the studio<\/a>\n {4}<\/project-card>/);
  await link.click();
  await expect(link).toHaveAttribute("aria-checked", "false");
  await expect(frame(page).locator("project-card").first().locator("a[slot='link']")).toHaveCount(0);
  expect(await editorText(page)).not.toContain(`slot="link"`);

  // A filled slot resets to the template's fallback.
  await panel(page).getByRole("button", { name: "Reset title to the component's default" }).click();
  await expect(frame(page).locator("project-card").first().locator("span[slot='title']")).toHaveCount(0);
  await expect(panel(page).locator(".component-slot[data-slot='title'] .component-slot__badge")).toHaveText("Default");
  await expect(title).toHaveValue("Untitled project");
  // Typing into the default copies it into the page, in the template's order.
  await title.fill("Back again");
  await title.press("Enter");
  source = await editorText(page);
  expect(source).toMatch(/<project-card title="Reusable cards" data-key="card-1">\n {6}<span slot="title">Back again<\/span>\n {6}<p slot="body">/);

  // Attributes of the instance tag.
  const titleAttribute = panel(page).getByRole("textbox", { name: "title", exact: true });
  await expect(titleAttribute).toHaveValue("Reusable cards");
  await titleAttribute.fill("Cards");
  await titleAttribute.press("Enter");
  await panel(page).getByRole("textbox", { name: "New attribute name" }).fill("data-variant");
  await panel(page).getByRole("textbox", { name: "New attribute value" }).fill("wide");
  await panel(page).getByRole("textbox", { name: "New attribute value" }).press("Enter");
  await expect(panel(page).getByRole("textbox", { name: "data-variant", exact: true })).toHaveValue("wide");
  expect(await editorText(page)).toContain(`<project-card title="Cards" data-key="card-1" data-variant="wide">`);
  await panel(page).getByRole("button", { name: "Remove data-variant" }).click();
  expect(await editorText(page)).toContain(`<project-card title="Cards" data-key="card-1">`);
  // An event handler is refused.
  await panel(page).getByRole("textbox", { name: "New attribute name" }).fill("onclick");
  await panel(page).getByRole("textbox", { name: "New attribute name" }).press("Enter");
  await expect(panel(page).getByRole("alert")).toHaveText("Event handlers do not run in the editor's preview.");

  // Each change is one undo step.
  await undo(page);
  expect(await editorText(page)).toContain(`<project-card title="Cards" data-key="card-1" data-variant="wide">`);
});

test("Edit component opens the template at the part, says what an edit changes, and goes back", async ({ page }) => {
  await select(page, "project-card span[slot='title']");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Text");
  await bar(page).getByRole("button", { name: "Edit Project card component", exact: true }).focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", cardPath);
  const banner = page.locator(".component-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Editing component <project-card> · changes apply to 3 instances on 1 page");
  await expect(page.locator(".code-pane__title--component")).toBeVisible();
  // The template's part showing the slot is selected in the instance worked on, and every instance is outlined.
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Heading");
  await expect(frame(page).locator("[data-native-selection-box='instance']:visible")).toHaveCount(3);
  await expect(status(page)).toHaveText("Editing the Project card component: changes apply to 3 instances on 1 page.");
  // Used on lists the pages, and opens one with the first instance selected.
  await banner.getByRole("button", { name: "Used on" }).click();
  const menu = page.getByRole("menu", { name: "Used on" });
  await expect(menu.getByRole("menuitem")).toHaveText(["Home/ · 3×"]);
  await menu.getByRole("menuitem").first().click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  await expect(banner).toBeHidden();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Project card");
  await expect(row(page, "Project card Reusable cards")).toHaveAttribute("aria-selected", "true");

  // From the instance: the template's root is selected; Done goes back to the instance.
  await row(page, "Project card Fast edits").click();
  await bar(page).getByRole("button", { name: "Edit Project card component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", cardPath);
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Article");
  await banner.getByRole("button", { name: "Done" }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  await expect(row(page, "Project card Fast edits")).toHaveAttribute("aria-selected", "true");
});

test("Used on opens the page instance that shows a nested component", async ({ page, baseURL }) => {
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "components/card-note/card-note.html", content: `<aside><!-- <project-card> --><script>"<project-card>"</script><textarea><project-card></textarea>Note</aside>\n` } });
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "components/card-list/card-list.html", content: `<section><!-- <project-card> --><script>"<project-card>"</script><textarea><project-card></textarea><project-card title="Nested"></project-card></section>\n` } });
  const about = await page.request.get(`${baseURL}/__demo/file?path=about%2Findex.html`);
  const aboutSource = (await about.text()).replace(`<section class="prose" data-key="prose">`, `<!-- <project-card> --><script>"<project-card>"</script><textarea><project-card></textarea><card-note></card-note><card-list></card-list>\n  <section class="prose" data-key="prose">`);
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "about/index.html", content: aboutSource } });
  await open(page, baseURL, cardPath);
  const banner = page.locator(".component-banner");
  await banner.getByRole("button", { name: "Used on" }).click();
  const menu = page.getByRole("menu", { name: "Used on" });
  await expect(menu.getByRole("menuitem", { name: "About/ · 1×" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "About/ · 1×" }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "about/index.html");
  await expect(status(page)).toHaveText("Project card is inside Card list on this page: Card list selected.");
  await expect(row(page, "Card list")).toHaveAttribute("aria-selected", "true");
});

test("Detach replaces an instance with the markup it shows, after showing it", async ({ page }) => {
  await row(page, "Section").locator(".page-structure__toggle").click();
  await row(page, "Project card Shared chrome").click();
  await panel(page).getByRole("button", { name: "Detach instance…" }).click();
  const dialog = page.getByRole("dialog", { name: "Detach this Project card?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("pre")).toContainText(`<h3 class="project-card__title" data-key="card-title">Shared chrome</h3>`);
  await expect(dialog).toContainText("The component's own styles (components/project-card/project-card.css) apply inside the component only");
  await dialog.getByRole("button", { name: "Detach" }).click();
  await expect(dialog).toBeHidden();
  const source = await editorText(page);
  expect(source).toContain(`<article class="project-card" data-key="project-card" title="Shared chrome">
      <h3 class="project-card__title" data-key="card-title">Shared chrome</h3>
      <p class="project-card__body" data-key="card-body">The header and footer are custom elements shared across Home and About.</p>
      <card-note data-key="card-note">Shared across cards</card-note>
    </article>`);
  await expect(frame(page).locator("section.cards > article.project-card h3")).toHaveText("Shared chrome");
  await expect(frame(page).locator("section.cards > project-card")).toHaveCount(2);
  await undo(page);
  await expect(frame(page).locator("section.cards > project-card")).toHaveCount(3);
});

test("Make component turns a section into a component with slots, as one undo step with its files", async ({ page }) => {
  await select(page, "section.hero");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  await bar(page).getByRole("button", { name: "Make component…" }).click();
  const dialog = page.getByRole("dialog", { name: "Make component" });
  const name = dialog.getByRole("textbox", { name: "Component name" });
  await expect(name).toHaveValue("section-hero");
  await expect(dialog.locator(".component-dialog__file-name")).toHaveText([
    "components/section-hero/section-hero.html (new)",
    "components/section-hero/section-hero.css (new)",
    "index.html (replaces the <section>)",
  ]);
  await name.fill("hero");
  await expect(dialog.locator(".create-dialog__result").first()).toHaveText("A component's name has a dash in it, such as section-intro.");
  await name.fill("section-hero");
  await expect(dialog.locator(".create-dialog__result").first()).toContainText("<section-hero> gets 3 slots");
  await dialog.getByRole("button", { name: "Make component" }).click();
  await expect(dialog).toBeHidden();
  await expect(status(page)).toHaveText("Made the component <section-hero>: components/section-hero/section-hero.html");
  const source = await editorText(page);
  expect(source).toContain(`  <section-hero>
    <span slot="title">A native browser preview</span>
    <span slot="lead">Edit plain HTML, CSS, and shared component templates and watch the preview update in place — no build, no iframe reload.</span>
    <img slot="hero-image" class="hero-image" src="/images/placeholder.svg" data-key="hero-image">
  </section-hero>`);
  // The page shows what it showed, now through the component.
  await expect.poll(() => frame(page).locator("section-hero").evaluate((el) => el.querySelector("h1"))).toBeNull();
  await expect.poll(() => frame(page).locator("section-hero").evaluate((el) => el.shadowRoot?.querySelector("h1")?.textContent?.trim())).toBe("A native browser preview");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section hero");
  expect((await storedDraft(page, "components/section-hero/section-hero.html"))?.content).toContain(`<h1 data-key="hero-title"><slot name="title">A native browser preview</slot></h1>`);
  expect((await storedDraft(page, "components/section-hero/section-hero.css"))?.content).toBe(":host {\n  display: block;\n}\n");
  // Undo takes the instance and the new files back; Redo makes them again.
  await page.locator("#editor-toolbar-host").getByRole("button", { name: "Undo" }).click();
  await expect(frame(page).locator("section.hero h1")).toHaveText("A native browser preview");
  await expect.poll(() => storedDraft(page, "components/section-hero/section-hero.html")).toBeUndefined();
  await page.locator("#editor-toolbar-host").getByRole("button", { name: "Redo" }).click();
  await expect.poll(() => frame(page).locator("section-hero").evaluate((el) => el.shadowRoot?.querySelector("h1")?.textContent?.trim())).toBe("A native browser preview");
  await expect.poll(async () => (await storedDraft(page, "components/section-hero/section-hero.css"))?.content).toBe(":host {\n  display: block;\n}\n");
});

test("image and conditional slots: an address, alt text and a part shown only when filled", async ({ page, baseURL }) => {
  // A component with an image slot and a caption shown only when the page gives one, used on About.
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "components/media-card/media-card.html", content: `<figure class="media-card">\n  <slot name="image"><img src="/images/placeholder.svg" alt="Placeholder"></slot>\n  <figcaption data-if="caption"><slot name="caption"></slot></figcaption>\n</figure>\n` } });
  const about = await page.request.get(`${baseURL}/__demo/file?path=about%2Findex.html`);
  const aboutSource = (await about.text()).replace(`<section class="prose" data-key="prose">`, `<media-card></media-card>\n  <section class="prose" data-key="prose">`);
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "about/index.html", content: aboutSource } });
  await open(page, baseURL, "about/index.html");
  await row(page, "Media card").click();
  await expect(panel(page)).toBeVisible();
  const image = panel(page).locator(".component-slot[data-slot='image']");
  await expect(image.locator(".component-slot__badge")).toHaveText("Default");
  await expect(image.getByRole("combobox", { name: "Address" })).toHaveValue("/images/placeholder.svg");
  await image.getByRole("combobox", { name: "Address" }).fill("/images/studio-desk.svg");
  await image.getByRole("combobox", { name: "Address" }).press("Enter");
  await image.getByRole("textbox", { name: "Alt text" }).fill("A desk");
  await image.getByRole("textbox", { name: "Alt text" }).press("Enter");
  expect(await editorText(page)).toContain(`<media-card>\n    <img slot="image" src="/images/studio-desk.svg" alt="A desk">\n  </media-card>`);
  await expect(frame(page).locator("media-card > img")).toHaveAttribute("alt", "A desk");
  // The caption is optional (data-if): off until switched on.
  const caption = panel(page).getByRole("switch", { name: "Show caption" });
  await expect(caption).toHaveAttribute("aria-checked", "false");
  await caption.click();
  await panel(page).getByRole("textbox", { name: "Caption", exact: true }).fill("Where it happens");
  await panel(page).getByRole("textbox", { name: "Caption", exact: true }).press("Enter");
  expect(await editorText(page)).toContain(`<span slot="caption">Where it happens</span>`);
  await expect.poll(() => frame(page).locator("media-card").evaluate((el) => {
    const figcaption = el.shadowRoot?.querySelector("figcaption");
    return figcaption ? getComputedStyle(figcaption).display : "";
  })).not.toBe("none");
});

test("image upload finishes on the instance that started it", async ({ page, baseURL }) => {
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "components/media-card/media-card.html", content: `<figure class="media-card">\n  <slot name="image"><img src="/images/placeholder.svg" alt="Placeholder"></slot>\n</figure>\n` } });
  const about = await page.request.get(`${baseURL}/__demo/file?path=about%2Findex.html`);
  const aboutSource = (await about.text()).replace(`<section class="prose" data-key="prose">`, `<media-card data-key="first"></media-card>\n  <media-card data-key="second"></media-card>\n  <section class="prose" data-key="prose">`);
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "about/index.html", content: aboutSource } });
  await open(page, baseURL, "about/index.html");
  await row(page, "Media card").first().click();
  await pauseUpload(page);
  await panel(page).locator(".component-slot[data-slot='image'] input[type='file']").setInputFiles({ name: "Chosen.PNG", mimeType: "image/png", buffer: Buffer.from("PNGDATA") });
  await expect.poll(() => page.evaluate(() => (window as typeof window & { uploadStarted?: boolean }).uploadStarted)).toBe(true);
  await row(page, "Media card").nth(1).click();
  await page.evaluate(() => (window as typeof window & { releaseUpload?: () => void }).releaseUpload?.());
  await expect.poll(() => editorText(page)).toContain(`<media-card data-key="first">\n    <img slot="image" src="/images/chosen.png" alt="Placeholder">\n  </media-card>\n  <media-card data-key="second"></media-card>`);
});

async function pauseUpload(page: Page) {
  // Uploads stay in IndexedDB until Save; pause reading the file, not /api/blob.
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    const state = window as typeof window & { uploadStarted?: boolean; releaseUpload?: () => void };
    File.prototype.arrayBuffer = async function () {
      state.uploadStarted = true;
      await new Promise<void>((resolve) => { state.releaseUpload = resolve; });
      File.prototype.arrayBuffer = original;
      return original.call(this);
    };
  });
}

for (const action of ["delete", "reorder"] as const) {
  test(`image upload rejects an instance ${action} while reading the file`, async ({ page, baseURL }) => {
    await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "components/media-card/media-card.html", content: `<figure><slot name="image"><img src="/images/placeholder.svg" alt="Placeholder"></slot></figure>\n` } });
    const about = await page.request.get(`${baseURL}/__demo/file?path=about%2Findex.html`);
    const first = `<media-card data-key="first"></media-card>`;
    const second = `<media-card data-key="second"></media-card>`;
    const source = (await about.text()).replace(`<section class="prose" data-key="prose">`, `${first}${second}<section class="prose" data-key="prose">`);
    await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "about/index.html", content: source } });
    await open(page, baseURL, "about/index.html");
    await row(page, "Media card").first().click();
    await pauseUpload(page);
    await panel(page).locator(".component-slot[data-slot='image'] input[type='file']").setInputFiles({ name: "Chosen.PNG", mimeType: "image/png", buffer: Buffer.from("PNGDATA") });
    await expect.poll(() => page.evaluate(() => (window as typeof window & { uploadStarted?: boolean }).uploadStarted)).toBe(true);
    const changed = source.replace(`${first}${second}`, action === "delete" ? second : `${second}${first}`);
    await page.locator(`#content [role="textbox"]`).first().focus();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText(changed);
    await expect(frame(page).locator("media-card")).toHaveCount(action === "delete" ? 1 : 2);
    const beforeUpload = await editorText(page);
    expect(beforeUpload).toContain(action === "delete" ? second : `${second}${first}`);
    await page.evaluate(() => (window as typeof window & { releaseUpload?: () => void }).releaseUpload?.());
    await expect(status(page)).toHaveText("The instance changed while the image uploaded; it was not replaced.");
    expect(await editorText(page)).toBe(beforeUpload);
  });
}

test("browser slot assignment keeps whitespace around an element assigned to another slot", async ({ page }) => {
  const text = await page.evaluate(() => {
    const host = document.createElement("x-slot-probe");
    host.innerHTML = `<b>Hello</b> <span slot="other">Other</span> <i>world</i>`;
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<p><slot></slot></p>`;
    document.body.append(host);
    const text = root.querySelector("slot")!.assignedNodes().map((node) => node.textContent).join("");
    host.remove();
    return text;
  });
  expect(text).toBe("Hello  world");
});

test("Make component refuses a page replacement made while its preview dialog is open", async ({ page, baseURL }) => {
  await page.locator(".repository-menu__trigger").click();
  await page.getByRole("button", { name: "Connect with MCP", exact: true }).click();
  await expect(page.locator(".agent-menu__hint")).toContainText("Paste it into Claude, Codex");
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  const url = /Server: `(\S+)`/.exec(prompt)![1];
  const token = /Authorization: `Bearer (ase_[a-f0-9]{64})`/.exec(prompt)![1];
  expect(url).toBe(`${baseURL}/mcp`);
  const client = new Client({ name: "components-review-agent", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  const call = async (name: string, args: Record<string, unknown>) => {
    const response = await client.callTool({ name, arguments: args });
    expect(response.isError).toBeFalsy();
    return JSON.parse((response.content as { text: string }[])[0].text);
  };
  try {
    await expect(page.getByRole("button", { name: "Disconnect MCP", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    const home = await call("get_page", { page: "/" });
    const hero = /<section class="hero"[^>]*>[\s\S]*?<\/section>/.exec(home.html)![0];
    await select(page, "section.hero");
    await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
    await bar(page).getByRole("button", { name: "Make component…" }).click();
    const dialog = page.getByRole("dialog", { name: "Make component" });
    await expect(dialog).toContainText("A native browser preview");
    const replacement = `<section class="hero" data-key="hero"><h1>Unreviewed replacement</h1></section>`;
    const edited = await call("edit_file", { path: indexPath, expectedHash: home.hash, edits: [{ oldText: hero, newText: replacement }] });
    expect(edited.state).toBe("applied");
    await expect(frame(page).locator("section.hero h1")).toHaveText("Unreviewed replacement");
    await dialog.getByRole("button", { name: "Make component", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(status(page)).toHaveText("The page or repository changed meanwhile; no component was made.");
    expect((await storedDraft(page, indexPath))?.content).toContain(replacement);
    expect(await storedDraft(page, "components/section-hero/section-hero.html")).toBeUndefined();
    expect(await storedDraft(page, "components/section-hero/section-hero.css")).toBeUndefined();
  } finally {
    await client.close();
  }
});


test("replaced component pencils cannot navigate after selection changes", async ({ page }) => {
  await selectFirstCard(page);
  await bar(page).getByRole("button", { name: "Edit Project card component", exact: true }).evaluate((el) => {
    (window as unknown as { oldComponentPencil: HTMLElement }).oldComponentPencil = el as HTMLElement;
  });
  await select(page, "project-card span[slot='title']");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Text");
  await page.evaluate(() => (window as unknown as { oldComponentPencil: HTMLElement }).oldComponentPencil.click());
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Text");
});

test("component name pencil stays exposed on touch devices", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await open(page, baseURL);
    await selectFirstCard(page);
    const pencil = bar(page).getByRole("button", { name: "Edit Project card component", exact: true });
    await expect(pencil).toHaveCSS("opacity", "0.65");
    await pencil.tap();
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", cardPath);
  } finally {
    await context.close();
  }
});
