import { expect, test, type Page } from "@playwright/test";
import { editorMounted, storedDraft } from "./drafts";

// Default fixture group: native-starter (#repo=501) and native-cards (#repo=540, no images/placeholder.svg).
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const rail = (page: Page) => page.getByRole("navigation", { name: "Blocks" });
const label = (page: Page) => page.locator(".pb-flash-label");
const source = async (page: Page) => (await editorMounted(page), page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")));
const flat = (html: string | undefined) => (html ?? "").replace(/\s+(?=<)/g, "");
async function undo(page: Page) {
  const accepted = await page.evaluate(async () => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "index.html"));
  expect(accepted, await page.locator("#status").textContent() ?? "undo status").toBe(true);
}
async function open(page: Page, baseURL: string | undefined, repo: number, ready: string) {
  await page.goto(`${baseURL}/#repo=${repo}&branch=main&file=index.html`);
  await expect(frame(page).locator(ready)).toBeVisible({ timeout: 30_000 });
  await expect(rail(page)).toBeVisible();
  await editorMounted(page);
}

test("clicking Section, Div, Heading, Paragraph builds a nested section, one undo step each", { tag: "@smoke" }, async ({ page, baseURL }) => {
  await open(page, baseURL, 501, ".hero h1");
  const states = [await source(page)];
  const steps = [
    ["Section", "Between page bands › after “Scroll to verify”"],
    ["Div", "Into Section › empty"],
    ["Heading", "Into Div › empty"],
    ["Paragraph", "Into Div › after Heading"],
  ] as const;
  for (const [name, where] of steps) {
    await rail(page).getByRole("button", { name, exact: true }).click();
    await expect(label(page)).toHaveText(where);
    await expect.poll(async () => (await source(page)) !== states.at(-1)).toBe(true);
    states.push(await source(page));
  }
  expect(flat(states.at(-1))).toContain('<section class="filler" data-key="filler">');
  expect(flat(states.at(-1))).toMatch(/<\/section><section class="flow"><div class="flow"><h3>Heading<\/h3><p>Text<\/p><\/div><\/section><\/main>/);
  await expect(frame(page).locator("main > section.flow > div.flow > h3 + p")).toHaveText("Text");
  // The new Paragraph is selected: Escape on the rail goes up to its Div, then its Section.
  const kind = page.getByRole("toolbar", { name: "Edit bar", exact: true }).locator(".edit-bar__kind");
  await expect(kind).toHaveText("Paragraph");
  await page.keyboard.press("Escape");
  await expect(kind).toHaveText("Block");
  await page.keyboard.press("Escape");
  await expect(kind).toHaveText("Section");
  for (let step = states.length - 2; step >= 0; step--) {
    await undo(page);
    await expect.poll(() => source(page)).toBe(states[step]);
  }
});

test("the first Image drafts images/placeholder.svg in its undo step; a second writes no file", async ({ page, baseURL }) => {
  await open(page, baseURL, 540, ".hero h1");
  const original = await source(page);
  expect(await storedDraft(page, "images/placeholder.svg")).toBeUndefined();
  await frame(page).locator(".hero h1").click();
  const image = rail(page).getByRole("button", { name: "Image", exact: true });
  await image.click();
  await expect(label(page)).toHaveText("Into Section “Small websites that sta…” › after Heading");
  await expect.poll(async () => (await storedDraft(page, "images/placeholder.svg"))?.content).toContain("<svg");
  const first = await source(page);
  expect(flat(first)).toContain('<h1>Small websites that stay yours</h1><img src="/images/placeholder.svg" alt="" width="640" height="400"><p class="lead">');
  // The preview shows the drafted placeholder.
  await expect.poll(() => frame(page).locator(".hero img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(640);
  const svg = (await storedDraft(page, "images/placeholder.svg"))!.content;
  await image.click();
  await expect.poll(async () => (await source(page)) !== first).toBe(true);
  expect((await source(page)).match(/placeholder\.svg/g)).toHaveLength(2);
  expect((await storedDraft(page, "images/placeholder.svg"))?.content).toBe(svg);
  await undo(page);
  await expect.poll(() => source(page)).toBe(first);
  expect((await storedDraft(page, "images/placeholder.svg"))?.content).toBe(svg);
  await undo(page);
  await expect.poll(() => source(page)).toBe(original);
  await expect.poll(() => storedDraft(page, "images/placeholder.svg")).toBeUndefined();
});

test("a component refuses a block with its reason in red, and nothing changes", async ({ page, baseURL }) => {
  await open(page, baseURL, 540, ".hero h1");
  const original = await source(page);
  await frame(page).locator("card-project").first().click({ position: { x: 4, y: 4 } });
  await expect(page.getByRole("toolbar", { name: "Edit bar", exact: true }).locator(".edit-bar__kind")).toHaveText(/Project card|Card project/);
  await rail(page).getByRole("button", { name: "Paragraph", exact: true }).click();
  await expect(label(page)).toHaveClass(/is-refused/);
  await expect(label(page)).toContainText("Card project is a component");
  expect(await source(page)).toBe(original);
});
