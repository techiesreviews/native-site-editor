import { test, expect, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";
const pane = (page: Page) => page.getByRole("region", { name: "Images", exact: true });
async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main");
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Images", exact: true }).click();
  await expect(pane(page).getByRole("button", { name: "Details for images/studio-desk.svg", exact: true })).toBeVisible();
}
test("Images is a real third tab with keyboard navigation and persistent query and detail state", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await expect(page.locator("#media-library-toggle")).toHaveCount(0);
  await expect(page.locator("dialog.media-library")).toHaveCount(0);
  await pane(page).getByLabel("Search images", { exact: true }).fill("studio-desk");
  await pane(page).getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  await page.getByRole("tab", { name: "Images", exact: true }).focus(); await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Pages", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowLeft"); await expect(page.getByRole("tab", { name: "Images", exact: true })).toBeFocused();
  await expect(pane(page).getByLabel("Search images", { exact: true })).toHaveValue("studio-desk");
  await expect(pane(page).getByLabel("Default alt text", { exact: true })).toBeVisible();
  await page.keyboard.press("Home"); await expect(page.getByRole("tab", { name: "Pages", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight"); await expect(page.getByRole("tab", { name: "Files", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End"); await expect(page.getByRole("tab", { name: "Images", exact: true })).toHaveAttribute("aria-selected", "true");
});
test("metadata Undo and Redo refresh open detail fields while preserving query", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await pane(page).getByLabel("Search images", { exact: true }).fill("studio-desk");
  await pane(page).getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  const before = await pane(page).getByLabel("Default alt text", { exact: true }).inputValue();
  await pane(page).getByLabel("Default alt text", { exact: true }).fill("Host refresh portrait");
  await pane(page).getByRole("button", { name: "Save metadata", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, ".editor/media.json"))?.content).toContain("Host refresh portrait");
  await expect(pane(page)).not.toHaveAttribute("aria-busy", "true");
  await expect(pane(page).getByRole("button", {name:"Save metadata",exact:true})).toBeFocused();
  await pane(page).getByLabel("Default alt text", {exact:true}).focus();
  await page.evaluate(async () => { await (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "index.html"); });
  await expect(pane(page).getByLabel("Default alt text", { exact: true })).toHaveValue(before);
  await expect(pane(page).getByLabel("Default alt text", {exact:true})).toBeFocused();
  await page.evaluate(async () => { await (await import("/src/components/code-editor.ts")).runVisualHistory("redo", "index.html"); });
  await expect(pane(page).getByLabel("Default alt text", { exact: true })).toHaveValue("Host refresh portrait");
  await expect(pane(page).getByLabel("Search images", { exact: true })).toHaveValue("studio-desk");
});
test("unsaved image metadata survives hidden-page source edits and visible refresh without losing focus", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await pane(page).getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  await pane(page).getByLabel("Default alt text", { exact: true }).fill("Unfinished alt");
  await pane(page).getByLabel("Image tags", { exact: true }).fill("unfinished, tags");
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const model = editor.getMountedSource("index.html");
    if (model === undefined) throw new Error("Missing source model");
    editor.replaceActiveRange({path:"index.html", start:model.length, end:model.length, expected:"", text:"\n<!-- unrelated page edit -->"});
  });
  await page.getByRole("tab", { name: "Images", exact: true }).click();
  const alt = pane(page).getByLabel("Default alt text", { exact: true });
  await expect(alt).toHaveValue("Unfinished alt");
  await expect(pane(page).getByLabel("Image tags", { exact: true })).toHaveValue("unfinished, tags");
  await alt.focus();
  await page.evaluate(() => { (window as any).mediaCardBeforeRefresh = document.querySelector(".media-library__card"); });
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const text = editor.getMountedSource("index.html");
    if (text === undefined) throw new Error("Missing source model");
    editor.replaceActiveRange({path:"index.html", start:text.length, end:text.length, expected:"", text:"\n<!-- visible unrelated edit -->"});
  });
  await expect.poll(() => page.evaluate(() => !(window as any).mediaCardBeforeRefresh.isConnected)).toBe(true);
  await expect(pane(page)).not.toHaveAttribute("aria-busy", "true");
  await expect(alt).toBeFocused();
  await expect(alt).toHaveValue("Unfinished alt");
  await pane(page).getByRole("button", { name: "Save metadata", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, ".editor/media.json"))?.content).toContain("Unfinished alt");
});
test("scope change disposes old controls and remounts clean image query state", async ({ page, baseURL }) => {
  await open(page, baseURL); await pane(page).getByLabel("Search images", { exact: true }).fill("studio-desk");
  await pane(page).getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  await pane(page).getByLabel("Default alt text", { exact: true }).fill("Stale scope alt");
  await page.request.post(`${baseURL}/__demo/branch`, { data: { name: "feature" } });
  await page.evaluate(() => { (window as any).oldImageSave = [...document.querySelectorAll<HTMLButtonElement>("#explorer-images button")].find(button => button.textContent === "Save metadata"); location.hash = "repo=501&branch=feature&file=index.html"; });
  await expect(page.locator("#status")).toContainText("Up to date with feature");
  await page.evaluate(() => (window as any).oldImageSave.click());
  if (!await page.locator("#explorer").evaluate(element => element.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Images", exact: true }).click();
  await expect(pane(page).getByLabel("Search images", { exact: true })).toHaveValue("");
  expect((await storedDraft(page, ".editor/media.json"))?.content ?? "").not.toContain("Stale scope alt");
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`Images pane stays within a narrow viewport in ${colorScheme}`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 780 }); await page.emulateMedia({ colorScheme }); await open(page, baseURL);
    await expect.poll(() => pane(page).locator(".media-library__card img").first().evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    for (const selector of ["#explorer-images", ".media-library--pane"]) {
      const geometry = await page.locator(selector).evaluate(element => ({ right: element.getBoundingClientRect().right, width: element.scrollWidth, client: element.clientWidth }));
      expect(geometry.right).toBeLessThanOrEqual(390);
      expect(geometry.width).toBeLessThanOrEqual(geometry.client);
    }
    const width = await page.evaluate(() => document.documentElement.scrollWidth); expect(width).toBeLessThanOrEqual(390);
    await pane(page).getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
    await expect(pane(page).getByLabel("Default alt text", { exact: true })).toBeInViewport();
    await expect(pane(page).getByRole("heading", { name: "Image metadata", exact: true })).toBeInViewport();
    await expect(pane(page).getByLabel("Search images", { exact: true })).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const bounds = await pane(page).evaluate(element => {
      const box = element.getBoundingClientRect();
      return { height: box.height, scrollHeight: element.scrollHeight, nestedScrollers: [...element.querySelectorAll("*")].filter(child => ["auto", "scroll"].includes(getComputedStyle(child).overflowY) && child.scrollHeight > child.clientHeight).length };
    });
    await test.info().attach("pane-geometry", { body: JSON.stringify(bounds), contentType: "application/json" });
    expect(bounds.height).toBeLessThanOrEqual(429);
    expect(bounds.scrollHeight).toBeGreaterThan(bounds.height);
    expect(bounds.nestedScrollers).toBe(0);
    await pane(page).getByRole("button", { name: "Delete image…", exact: true }).scrollIntoViewIfNeeded();
    await expect(pane(page).getByRole("button", { name: "Delete image…", exact: true })).toBeInViewport();
    await pane(page).getByRole("button", { name: "Back to grid", exact: true }).scrollIntoViewIfNeeded();
    await expect(pane(page).getByRole("button", { name: "Back to grid", exact: true })).toBeInViewport();
    await page.screenshot({ path: `/home/ubulex/Projects/native-site-editor/.scratch/t3-continuation/media-manager-narrow-${colorScheme}.png` });
  });
}

