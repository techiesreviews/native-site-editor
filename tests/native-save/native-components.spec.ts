import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";
import { publishButton } from "./publish";

// Components as first-class page builder objects (src/page-builder/components.ts,
// docs/page-builder/components.md): the component accent on instances, the
// Structure controls that edit an instance's slots and attributes as page
// source, Edit component with its banner and Used on, Detach and Make
// component. The fixture's index page has three <project-card>s (title and
// body filled; an optional link slot and an unnamed slot with no fallback).
const indexPath = "index.html";
const cardPath = "components/project-card/project-card.html";
const nativeHash = (file = indexPath) => `#repo=501&branch=main&file=${encodeURIComponent(file)}`;

async function open(page: Page, baseURL: string | undefined, file = indexPath) {
  await page.goto(`${baseURL}/${nativeHash(file)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", file, { timeout: 30_000 });
  await expect(page.locator("#content [role=textbox]").first()).toBeAttached();
  await expect(page.frameLocator(".native-preview-frame").locator("main")).toBeVisible({ timeout: 30_000 });
}

test.beforeEach(async ({ page, baseURL }) => {
  await open(page, baseURL);
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
});

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const tree = (page: Page) => page.getByRole("tree", { name: "Page structure" });
const row = (page: Page, name: string | RegExp) => tree(page).getByRole("treeitem", {
  name,
  exact: typeof name === "string",
});
const panel = (page: Page) => page.locator("#structure");
const status = (page: Page) => page.locator("#status");
const select = (page: Page, selector: string) =>
  selector === "section.hero"
    ? row(page, "Section A native browser preview").locator(".page-structure__label").click()
    : frame(page).locator(selector).first().click({position:{x:5,y:5}});

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
  await row(page, "Project card Reusable cards").locator(".page-structure__label").click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Project card");
  await expandInstance(page, row(page, "Project card Reusable cards"));
}
async function expandInstance(page: Page, instance: import('@playwright/test').Locator) {
  if (await instance.getAttribute('aria-expanded') === 'false') await instance.locator('.page-structure__toggle').click();
}
const slot = (page: Page, name: string) => panel(page).locator(`.page-structure__slot[data-slot-name="${name}"]:visible`);
async function editSlot(page: Page, name: string) {
  const label = name.charAt(0).toUpperCase() + name.slice(1);
  await tree(page).locator(".page-structure__slot-badge").filter({ hasText: new RegExp(`^${label}$`) }).first().click();
}
async function openSlotDetails(page: Page, name: string) {
  if (!await slot(page, name).count()) await editSlot(page, name);
  const details = slot(page, name).locator('details');
  if (!await details.evaluate(el => (el as HTMLDetailsElement).open)) await details.locator('summary').click();
}
async function uploadImage(page: Page) {
  await openSlotDetails(page, 'image');
  const chooser = page.waitForEvent('filechooser');
  await slot(page, 'image').getByRole('button', {name:'Upload image…',exact:true}).click();
  await (await chooser).setFiles({ name: "Chosen.PNG", mimeType: "image/png", buffer: Buffer.from("PNGDATA") });
}

test("an instance wears the component accent in the bar, the page structure and the canvas", async ({ page }) => {
  await selectFirstCard(page);
  // The structure row: the component mark, the name unchanged.
  await expect(row(page, "Project card Reusable cards")).toHaveClass(/page-structure__row--component/);
  await expect(row(page, "Project card Reusable cards").locator("svg.component-mark")).toHaveCount(1);
  // What the page slots in names its slot, outside the row's own name.
  await expect(tree(page).locator("[data-slot=title]:visible").first()).toHaveAttribute("data-slot", "title");
  await expect(tree(page).locator("[data-slot=title]:visible .page-structure__text").first()).toHaveText("Reusable cards");
  await expect(row(page, /^Paragraph This card/)).toHaveAttribute("data-slot", "body");
  await editSlot(page, "title");
  await expect(slot(page, "title")).toHaveAttribute("data-slot-name", "title");
  await expect(slot(page, "title").getByRole("textbox", {name:"Title: Text",exact:true})).toHaveValue("Reusable cards");
  await editSlot(page, "body");
  await expect(slot(page, "body")).toHaveAttribute("data-slot-name", "body");
  await expect(slot(page, "body").getByRole("textbox", {name:"Body: Text",exact:true})).toHaveValue(/^This card/);
  await row(page, "Project card Reusable cards").locator(".page-structure__label").click();
  // The bar's name: the mark and the accent, the tag in its tooltip.
  const kind = bar(page).locator(".edit-bar__kind");
  await expect(kind).toHaveClass(/edit-bar__kind--component/);
  await expect(kind).toHaveAttribute("title", "<project-card>");
  await expect(bar(page).getByRole("button", { name: "Edit Project card component", exact: true })).toBeVisible();
  await expect(bar(page).getByRole("button", { name: "Edit component", exact: true })).toHaveCount(0);
  const editName = bar(page).getByRole("button", { name: "Edit Project card component", exact: true });
  const overlay = editName.locator(".edit-bar__component-edit");
  await page.mouse.move(0, 0);
  await expect(overlay).toHaveCSS("opacity", "0");
  await expect(editName).toHaveText("Project card");
  const bounds = await editName.boundingBox();
  await editName.hover();
  await expect(overlay).toHaveCSS("opacity", "1");
  expect(await editName.boundingBox()).toEqual(bounds);
  await editName.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await expect(editName).toBeFocused();
  await expect(overlay).toHaveCSS("opacity", "1");
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
  await expect(tree(page).locator("[data-slot=title][aria-selected=true]")).toHaveCount(1);
  await chip.locator(".edit-bar__context-caret").click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Project card");
  await expect(row(page, "Project card Reusable cards")).toHaveAttribute("aria-selected", "true");
  await expect(box(page, "instance")).toBeHidden();

  // Inside a template: the chip goes back to the instance on the page.
  await select(page, "project-card:nth-of-type(2)");
  // Ordinary template parts keep the page instance selected until explicit Edit.
  await frame(page).locator("project-card").nth(1).locator("card-note").click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  await expect(row(page, "Project card Shared chrome")).toHaveAttribute("aria-selected", "true");
  await bar(page).getByRole("button", {name:"Edit Project card component",exact:true}).click();
  await frame(page).locator("project-card").nth(1).locator("card-note").click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", cardPath);
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Card note");
  await expect(bar(page).getByRole("button", { name: "Select this Project card instance" })).toBeVisible();
  await expect(bar(page).getByRole("button", { name: "Edit enclosing Project card component", exact: true })).toHaveCount(0);
  await bar(page).getByRole("button", { name: "Select this Project card instance" }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Project card");
  await expect(row(page, "Project card Shared chrome")).toHaveAttribute("aria-selected", "true");
});

test("Structure edits an instance's slots and attributes as page source", async ({ page }) => {
  await selectFirstCard(page);
  await expect(panel(page)).toBeVisible();
  await expect(row(page, "Project card Reusable cards")).toHaveAttribute("aria-selected", "true");
  await expect(row(page, "Project card Reusable cards").getByRole("button", {name:"Edit component",exact:true})).toBeVisible();
  await expect(frame(page).locator("project-card")).toHaveCount(3);
  await editSlot(page, "title");
  const title = panel(page).getByRole("textbox", { name: "Title: Text", exact: true });
  await expect(title).toHaveValue("Reusable cards");
  await editSlot(page, "body");
  await expect(panel(page).getByRole("textbox", { name: "Body: Text", exact: true })).toHaveValue(/^This card and the next one share a single template/);
  await editSlot(page, "title");

  // Typing writes the page's own slotted text, one undo step until the field is left.
  await title.fill("Reusable card sets");
  await expect(frame(page).locator("project-card").first().locator("span[slot='title']")).toHaveText("Reusable card sets");
  await title.press("Enter");
  expect(await editorText(page)).toContain(`<span slot="title">Reusable card sets</span>`);
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Project card");

  // An optional part: the link paragraph shows only when the page gives it a link.
  const link = panel(page).getByRole("button", { name: "Show Link", exact: true });
  await expect(link).toHaveAttribute("aria-pressed", "false");
  // Row actions fade in on hover, like every Structure row action.
  await link.locator("xpath=ancestor::*[@role='treeitem'][1]").hover();
  await link.click();
  await expect(link).toHaveAttribute("aria-pressed", "true");
  await expect(frame(page).locator("project-card").first().locator("a[slot='link']")).toHaveText("Link");
  // Show immediately focuses the button text field.
  await expect(slot(page, "link").getByRole("textbox", {name:"Link: Button text"})).toBeFocused();
  await openSlotDetails(page, "link");
  const address = slot(page, "link").getByRole("combobox", { name: "Link: Link / URL" });
  await address.fill("/about/");
  await address.press("Enter");
  await slot(page, "link").getByRole("textbox", { name: "Link: Button text" }).fill("About the studio");
  let source = await editorText(page);
  expect(source).toMatch(/<p slot="body">[^\n]*<\/p>\n {6}<a slot="link" href="\/about\/">About the studio<\/a>\n {4}<\/project-card>/);
  await tree(page).locator("[data-slot=link]").first().hover();
  await link.click();
  await expect(link).toHaveAttribute("aria-pressed", "false");
  await expect(frame(page).locator("project-card").first().locator("a[slot='link']")).toHaveCount(0);
  expect(await editorText(page)).not.toContain(`slot="link"`);

  // A filled slot resets to the template's fallback.
  await tree(page).locator("[data-slot=title]").first().hover();
  await tree(page).getByRole("button", { name: "Reset Title to default", exact: true }).click();
  await editSlot(page, "title");
  await expect(frame(page).locator("project-card").first().locator("span[slot='title']")).toHaveCount(0);
  await expect(frame(page).locator("project-card .project-card__title").first()).toHaveText("Untitled project");
  await expect(title).toHaveValue("Untitled project");
  // Typing into the default copies it into the page, in the template's order.
  await title.fill("Back again");
  await title.press("Enter");
  source = await editorText(page);
  expect(source).toMatch(/<project-card title="Reusable cards" data-key="card-1">\n {6}<span slot="title">Back again<\/span>\n {6}<p slot="body">/);

  // Attributes of the instance tag.
  await row(page, "Project card Back again").hover();
  await row(page, "Project card Back again").getByRole("button", { name: "Attributes", exact: true }).click();
  const titleAttribute = panel(page).getByRole("textbox", { name: "Attribute: title", exact: true });
  await expect(titleAttribute).toHaveValue("Reusable cards");
  await titleAttribute.fill("Cards");
  await titleAttribute.press("Enter");
  await panel(page).getByRole("textbox", { name: "New attribute name" }).fill("data-variant");
  await panel(page).getByRole("textbox", { name: "New attribute value" }).fill("wide");
  await panel(page).getByRole("textbox", { name: "New attribute value" }).press("Enter");
  await expect(panel(page).getByRole("textbox", { name: "Attribute: data-variant", exact: true })).toHaveValue("wide");
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

test("Edit component from its root opens the template, says what an edit changes, and goes back", async ({ page }) => {
  await select(page, "project-card span[slot='title']");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Text");
  await expect(tree(page).locator("[data-slot=title][aria-selected=true]")).toHaveCount(1);
  await expect(slot(page, "title").getByRole("button", { name: /^Edit component/ })).toHaveCount(0);
  await expect(bar(page).getByRole("button", { name: "Edit enclosing Project card component", exact: true })).toHaveCount(0);
  await bar(page).getByRole("button", { name: "In the title slot of Project card: select the instance", exact: true }).click();
  await bar(page).getByRole("button", { name: "Edit Project card component", exact: true }).focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", cardPath);
  const banner = page.locator(".component-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Editing component <project-card> · changes apply to 3 instances on 1 page");
  await expect(page.locator(".code-pane__title--component")).toBeVisible();
  // The template root is selected, and every instance is outlined.
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Article");
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
  await row(page, "Project card Shared chrome").locator(".page-structure__label").click();
  await row(page, "Project card Shared chrome").hover();
  await row(page, "Project card Shared chrome").getByRole("button", { name: "Disconnect this instance",exact:true }).click();
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

test("native-first: a plain page section without a saved record offers no Update and never Make component", async ({ page }) => {
  // Native pages stay plain HTML: the edit bar does not convert sections or their children into components.
  await select(page, "section.hero");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  await expect(bar(page).getByRole("button", { name: /Make component/ })).toHaveCount(0);
  const before = await editorText(page);
  // This section was not added from a saved section, so there is nothing to update.
  await expect(bar(page).getByRole("button", { name: /^Update |Save section/ })).toHaveCount(0);
  expect(await editorText(page)).toBe(before);
  expect(await storedDraft(page, ".editor/page-builder.json")).toBeUndefined();
  expect(await storedDraft(page, indexPath)).toBeUndefined();
  expect(await storedDraft(page, "components/section-hero/section-hero.html")).toBeUndefined();
  // A child of the section: neither action.
  await frame(page).locator("section.hero h1").first().click();
  await expect(bar(page).getByRole("button", { name: /Make component|^Update |Save section/ })).toHaveCount(0);
});

test("image and conditional slots: an address, alt text and a part shown only when filled", async ({ page, baseURL }) => {
  // A component with an image slot and a caption shown only when the page gives one, used on About.
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "components/media-card/media-card.html", content: `<figure class="media-card">\n  <slot name="image"><img src="/images/placeholder.svg" alt="Placeholder"></slot>\n  <figcaption data-if="caption"><slot name="caption"></slot></figcaption>\n</figure>\n` } });
  const about = await page.request.get(`${baseURL}/__demo/file?path=about%2Findex.html`);
  const aboutSource = (await about.text()).replace(`<section class="prose" data-key="prose">`, `<media-card></media-card>\n  <section class="prose" data-key="prose">`);
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "about/index.html", content: aboutSource } });
  await open(page, baseURL, "about/index.html");
  await row(page, "Media card").click();
  await expandInstance(page, row(page, "Media card"));
  await expect(panel(page)).toBeVisible();
  const image = slot(page, "image");
  await expect(frame(page).locator("media-card img")).toHaveAttribute("alt", "Placeholder");
  await expect(frame(page).locator("media-card img")).toBeVisible();
  await openSlotDetails(page, "image");
  await expect(image.getByRole("combobox", { name: "Image: Image" })).toHaveValue("/images/placeholder.svg");
  await image.getByRole("combobox", { name: "Image: Image" }).fill("/images/studio-desk.svg");
  await image.getByRole("combobox", { name: "Image: Image" }).press("Enter");
  await image.getByRole("textbox", { name: "Image: Alt text" }).fill("A desk");
  await image.getByRole("textbox", { name: "Image: Alt text" }).press("Enter");
  expect(await editorText(page)).toContain(`<media-card>\n    <img slot="image" src="/images/studio-desk.svg" alt="A desk">\n  </media-card>`);
  await expect(frame(page).locator("media-card > img")).toHaveAttribute("alt", "A desk");
  // The caption is optional (data-if): off until switched on.
  const caption = panel(page).getByRole("button", { name: "Show Caption", exact: true });
  await expect(caption).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => frame(page).locator("media-card figcaption").evaluate((el) => getComputedStyle(el).display)).toBe("none");
  // Row actions fade in on hover, like every Structure row action.
  await caption.locator("xpath=ancestor::*[@role='treeitem'][1]").hover();
  await caption.click();
  await expect(caption).toHaveAttribute("aria-pressed", "true");
  await panel(page).getByRole("textbox", { name: "Caption: Text", exact: true }).fill("Where it happens");
  await panel(page).getByRole("textbox", { name: "Caption: Text", exact: true }).press("Enter");
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
  await expandInstance(page, row(page, "Media card").first());
  await pauseUpload(page);
  await uploadImage(page);
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
    await expandInstance(page, row(page, "Media card").first());
    await pauseUpload(page);
    await uploadImage(page);
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

// A page change made while Update Intro awaits the editor JSON's branch text
// must not let the save land: the JSON is not written and the change stays.
test("Update Intro refuses a page change made while it reads the editor JSON", async ({ page, baseURL }) => {
  const sidecar = ".editor/page-builder.json";
  const addPanel = page.getByRole("dialog", { name: "Add to the page" });
  await select(page, "section.hero");
  if (!(await addPanel.isVisible())) await page.getByRole("complementary", { name: "Page structure" }).getByRole("button", { name: "Add", exact: true }).click();
  const option = addPanel.getByRole("option", { name: /^Intro HTML$/ });
  await option.focus();
  await option.press("Enter");
  await expect(frame(page).locator("section.section-intro h2")).toHaveText("Section heading");
  await expect.poll(async () => (await storedDraft(page, sidecar))?.content ?? "").toContain("section-intro");
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  await page.keyboard.press("Escape");
  await expect.poll(() => storedDraft(page, sidecar)).toBeUndefined();
  const json = await (await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(sidecar)}`)).text();
  expect(json).toContain("section-intro");

  // A real inline edit, so the section differs from its saved record.
  const heading = frame(page).locator("section.section-intro h2");
  await heading.click();
  await expect(heading).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Edited heading");
  await page.keyboard.press("Enter");
  const mounted = () => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"));
  await expect.poll(mounted).toContain("<h2>Edited heading</h2>");
  await frame(page).locator("section.section-intro").click({ position: { x: 5, y: 5 } });
  const save = bar(page).getByRole("button", { name: "Update Intro", exact: true });
  await expect(save).toBeVisible();

  // Press Save, then in the same turn (while it awaits the JSON's branch text)
  // change the page through the editor's public module.
  const foreign = "Foreign heading";
  await save.evaluate(async (button, foreign) => {
    const editor = await import("/src/components/code-editor.ts");
    const source = editor.getMountedSource("index.html")!;
    (button as HTMLElement).click();
    const start = source.indexOf("Edited heading");
    editor.replaceActiveRange({ path: "index.html", start, end: start + "Edited heading".length, expected: "Edited heading", text: foreign });
  }, foreign);
  await expect(page.locator("#notice")).toContainText("The repository or source changed meanwhile. Review the latest files and try again.");
  expect(await mounted()).toContain(foreign);
  expect(await storedDraft(page, sidecar)).toBeUndefined();
  expect((await storedDraft(page, "styles/sections.css"))).toBeUndefined();
  expect((await storedDraft(page, indexPath))?.content).toContain(foreign);
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
  await expect(status(page)).toHaveText("This component action is stale. Select the component again to edit its current template.");
});

