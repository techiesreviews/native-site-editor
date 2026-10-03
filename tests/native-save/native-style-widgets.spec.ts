import { test, expect, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";
const style = (page: Page) => page.getByRole("complementary", { name: "Style panel" });
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
async function open(page: Page, baseURL: string | undefined, selector = ".lead") {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(selector)).toBeVisible();
  await frame(page).locator(selector).click();
  await style(page).getByRole("button", { name: "Open Style panel" }).click();
  await expect.poll(() => page.evaluate(async () => typeof (await import("/src/components/code-editor.ts")).getMountedSource("styles/site.css"))).toBe("string");
}
async function append(page: Page, path: string, text: string) {
  await page.evaluate(async ({path,text}) => {
    const editor = await import("/src/components/code-editor.ts"); const source = editor.getMountedSource(path);
    if (source === undefined) throw new Error("Missing source model");
    editor.replaceActiveRange({path,start:source.length,end:source.length,expected:"",text});
  }, {path,text});
}
const source = async (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("styles/site.css"));
test("code-authored grid shows native tracks, count edit is one Undo, and advanced tracks remain explicit", async ({page,baseURL}) => {
  await open(page,baseURL);
  await append(page,"styles/site.css","\n.lead { display: grid; grid-template-columns: 120px minmax(0, 1fr); grid-template-rows: repeat(2, 1fr); gap: 9px; }\n");
  await expect(frame(page).locator(".lead")).toHaveCSS("display","grid");
  await style(page).getByRole("searchbox",{name:"Search styles"}).fill("grid");
  const grid = style(page).getByRole("region",{name:"Grid layout"});
  await expect(grid).toBeVisible();
  await expect(grid).toContainText("Custom columns: 120px minmax(0, 1fr)");
  await expect(grid.getByLabel("Columns",{exact:true})).toHaveValue("");
  const before = await source(page);
  await grid.getByLabel("Columns",{exact:true}).fill("3");
  await grid.getByRole("button",{name:"Replace with 3 equal columns"}).click();
  await expect.poll(() => source(page)).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
  await grid.getByLabel("Rows",{exact:true}).focus(); await page.keyboard.press("ControlOrMeta+Z");
  await expect.poll(() => source(page)).toBe(before);
  await expect(page.locator("#content")).toBeVisible();
});
test("native image focal keyboard and pointer commits write CSS and Undo restores source", async ({page,baseURL}) => {
  await open(page,baseURL,".hero-image");
  await style(page).getByRole("searchbox",{name:"Search styles"}).fill("image focus");
  const focal = style(page).getByRole("region",{name:"Image focus"}); await expect(focal).toBeVisible();
  const preview = focal.getByRole("group");
  await expect.poll(() => focal.locator("img").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const before = await source(page);
  await preview.focus(); await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(() => source(page)).toContain("object-position: 60% 50%");
  await preview.press("ControlOrMeta+Z"); await expect.poll(() => source(page)).toBe(before);
  const box = await preview.boundingBox(); if (!box) throw new Error("Missing image preview");
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5); await page.mouse.down();
  await page.mouse.move(box.x+box.width*.7,box.y+box.height*.6);
  expect(await source(page)).toBe(before);
  await page.mouse.up(); await expect.poll(() => source(page)).toMatch(/object-position: [\d.]+% [\d.]+%/);
  await preview.press("ControlOrMeta+Z"); await expect.poll(() => source(page)).toBe(before);
  expect((await storedDraft(page,"index.html"))?.content ?? "").not.toContain("object-position");
});
test("background focal resolves native declaration URL and excludes layered backgrounds", async ({page,baseURL}) => {
  await open(page,baseURL);
  await append(page,"styles/site.css",'\n.lead { background-image: url("../images/studio-desk.svg"); background-position: 25% 30%; }\n');
  await style(page).getByRole("searchbox",{name:"Search styles"}).fill("image focus");
  const focal = style(page).getByRole("region",{name:"Image focus"}); await expect(focal).toBeVisible();
  await expect(focal.getByLabel("X (%)",{exact:true})).toHaveValue("25");
  await focal.getByRole("group").focus(); await page.keyboard.press("ArrowDown");
  await expect.poll(() => source(page)).toContain("background-position: 25% 31%");
  await page.locator("#content-secondary").click();
  await append(page,"styles/site.css",'\n.lead { background-image: url("../images/studio-desk.svg"), linear-gradient(red, blue); }\n');
  await expect(focal).toHaveCount(0);
});
test("detached grid controls cannot write after breakpoint or selection changes", async ({page,baseURL}) => {
  await open(page,baseURL);
  await append(page,"styles/site.css","\n.lead { display: grid; grid-template-columns: repeat(2, 1fr); }\n");
  await expect(frame(page).locator(".lead")).toHaveCSS("display","grid");
  await style(page).getByRole("searchbox",{name:"Search styles"}).fill("grid");
  const grid = style(page).getByRole("region",{name:"Grid layout"}); await expect(grid).toBeVisible();
  await grid.getByLabel("Columns",{exact:true}).fill("4");
  await page.evaluate(() => { (window as any).oldGridButton = [...document.querySelectorAll<HTMLButtonElement>(".grid-editor button")].find(button => button.textContent === "Replace with 4 equal columns"); });
  await style(page).getByRole("combobox",{name:"Style breakpoint"}).selectOption("mobile");
  await page.evaluate(() => (window as any).oldGridButton.click());
  expect(await source(page)).not.toContain("repeat(4, minmax(0, 1fr))");
  await frame(page).locator(".hero-image").click(); await page.evaluate(() => (window as any).oldGridButton.click());
  expect(await source(page)).not.toContain("repeat(4, minmax(0, 1fr))");
});
test("focal drag refuses an agent source change and classless targets keep Add class", async ({page,baseURL}) => {
  await open(page,baseURL,".hero-image"); await style(page).getByRole("searchbox",{name:"Search styles"}).fill("image focus");
  const focal = style(page).getByRole("region",{name:"Image focus"}), preview = focal.getByRole("group");
  await expect(focal).toBeVisible(); await expect.poll(() => focal.locator("img").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const before = await source(page), box = await preview.boundingBox(); if (!box) throw new Error("Missing preview");
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5); await page.mouse.down();
  await append(page,"index.html","\n<!-- concurrent agent source edit -->");
  await page.mouse.move(box.x+box.width*.8,box.y+box.height*.5); await page.mouse.up();
  expect(await source(page)).toBe(before);
  await frame(page).locator("section.cards").click();
  await expect(style(page).getByRole("textbox",{name:"Class name",exact:true})).toBeVisible();
  await expect(style(page)).toContainText("Add a class to style this element");
  await expect(style(page).getByRole("region",{name:"Image focus"})).toHaveCount(0);
});
test("native focal controls fit a narrow dark dock while source stays visible", async ({page,baseURL}) => {
  await page.setViewportSize({width:390,height:780});await page.emulateMedia({colorScheme:"dark"});
  await open(page,baseURL,".hero-image");await style(page).getByRole("searchbox",{name:"Search styles"}).fill("image focus");
  const focal = style(page).getByRole("region",{name:"Image focus"});await expect(focal).toBeVisible();
  const geometry = await focal.evaluate(element => ({right:element.getBoundingClientRect().right,width:element.scrollWidth,client:element.clientWidth}));
  expect(geometry.right).toBeLessThanOrEqual(390);expect(geometry.width).toBeLessThanOrEqual(geometry.client);
  await expect(focal.getByLabel("X (%)",{exact:true})).toBeVisible();
  expect(await page.locator(".code-split").evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(50);
});