test("image slot keeps its chooser modal while manager query survives", async ({ page, baseURL }) => {
  await open(page, baseURL); await pane(page).getByLabel("Search images", { exact: true }).fill("studio-desk");
  await page.keyboard.press("Escape");
  await expect(page.locator("#explorer")).not.toBeVisible();
  const frame = page.frameLocator(".native-preview-frame"); await frame.locator(".hero-image").click({ timeout: 10000 });
  await page.getByRole("button", { name: "Choose image…", exact: true }).click({ timeout: 10000 });
  const chooser = page.getByRole("dialog", { name: "Choose image", exact: true }); await expect(chooser).toBeVisible();
  await chooser.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click({ timeout: 10000 });
  await chooser.getByRole("button", { name: "Use image", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toContain('src="/images/studio-desk.svg"');
  await expect(chooser).toHaveCount(0);
  await page.locator("#explorer-toggle").click(); await page.getByRole("tab", { name: "Images", exact: true }).click();
  await expect(pane(page).getByLabel("Search images", { exact: true })).toHaveValue("studio-desk");
});
test("changed image usage rebuilds detail references while retaining unfinished fields and focus", async ({page,baseURL}) => {
  await open(page,baseURL);await pane(page).getByRole("button",{name:"Details for images/studio-desk.svg",exact:true}).click();
  const alt = pane(page).getByLabel("Default alt text",{exact:true});await alt.fill("Unfinished referenced portrait");await alt.focus();
  await pane(page).getByLabel("Image tags",{exact:true}).fill("unfinished usage tags");await alt.focus();
  await page.evaluate(async () => {
    (window as any).mediaAltBeforeUsage = document.querySelector('#explorer-images input[aria-label="Default alt text"]');
    const editor = await import("/src/components/code-editor.ts"), source = editor.getMountedSource("index.html");
    if(source === undefined) throw new Error("Missing source model");
    editor.replaceActiveRange({path:"index.html",start:source.length,end:source.length,expected:"",text:'\n<img src="/images/studio-desk.svg" alt="New native page reference">'});
  });
  await expect.poll(() => page.evaluate(() => !(window as any).mediaAltBeforeUsage.isConnected)).toBe(true);
  await expect(pane(page)).not.toHaveAttribute("aria-busy","true");
  await expect(alt).toHaveValue("Unfinished referenced portrait");await expect(alt).toBeFocused();
  await expect(pane(page).getByLabel("Image tags",{exact:true})).toHaveValue("unfinished usage tags");
});
test("busy image action explains blocked controls and keeps Save focus after its refresh", async ({page,baseURL}) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path","index.html");
  await page.evaluate(async () => {
    const {createMediaLibraryView} = await import("/src/page-builder/media-library-view.ts");
    let metadata = {alt:"",tags:[] as string[]}, renames=0;
    const host = document.createElement("div");host.style.cssText="position:fixed;inset:20px;background:white;z-index:1000";document.body.append(host);
    const view = createMediaLibraryView(host,{
      async load(){return {key:"busy",items:[{path:"images/a.svg",version:"A"}],metadata:{"images/a.svg":metadata},usage:{}};},
      async blob(){return new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'],{type:"image/svg+xml"});},
      async metadata(changes){await new Promise<void>(resolve => {(window as any).releaseImageWrite=resolve;});metadata={alt:changes["images/a.svg"]?.alt ?? "",tags:[]};},
      async upload(){return "";},async rename(){renames++;},async remove(){},async rewrite(){},async openPage(){},
    });
    Object.assign(window,{busyImageProbe:{state:()=>renames,dispose:()=>{view.dispose();host.remove();}}});await view.ready;
  });
  const library = page.getByRole("region",{name:"Images",exact:true});await library.getByRole("button",{name:"Details for images/a.svg",exact:true}).click();
  await library.getByLabel("Default alt text",{exact:true}).fill("Saved pending alt");await library.getByRole("button",{name:"Save metadata",exact:true}).click();
  await expect(library).toHaveAttribute("aria-busy","true");await expect(library.getByRole("button",{name:"Rename",exact:true})).toHaveAttribute("aria-disabled","true");
  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>(".media-library button")].find(button=>button.textContent==="Rename")!.click());
  await expect(library.locator(".media-library__message")).toContainText("image change is in progress");
  expect(await page.evaluate(() => (window as any).busyImageProbe.state())).toBe(0);
  await page.evaluate(() => (window as any).releaseImageWrite());await expect(library).not.toHaveAttribute("aria-busy","true");
  await expect(library.getByRole("button",{name:"Save metadata",exact:true})).toBeFocused();
  await expect(library.getByLabel("Default alt text",{exact:true})).toHaveValue("Saved pending alt");
  await page.evaluate(() => (window as any).busyImageProbe.dispose());
});
test("closed Images explorer defers repository refresh until reopened", async ({page,baseURL}) => {
  await open(page,baseURL);
  await page.evaluate(() => {(window as any).closedImageCard=document.querySelector(".media-library__card");});
  await page.keyboard.press("Escape");await expect(page.locator("#explorer")).not.toBeVisible();
  await page.evaluate(async () => {
    const editor=await import("/src/components/code-editor.ts"), source=editor.getMountedSource("index.html");
    if(source === undefined) throw new Error("Missing source model");
    editor.replaceActiveRange({path:"index.html",start:source.length,end:source.length,expected:"",text:"\n<!-- closed pane edit -->"});
  });
  await expect.poll(async () => (await storedDraft(page,"index.html"))?.content).toContain("closed pane edit");
  expect(await page.evaluate(() => (window as any).closedImageCard.isConnected)).toBe(true);
  await page.locator("#explorer-toggle").click();
  await expect.poll(() => page.evaluate(() => !(window as any).closedImageCard.isConnected)).toBe(true);
  await expect(pane(page)).not.toHaveAttribute("aria-busy","true");
});