test("the complete component name edits with one tap on touch devices", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await open(page, baseURL);
    await selectFirstCard(page);
    const pencil = bar(page).getByRole("button", { name: "Edit Project card component", exact: true });
    await expect(pencil).toHaveText("Project card");
    await expect(pencil.locator(".edit-bar__component-edit")).toHaveCSS("opacity", "0");
    await pencil.tap();
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", cardPath);
  } finally {
    await context.close();
  }
});

// Exercise the real toolbar in a browser with both nested identities and a drag
// adapter. Native section tests below this suite verify source writes and Undo.
test("editable component names keep their drag pixels and disable nested actions during drag", async ({ page }) => {
  await page.evaluate(async () => {
    const modulePath = "/src/components/edit-bar.ts";
    const { createEditBar } = await import(modulePath);
    const pane = document.createElement("div");
    pane.id = "affordance-drag";
    pane.style.cssText = "position:fixed;inset:150px 100px 100px;background:white;z-index:1000";
    document.body.append(pane);
    const output = document.createElement("output");
    output.id = "affordance-actions";
    document.body.append(output);
    const record = (value: string) => { output.textContent += value + " "; };
    const toolbar = createEditBar(pane, pane, {
      start: () => record("start"), move: () => {}, end: () => record("end"), cancel: () => record("cancel"),
    });
    toolbar.show({
      kind: "Project card", draggable: true, controls: [],
      component: { tag: "project-card", onEdit: () => record("direct") },
      context: { label: "Project card", title: "Select enclosing instance", onSelect: () => record("select"), onEdit: () => record("enclosing") },
    }, { top: 100, left: 100, width: 300, height: 100, right: 400, bottom: 200 });
  });
  const toolbar = page.locator("#affordance-drag .edit-bar");
  const direct = toolbar.getByRole("button", { name: "Edit Project card component", exact: true });
  const enclosing = toolbar.getByRole("button", { name: "Edit enclosing Project card component", exact: true });
  await expect(enclosing).toHaveCount(0);
  const chip = toolbar.getByRole("button", { name: "Select enclosing instance", exact: true });
  const output = page.locator("#affordance-actions");
  const caret = chip.locator(".edit-bar__context-caret");
  await expect(direct).toHaveText("Project card");
  await expect(direct).toHaveCSS("cursor", "grab");
  await expect(direct).toHaveCSS("padding", "4px 2px");
  await caret.click();
  await expect(output).toHaveText("select ");
  await direct.click();
  await expect(output).toHaveText("select direct ");
  await expect(toolbar).not.toHaveClass(/is-dragging/);
  // The last actual letter, measured with Range, must remain part of the grip.
  const point = await toolbar.locator(".edit-bar__grip .edit-bar__kind").evaluate((el) => {
    const text = el.lastChild!;
    const range = document.createRange();
    range.setStart(text, text.textContent!.length - 1);
    range.setEnd(text, text.textContent!.length);
    const rect = range.getBoundingClientRect();
    return { x: rect.right - 1, y: rect.top + rect.height / 2 };
  });
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 10, point.y, { steps: 3 });
  await expect(toolbar).toHaveClass(/is-dragging/);
  await expect(output).toHaveText("select direct start ");
  for (const action of [chip]) {
    expect(await action.evaluate((el) => Boolean(el.closest("[inert]")))).toBe(true);
    await action.evaluate((el) => { (el as HTMLElement).focus(); (el as HTMLElement).click(); });
    await expect(action).not.toBeFocused();
  }
  // A second pointer cannot activate an inert action; keyboard cannot move or edit.
  await chip.dispatchEvent("pointerdown", { pointerId: 2, pointerType: "touch", button: 0 });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await expect(output).toHaveText("select direct start ");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(toolbar).not.toHaveClass(/is-dragging/);
  await expect(toolbar.locator("[inert]")).toHaveCount(0);
  await chip.focus();
  await page.keyboard.press("Enter");
  await expect(output).toHaveText("select direct start cancel select ");
  await direct.focus();
  await page.keyboard.press("Enter");
  await expect(output).toHaveText("select direct start cancel select direct ");
});

test("child selections omit template entry while root entry rejects stale or missing templates", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const result = await page.evaluate(async () => {
    const modulePath = "/src/page-builder/components.ts";
    const { createComponentTools } = await import(modulePath);
    const templatePath = "components/project-card/project-card.html";
    const sources: Record<string, string> = {
      "index.html": "<project-card></project-card>",
      [templatePath]: "<article><h2>Heading</h2><p>Body</p></article>",
    };
    let path = "index.html";
    let selection = { path: templatePath, tag: "p", node: [0, 1], text: "Body", reason: "click", selectors: [], host: { tag: "project-card", selector: "project-card", path: "index.html", node: [0] } };
    const announcements: string[] = [];
    const opened: string[] = [];
    const selected: { path: string; node: number[] }[] = [];
    const host = document.createElement("div");
    document.body.append(host);
    const tools = createComponentTools({
      site: () => ({ components: { "project-card": templatePath }, routes: { "/": "index.html" } }), revision: () => "scope", sources: () => sources,
      editor: () => undefined, preview: () => ({ selectNode: (at: { path: string; node: number[] }) => selected.push(at), selectAfterUpdate: () => {} }),
      currentPath: () => path, selection: () => selection,
      openFile: async (file: string) => { opened.push(file); path = file; return true; },
      announce: (message: string) => announcements.push(message), error: () => {}, images: () => [], upload: async () => undefined,
      links: () => [], pageLabel: (file: string) => file, createFiles: async () => ({ error: "Unavailable" }),
      panelHost: host, addStrip: (strip: HTMLElement) => host.append(strip), codeTitle: document.createElement("div"), previewPage: () => "index.html",
    });
    try {
      const childEntry = Boolean(tools.identity(selection).context.onEdit);
      selection = { ...selection, path: "index.html", tag: "project-card", node: [0] };
      const direct = tools.identity(selection).component.onEdit;
      sources[templatePath] += "\n";
      direct();
      const staleOpened = [...opened];
      const fresh = tools.identity(selection).component.onEdit;
      fresh();
      await Promise.resolve();
      const selectedRoot = selected[0];
      delete sources[templatePath];
      const missingDirect = Boolean(tools.identity(selection).component.onEdit);
      return { childEntry, staleOpened, selectedRoot, missingDirect, opened, announcements };

    } finally { tools.destroy(); host.remove(); }
  });
  expect(pageErrors).toEqual([]);
  expect(result.childEntry).toBe(false);
  expect(result.staleOpened).toEqual([]);
  expect(result.selectedRoot).toEqual({ path: cardPath, node: [0] });
  expect(result.missingDirect).toBe(false);
  expect(result.opened).toEqual([cardPath]);
  expect(result.announcements[0]).toBe("This component action is stale. Select the component again to edit its current template.");
  expect(result.announcements[1]).toContain("Editing the Project card component");
});