test("background image loads preserve typing, folders and details", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await page.evaluate(async () => {
    const { createMediaLibraryView } = await import("/src/page-builder/media-library-view.ts");
    let delay = true;
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;inset:20px;background:var(--surface);z-index:1000";
    document.body.append(host);
    const view = createMediaLibraryView(host, {
      async load() {
        if (delay) await new Promise<void>(resolve => { (window as any).releaseImageLoad = resolve; });
        return { key: "load", items: [{ path: "images/a.svg", version: "A" }], metadata: {}, usage: {} };
      },
      async blob() { return new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], { type: "image/svg+xml" }); },
      async metadata() {}, async upload() { return ""; }, async rename() {}, async remove() {}, async rewrite() {}, async openPage() {},
    });
    Object.assign(window, { loadImageProbe: { refresh: () => view.refresh(), dispose: () => { view.dispose(); host.remove(); }, instant: () => { delay = false; } } });
  });
  const library = pane(page), search = library.getByLabel("Search images", { exact: true });
  await expect(library).toHaveAttribute("aria-busy", "true");
  await search.pressSequentially("a.svg"); await expect(search).toHaveValue("a.svg");
  await expect(search).not.toHaveAttribute("readonly", "");
  await page.evaluate(() => (window as any).releaseImageLoad());
  await expect(library).not.toHaveAttribute("aria-busy", "true");
  await page.evaluate(() => { void (window as any).loadImageProbe.refresh(); });
  await expect(library).toHaveAttribute("aria-busy", "true");
  await library.getByLabel("Folder", { exact: true }).selectOption("images");
  await search.fill("a"); await expect(search).toHaveValue("a");
  await library.getByRole("button", { name: "Details for images/a.svg", exact: true }).click();
  await expect(library.locator(".media-library__sheet")).toContainText("Loading image");
  await page.evaluate(() => (window as any).releaseImageLoad());
  await expect(library.getByLabel("Default alt text", { exact: true })).toBeVisible();
  await expect(library.getByLabel("Folder", { exact: true })).toHaveValue("images");
  await expect(library.locator(".media-library__message")).toBeEmpty();
  await page.evaluate(() => (window as any).loadImageProbe.dispose());
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`Images leaves canvas and code visible on desktop in ${colorScheme}`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 }); await page.emulateMedia({ colorScheme }); await open(page, baseURL);
    await expect.poll(() => pane(page).locator(".media-library__card img").first().evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const box = await page.locator("#explorer-images").boundingBox();
    await test.info().attach("pane-geometry", { body: JSON.stringify(box), contentType: "application/json" });
    expect(box?.height).toBeLessThanOrEqual(495);
    expect((box?.y ?? 900) + (box?.height ?? 900)).toBeLessThan(700);
    await page.screenshot({ path: `/home/ubulex/Projects/native-site-editor/.scratch/t3-continuation/media-manager-desktop-${colorScheme}.png` });
    await pane(page).getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
    await expect(pane(page).getByRole("button", { name: "Back to grid", exact: true })).toBeFocused();
    await page.screenshot({ path: `/home/ubulex/Projects/native-site-editor/.scratch/t3-continuation/media-manager-details-desktop-${colorScheme}.png` });
  });
}

test("compact details reveal metadata and return to the same browse filters", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const library = pane(page);
  await library.getByLabel("Search images", { exact: true }).fill("studio-desk");
  await library.getByLabel("Folder", { exact: true }).selectOption("images");
  await library.getByLabel("Sort images", { exact: true }).selectOption("size");
  await library.getByLabel("Select images/studio-desk.svg", { exact: true }).check();
  const details = library.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true });
  await details.focus(); await page.keyboard.press("Enter");
  const back = library.getByRole("button", { name: "Back to grid", exact: true });
  await expect(back).toBeFocused();
  await expect(library.getByLabel("Default alt text", { exact: true })).toBeInViewport();
  await expect(library.getByRole("heading", { name: "Image metadata", exact: true })).toBeInViewport();
  await expect(library.getByLabel("Search images", { exact: true })).toBeHidden();
  await page.keyboard.press("Enter");
  await expect(details).toBeFocused();
  await expect(library.getByLabel("Search images", { exact: true })).toHaveValue("studio-desk");
  await expect(library.getByLabel("Folder", { exact: true })).toHaveValue("images");
  await expect(library.getByLabel("Sort images", { exact: true })).toHaveValue("size");
  await expect(library.getByLabel("Select images/studio-desk.svg", { exact: true })).toBeChecked();
  await library.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(library.getByLabel("Select images/studio-desk.svg", { exact: true })).not.toBeChecked();
});

async function mountDelayedReferences(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await page.evaluate(async () => {
    const { createMediaLibraryView } = await import("/src/page-builder/media-library-view.ts");
    let loads = 0, removed = 0;
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;right:0;top:60px;width:440px;height:600px;z-index:1000;background:var(--surface)";
    document.body.append(host);
    const view = createMediaLibraryView(host, {
      async load() {
        const fresh = ++loads > 1;
        if (fresh) await new Promise<void>(resolve => { (window as any).releaseFocusLoad = resolve; });
        return { key: "focus", items: [{ path: "images/a.svg", version: "A" }], metadata: { "images/a.svg": { alt: "", tags: ["portrait"] } }, usage: fresh ? { "images/a.svg": { pages: ["index.html"], files: ["index.html"], alts: ["New reference"] } } : {} };
      },
      async blob() { return new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], { type: "image/svg+xml" }); },
      async metadata() {}, async upload() { return ""; }, async rename() {}, async remove() { removed++; }, async rewrite() {}, async openPage() {},
    });
    Object.assign(window, { focusProbe: { refresh: () => { void view.refresh(); }, removed: () => removed, dispose: () => { view.dispose(); host.remove(); } } });
    await view.ready;
  });
}
test("refresh restores thumbnail, chip and usage focus and completes a keyboard detail request", async ({ page, baseURL }) => {
  await mountDelayedReferences(page, baseURL);
  const library = pane(page), thumb = library.getByRole("button", { name: "Details for images/a.svg", exact: true });
  await page.evaluate(() => (window as any).focusProbe.refresh());
  await expect(library).toHaveAttribute("aria-busy", "true");
  await thumb.focus(); await page.keyboard.press("Enter");
  await expect(library.locator(".media-library__sheet")).toContainText("Loading image");
  await page.evaluate(() => (window as any).releaseFocusLoad());
  const back = library.getByRole("button", { name: "Back to grid", exact: true });
  await expect(back).toBeFocused();
  await page.keyboard.press("Enter"); await expect(thumb).toBeFocused();
  for (const target of [thumb, library.getByRole("button", { name: "portrait", exact: true }), library.getByRole("button", { name: "Used on 1 pages", exact: true })]) {
    await target.focus();
    await page.evaluate(() => (window as any).focusProbe.refresh());
    await expect(library).toHaveAttribute("aria-busy", "true");
    await page.evaluate(() => (window as any).releaseFocusLoad());
    await expect(library).not.toHaveAttribute("aria-busy", "true");
    await expect(target).toBeFocused();
  }
  await thumb.focus(); await page.keyboard.press("Tab");
  await expect(library.getByLabel("Select images/a.svg", { exact: true })).toBeFocused();
  await page.evaluate(() => (window as any).focusProbe.refresh());
  await thumb.focus(); await page.keyboard.press("Enter");
  await page.locator("#explorer-toggle").focus();
  await page.evaluate(() => (window as any).releaseFocusLoad());
  await expect(library).not.toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#explorer-toggle")).toBeFocused();
  await page.evaluate(() => (window as any).focusProbe.dispose());
});
test("refresh refuses stale delete confirmations and requires fresh usage", async ({ page, baseURL }) => {
  await mountDelayedReferences(page, baseURL);
  const library = pane(page), thumb = library.getByRole("button", { name: "Details for images/a.svg", exact: true });
  await thumb.click(); await expect(library.getByLabel("Default alt text", { exact: true })).toBeVisible();
  await page.evaluate(() => (window as any).focusProbe.refresh());
  await library.getByRole("button", { name: "Delete image…", exact: true }).click();
  await expect(library.locator(".media-library__message")).toContainText("Wait for them to finish before deleting");
  await expect(library.getByRole("button", { name: "Delete images", exact: true })).toHaveCount(0);
  await page.evaluate(() => (window as any).releaseFocusLoad());
  await expect(library).not.toHaveAttribute("aria-busy", "true");
  await library.getByRole("button", { name: "Delete image…", exact: true }).click();
  await expect(library.locator(".media-library__sheet")).toContainText("Used on 1 pages");
  await page.evaluate(() => {
    (window as any).staleImageDelete = [...document.querySelectorAll<HTMLButtonElement>(".media-library button")].find(button => button.textContent === "Delete images");
    (window as any).focusProbe.refresh();
  });
  await expect(library.getByRole("button", { name: "Delete images", exact: true })).toBeHidden();
  await page.evaluate(() => (window as any).releaseFocusLoad());
  await expect(library).not.toHaveAttribute("aria-busy", "true");
  await page.evaluate(() => (window as any).staleImageDelete.click());
  await expect(library.locator(".media-library__message")).toContainText("Reopen Delete");
  expect(await page.evaluate(() => (window as any).focusProbe.removed())).toBe(0);
  await page.evaluate(() => (window as any).focusProbe.dispose());
});
