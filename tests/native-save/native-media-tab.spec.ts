import { test, expect, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";
const pane = (page: Page) => page.getByRole("region", { name: "Media", exact: true });
async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main");
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Media", exact: true }).click();
  await expect(pane(page).getByRole("button", { name: "Details for images/studio-desk.svg", exact: true })).toBeVisible();
}
test("Media is the tab between Pages and Files, with keyboard navigation and persistent query and detail state", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await expect(page.locator("#media-library-toggle")).toHaveCount(0);
  await expect(page.locator("dialog.media-library")).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveText(["Pages", "Media", "Files"]);
  await pane(page).getByLabel("Search media", { exact: true }).fill("studio-desk");
  await pane(page).getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  await page.getByRole("tab", { name: "Media", exact: true }).focus(); await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Files", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowLeft"); await expect(page.getByRole("tab", { name: "Media", exact: true })).toBeFocused();
  await expect(pane(page).getByLabel("Search media", { exact: true })).toHaveValue("studio-desk");
  await expect(pane(page).getByLabel("Default alt text", { exact: true })).toBeVisible();
  await page.keyboard.press("Home"); await expect(page.getByRole("tab", { name: "Pages", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft"); await expect(page.getByRole("tab", { name: "Files", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home"); await page.keyboard.press("ArrowRight"); await expect(page.getByRole("tab", { name: "Media", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End"); await expect(page.getByRole("tab", { name: "Files", exact: true })).toHaveAttribute("aria-selected", "true");
});
test("metadata Undo and Redo refresh open detail fields while preserving query", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await pane(page).getByLabel("Search media", { exact: true }).fill("studio-desk");
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
  await expect(pane(page).getByLabel("Search media", { exact: true })).toHaveValue("studio-desk");
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
  await page.getByRole("tab", { name: "Media", exact: true }).click();
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
  await open(page, baseURL); await pane(page).getByLabel("Search media", { exact: true }).fill("studio-desk");
  await pane(page).getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  await pane(page).getByLabel("Default alt text", { exact: true }).fill("Stale scope alt");
  await page.request.post(`${baseURL}/__demo/branch`, { data: { name: "feature" } });
  await page.evaluate(() => { (window as any).oldImageSave = [...document.querySelectorAll<HTMLButtonElement>("#explorer-media button")].find(button => button.textContent === "Save metadata"); location.hash = "repo=501&branch=feature&file=index.html"; });
  await expect(page.locator("#status")).toContainText("Up to date with feature");
  await page.evaluate(() => (window as any).oldImageSave.click());
  if (!await page.locator("#explorer").evaluate(element => element.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Media", exact: true }).click();
  await expect(pane(page).getByLabel("Search media", { exact: true })).toHaveValue("");
  expect((await storedDraft(page, ".editor/media.json"))?.content ?? "").not.toContain("Stale scope alt");
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`Media pane stays within a narrow viewport in ${colorScheme}`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 780 }); await page.emulateMedia({ colorScheme }); await open(page, baseURL);
    await expect.poll(() => pane(page).locator(".media-library__card img").first().evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    for (const selector of ["#explorer-media", ".media-library--pane"]) {
      const geometry = await page.locator(selector).evaluate(element => ({ right: element.getBoundingClientRect().right, width: element.scrollWidth, client: element.clientWidth }));
      expect(geometry.right).toBeLessThanOrEqual(390);
      expect(geometry.width).toBeLessThanOrEqual(geometry.client);
    }
    const width = await page.evaluate(() => document.documentElement.scrollWidth); expect(width).toBeLessThanOrEqual(390);
    await pane(page).getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
    await expect(pane(page).getByLabel("Default alt text", { exact: true })).toBeInViewport();
    await expect(pane(page).getByRole("heading", { name: "Image metadata", exact: true })).toBeInViewport();
    await expect(pane(page).getByLabel("Search media", { exact: true })).toBeHidden();
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
    await page.screenshot({ path: `.scratch/t3-continuation/media-manager-narrow-${colorScheme}.png` });
  });
}

test("image slot keeps its chooser modal while manager query survives", async ({ page, baseURL }) => {
  await open(page, baseURL); await pane(page).getByLabel("Search media", { exact: true }).fill("studio-desk");
  await page.keyboard.press("Escape");
  await expect(page.locator("#explorer")).not.toBeVisible();
  const frame = page.frameLocator(".native-preview-frame"); await frame.locator(".hero-image").click({ timeout: 10000 });
  await page.getByRole("button", { name: "Choose image…", exact: true }).click({ timeout: 10000 });
  const chooser = page.getByRole("dialog", { name: "Choose image", exact: true }); await expect(chooser).toBeVisible();
  await chooser.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click({ timeout: 10000 });
  await chooser.getByRole("button", { name: "Use image", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toContain('src="/images/studio-desk.svg"');
  await expect(chooser).toHaveCount(0);
  await page.locator("#explorer-toggle").click(); await page.getByRole("tab", { name: "Media", exact: true }).click();
  await expect(pane(page).getByLabel("Search media", { exact: true })).toHaveValue("studio-desk");
});
test("changed image usage rebuilds detail references while retaining unfinished fields and focus", async ({page,baseURL}) => {
  await open(page,baseURL);await pane(page).getByRole("button",{name:"Details for images/studio-desk.svg",exact:true}).click();
  const alt = pane(page).getByLabel("Default alt text",{exact:true});await alt.fill("Unfinished referenced portrait");await alt.focus();
  await pane(page).getByLabel("Image tags",{exact:true}).fill("unfinished usage tags");await alt.focus();
  await page.evaluate(async () => {
    (window as any).mediaAltBeforeUsage = document.querySelector('#explorer-media input[aria-label="Default alt text"]');
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
      async load(){return {key:"busy",items:[{path:"images/a.svg",version:"A"}],metadata:{"images/a.svg":metadata},collections: [], usage:{}};},
      async blob(){return new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'],{type:"image/svg+xml"});},
      async metadata(changes){await new Promise<void>(resolve => {(window as any).releaseImageWrite=resolve;});metadata={alt:changes["images/a.svg"]?.alt ?? "",tags:[]};},
      async collections() {}, async rename(){renames++;},async remove(){},async openPage(){},
    });
    Object.assign(window,{busyImageProbe:{state:()=>renames,dispose:()=>{view.dispose();host.remove();}}});await view.ready;
  });
  const library = page.getByRole("region",{name:"Media",exact:true});await library.getByRole("button",{name:"Details for images/a.svg",exact:true}).click();
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
test("closed Media explorer defers repository refresh until reopened", async ({page,baseURL}) => {
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

test("background image loads preserve typing, the chosen collection and details", async ({ page, baseURL }) => {
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
        return { key: "load", items: [{ path: "images/a.svg", version: "A" }], metadata: { "images/a.svg": { alt: "", tags: ["Studio"] } }, collections: ["Studio"], usage: {} };
      },
      async blob() { return new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], { type: "image/svg+xml" }); },
      async metadata() {}, async collections() {}, async rename() {}, async remove() {}, async openPage() {},
    });
    Object.assign(window, { loadImageProbe: { refresh: () => view.refresh(), dispose: () => { view.dispose(); host.remove(); }, instant: () => { delay = false; } } });
  });
  const library = pane(page), search = library.getByLabel("Search media", { exact: true });
  await expect(library).toHaveAttribute("aria-busy", "true");
  await search.pressSequentially("a.svg"); await expect(search).toHaveValue("a.svg");
  await expect(search).not.toHaveAttribute("readonly", "");
  await page.evaluate(() => (window as any).releaseImageLoad());
  await expect(library).not.toHaveAttribute("aria-busy", "true");
  await page.evaluate(() => { void (window as any).loadImageProbe.refresh(); });
  await expect(library).toHaveAttribute("aria-busy", "true");
  await library.getByLabel("Collections", { exact: true }).selectOption("Studio");
  await search.fill("a"); await expect(search).toHaveValue("a");
  await library.getByRole("button", { name: "Details for images/a.svg", exact: true }).click();
  await expect(library.locator(".media-library__sheet")).toContainText("Loading image");
  await page.evaluate(() => (window as any).releaseImageLoad());
  await expect(library.getByLabel("Default alt text", { exact: true })).toBeVisible();
  await expect(library.getByLabel("Collections", { exact: true })).toHaveValue("Studio");
  await expect(library.locator(".media-library__message")).toBeEmpty();
  await page.evaluate(() => (window as any).loadImageProbe.dispose());
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`Media leaves canvas and code visible on desktop in ${colorScheme}`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 }); await page.emulateMedia({ colorScheme }); await open(page, baseURL);
    await expect.poll(() => pane(page).locator(".media-library__card img").first().evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const box = await page.locator("#explorer-media").boundingBox();
    await test.info().attach("pane-geometry", { body: JSON.stringify(box), contentType: "application/json" });
    expect(box?.height).toBeLessThanOrEqual(495);
    expect((box?.y ?? 900) + (box?.height ?? 900)).toBeLessThan(700);
    await page.screenshot({ path: `.scratch/t3-continuation/media-manager-desktop-${colorScheme}.png` });
    await pane(page).getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
    await expect(pane(page).getByRole("button", { name: "Back to grid", exact: true })).toBeFocused();
    await page.screenshot({ path: `.scratch/t3-continuation/media-manager-details-desktop-${colorScheme}.png` });
  });
}

test("compact details reveal metadata and return to the same browse filters", async ({ page, baseURL }) => {
  // Details replace browsing only in a narrow pane; on wide screens they sit beside the grid.
  await page.setViewportSize({ width: 390, height: 844 }); await open(page, baseURL);
  const library = pane(page);
  await library.getByLabel("Search media", { exact: true }).fill("studio-desk");
  await library.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Images", exact: true }).click();
  await library.getByLabel("Select images/studio-desk.svg", { exact: true }).check();
  const details = library.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true });
  await details.focus(); await page.keyboard.press("Enter");
  const back = library.getByRole("button", { name: "Back to grid", exact: true });
  await expect(back).toBeFocused();
  await expect(library.getByLabel("Default alt text", { exact: true })).toBeInViewport();
  await expect(library.getByRole("heading", { name: "Image metadata", exact: true })).toBeInViewport();
  await expect(library.getByLabel("Search media", { exact: true })).toBeHidden();
  await page.keyboard.press("Enter");
  await expect(details).toBeFocused();
  await expect(library.getByLabel("Search media", { exact: true })).toHaveValue("studio-desk");
  await library.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("menuitemradio", { name: "Images", exact: true })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
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
        return { key: "focus", items: [{ path: "images/a.svg", version: "A" }], metadata: { "images/a.svg": { alt: "", tags: ["portrait"] } }, collections: ["portrait"], usage: fresh ? { "images/a.svg": { pages: ["index.html"], files: ["index.html"], alts: ["New reference"] } } : {} };
      },
      async blob() { return new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], { type: "image/svg+xml" }); },
      async metadata() {}, async collections() {}, async rename() {}, async remove() { removed++; }, async openPage() {},
    });
    Object.assign(window, { focusProbe: { refresh: () => { void view.refresh(); }, removed: () => removed, dispose: () => { view.dispose(); host.remove(); } } });
    await view.ready;
  });
}
test("refresh keeps thumbnail, Collections and usage focus and completes a keyboard detail request", async ({ page, baseURL }) => {
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
  for (const target of [thumb, library.getByLabel("Collections", { exact: true }), library.getByRole("button", { name: "Used on 1 pages", exact: true })]) {
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
  await library.getByRole("button", { name: "Cancel", exact: true }).focus();
  await page.evaluate(() => {
    (window as any).staleImageDelete = [...document.querySelectorAll<HTMLButtonElement>(".media-library button")].find(button => button.textContent === "Delete images");
    (window as any).focusProbe.refresh();
  });
  await expect(library.getByRole("button", { name: "Delete images", exact: true })).toBeHidden();
  await page.evaluate(() => (window as any).releaseFocusLoad());
  await expect(library).not.toHaveAttribute("aria-busy", "true");
  await expect(thumb).toBeFocused();
  await page.evaluate(() => (window as any).staleImageDelete.click());
  await expect(library.locator(".media-library__message")).toContainText("This delete confirmation has expired");
  expect(await page.evaluate(() => (window as any).focusProbe.removed())).toBe(0);
  await page.evaluate(() => (window as any).focusProbe.dispose());
});

test("cancelled delete stays dismissed without a reopen notice on refresh", async ({ page, baseURL }) => {
  await mountDelayedReferences(page, baseURL);
  const library = pane(page);
  await library.getByRole("button", { name: "Details for images/a.svg", exact: true }).click();
  await library.getByRole("button", { name: "Delete image…", exact: true }).click();
  await library.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.evaluate(() => (window as any).focusProbe.refresh());
  await expect(library.locator(".media-library__message")).toBeEmpty();
  await page.evaluate(() => (window as any).releaseFocusLoad());
  await expect(library).not.toHaveAttribute("aria-busy", "true");
  await expect(library.locator(".media-library__message")).toBeEmpty();
  await page.evaluate(() => (window as any).focusProbe.dispose());
});
test("a failed detail image clears its focus request and later refresh preserves grid focus", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await page.evaluate(async () => {
    const { createMediaLibraryView } = await import("/src/page-builder/media-library-view.ts");
    const host = document.createElement("div"); host.style.cssText = "position:fixed;right:0;top:60px;width:440px;height:600px;z-index:1000;background:var(--surface)"; document.body.append(host);
    const view = createMediaLibraryView(host, {
      async load() { return { key: "failure", items: [{ path: "images/broken.svg", version: "A" }], metadata: {}, collections: [], usage: {} }; },
      async blob() { throw new Error("Image fetch failed"); }, async metadata() {}, async collections() {}, async rename() {}, async remove() {}, async openPage() {},
    });
    Object.assign(window, { failedFocusProbe: { refresh: () => view.refresh(), dispose: () => { view.dispose(); host.remove(); } } }); await view.ready;
  });
  const library = pane(page), thumb = library.getByRole("button", { name: "Details for images/broken.svg", exact: true });
  await thumb.focus(); await page.keyboard.press("Enter");
  await expect(library.locator(".media-library__sheet")).toBeHidden();
  await expect(thumb).toBeFocused();
  await page.evaluate(() => (window as any).failedFocusProbe.refresh());
  await expect(thumb).toBeFocused();
  await page.evaluate(() => (window as any).failedFocusProbe.dispose());
});

const columns = (page: Page) => pane(page).locator(".media-library__grid").evaluate(grid => getComputedStyle(grid).gridTemplateColumns.split(" ").length);
for (const [width, across] of [[320, 2], [390, 3], [768, 4], [1280, 6]] as const) {
  test(`Media shows ${across} square tiles across at ${width} px, with usage and selection targets apart`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 }); await open(page, baseURL);
    await expect.poll(() => columns(page)).toBe(across);
    const card = pane(page).locator(".media-library__card").first();
    const tile = await card.boundingBox();
    expect(Math.abs(tile!.width - tile!.height)).toBeLessThan(1);
    const usage = (await card.locator(".media-library__usage").boundingBox())!, select = (await card.locator(".media-library__select").boundingBox())!;
    for (const target of [usage, select]) expect(Math.min(target.width, target.height)).toBeGreaterThanOrEqual(44);
    expect(usage.x + usage.width).toBeLessThanOrEqual(select.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test("Media tiles: one per Image family, names on hover or keyboard focus, a clean surface without a preview", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await page.evaluate(async () => {
    const { createMediaLibraryView } = await import("/src/page-builder/media-library-view.ts");
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;inset:20px;background:var(--surface);z-index:1000";
    document.body.append(host);
    const paths = ["images/photo.webp", "images/photo-480w.webp", "images/photo-960w.webp", "images/scan.png"];
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#2f6d3a"/></svg>';
    const view = createMediaLibraryView(host, {
      async load() { return { key: "tiles", items: paths.map(path => ({ path, version: "A" })), metadata: {}, collections: [], usage: { "images/photo.webp": { pages: ["index.html", "about/index.html"], files: ["index.html", "about/index.html"], alts: [] }, "images/photo-480w.webp": { pages: ["about/index.html", "work/index.html"], files: ["about/index.html", "work/index.html"], alts: [] } } }; },
      async blob(path) { return path.endsWith(".png") ? new Blob(["not a picture"], { type: "image/png" }) : new Blob([svg], { type: "image/svg+xml" }); },
      async metadata() {}, async collections() {}, async rename() {}, async remove() {}, async openPage() {}, async import() { return []; },
    });
    Object.assign(window, { tilesProbe: { dispose: () => { view.dispose(); host.remove(); } } });
    await view.ready;
  });
  const library = pane(page), tiles = library.locator(".media-library__card");
  await expect(tiles).toHaveCount(2);
  await expect(library.getByRole("button", { name: "Details for images/photo-480w.webp", exact: true })).toHaveCount(0);
  await expect(library.locator(".media-library__browse > [role=status]")).toContainText("2 of 2 files");
  const photo = tiles.filter({ has: page.getByRole("button", { name: "Details for images/photo.webp", exact: true }) });
  await expect.poll(() => photo.locator("img").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  // The copy's page counts for its family, and a page both use counts once.
  await expect(photo.getByRole("button", { name: "Used on 3 pages", exact: true })).toHaveText("3");
  const name = photo.locator(".media-library__name");
  await page.mouse.move(1270, 890);
  await expect(name).toHaveCSS("opacity", "0");
  await photo.hover(); await expect(name).toHaveCSS("opacity", "1");
  await page.mouse.move(1270, 890); await expect(name).toHaveCSS("opacity", "0");
  await photo.getByRole("button", { name: "Details for images/photo.webp", exact: true }).focus();
  await expect(name).toHaveCSS("opacity", "1");
  await photo.getByRole("checkbox", { name: "Select images/photo.webp", exact: true }).check();
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await page.mouse.move(1270, 890);
  await expect(name).toHaveCSS("opacity", "1");
  const scan = tiles.filter({ has: page.getByRole("button", { name: "Details for images/scan.png", exact: true }) });
  await expect(scan).toHaveClass(/is-file/);
  await expect(scan.locator("img")).toHaveCount(0);
  await expect(scan.locator(".media-library__format")).toHaveText("PNG");
  await page.evaluate(() => (window as any).tilesProbe.dispose());
});

test("touch shows every Media tile name without hover", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await open(page, baseURL);
  await expect(pane(page).locator(".media-library__name").first()).toHaveCSS("opacity", "1");
  await context.close();
});

test("One bar: search, Collections and More share one 44 px row at every width, with adding in More", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 }); await open(page, baseURL);
  const library = pane(page);
  const search = library.getByLabel("Search media", { exact: true }), collections = library.getByLabel("Collections", { exact: true });
  const more = library.getByRole("button", { name: "More", exact: true });
  // No Media heading and no separate Add button: the tab names the pane, adding is in More.
  await expect(library.getByRole("heading", { name: "Media", exact: true })).toBeHidden();
  await expect(library.getByRole("button", { name: /Upload|Add/ })).toHaveCount(0);
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => {
      const [a, b, c] = await Promise.all([search, collections, more].map(control => control.boundingBox()));
      return a && b && c && [a.height, b.height, c.height, Math.round(b.y - a.y), Math.round(c.y - a.y), Math.round(b.x - a.x - a.width), Math.round(c.x - b.x - b.width), c.x + c.width <= width];
    }, `width ${width}`).toEqual([44, 44, 44, 0, 0, 8, 8, true]);
  }
  await search.focus(); await page.keyboard.press("Tab"); await expect(collections).toBeFocused();
  // Escape closes the open list only; the explorer stays.
  await page.keyboard.press("Enter"); await page.keyboard.press("Escape");
  await expect(page.locator("#explorer")).toBeVisible(); await expect(collections).toBeFocused();
  await page.keyboard.press("Tab"); await expect(more).toBeFocused();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "More", exact: true });
  await expect(menu.getByRole("menuitem").first()).toHaveText("Add new file");
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await expect(menu.getByRole("group", { name: "Show", exact: true }).getByRole("menuitemradio")).toHaveText(["All", "Images", "Video", "Audio", "Documents"]);
  await expect(menu.getByRole("menuitemradio", { name: "All", exact: true })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape"); await expect(menu).toBeHidden(); await expect(more).toBeFocused();
  await expect(page.locator("#explorer")).toBeVisible();
  await more.click();
  const chooser = page.waitForEvent("filechooser");
  await menu.getByRole("menuitem", { name: "Add new file", exact: true }).click();
  expect((await chooser).isMultiple()).toBe(true);
});

async function mountMixedLibrary(page: Page, baseURL: string | undefined) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await page.evaluate(async () => {
    const { createMediaLibraryView } = await import("/src/page-builder/media-library-view.ts");
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;inset:20px;background:var(--surface);z-index:1000";
    document.body.append(host);
    const paths = ["images/studio.svg", "images/beach.svg", "media/studio-tour.mp4", "media/studio-guide.pdf"];
    const long = "Studio portraits from the spring campaign and the summer launch";
    const view = createMediaLibraryView(host, {
      async load() {
        return { key: "mixed", items: paths.map(path => ({ path, version: "A" })), collections: ["Studio", long],
          metadata: { "images/studio.svg": { alt: "", tags: ["Studio", long] }, "media/studio-tour.mp4": { alt: "", tags: ["Studio"] } }, usage: {} };
      },
      async blob() { return new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], { type: "image/svg+xml" }); },
      async metadata() {}, async collections() {}, async rename() {}, async remove() {}, async openPage() {}, async import() { return []; },
    });
    Object.assign(window, { mixedProbe: { dispose: () => { view.dispose(); host.remove(); } } });
    await view.ready;
  });
}
const tileNames = (page: Page) => pane(page).locator(".media-library__card").evaluateAll(cards => cards.map(card => (card as HTMLElement).dataset.path));

test("search narrows, a kind in More narrows the search, and no results offer all media", async ({ page, baseURL }) => {
  await mountMixedLibrary(page, baseURL);
  const library = pane(page), search = library.getByLabel("Search media", { exact: true });
  const more = library.getByRole("button", { name: "More", exact: true }), menu = page.getByRole("menu", { name: "More", exact: true });
  await expect.poll(() => tileNames(page)).toEqual(["images/beach.svg", "images/studio.svg", "media/studio-guide.pdf", "media/studio-tour.mp4"]);
  await search.fill("studio");
  await expect.poll(() => tileNames(page)).toEqual(["images/studio.svg", "media/studio-guide.pdf", "media/studio-tour.mp4"]);
  await expect(library.locator(".media-library__browse > [role=status]")).toHaveText("3 of 4 files");
  await more.click(); await menu.getByRole("menuitemradio", { name: "Video", exact: true }).click();
  await expect(more).toBeFocused();
  await expect.poll(() => tileNames(page)).toEqual(["media/studio-tour.mp4"]);
  await more.click(); await menu.getByRole("menuitemradio", { name: "Documents", exact: true }).click();
  await expect.poll(() => tileNames(page)).toEqual(["media/studio-guide.pdf"]);
  // A search the kind hides offers the way back to all media, keeping the search.
  await search.fill("beach");
  await expect(library.locator(".media-library__card")).toHaveCount(0);
  await expect(library.locator(".media-library__empty")).toContainText("No matching media");
  await library.getByRole("button", { name: "Search all media", exact: true }).click();
  await expect.poll(() => tileNames(page)).toEqual(["images/beach.svg"]);
  await expect(search).toHaveValue("beach"); await expect(search).toBeFocused();
  await more.click();
  await expect(menu.getByRole("menuitemradio", { name: "All", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(menu.getByRole("menuitemradio", { name: "Documents", exact: true })).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");
  // A collection narrows too, and its own no-results offers all collections.
  await library.getByLabel("Collections", { exact: true }).selectOption("Studio");
  await expect(library.getByRole("button", { name: "Search all collections", exact: true })).toBeVisible();
  await search.fill("");
  await expect.poll(() => tileNames(page)).toEqual(["images/studio.svg", "media/studio-tour.mp4"]);
  await more.click(); await menu.getByRole("menuitemradio", { name: "Audio", exact: true }).click();
  await library.getByRole("button", { name: "Show all media", exact: true }).click();
  await expect.poll(() => tileNames(page)).toEqual(["images/studio.svg", "media/studio-tour.mp4"]);
  await page.evaluate(() => (window as any).mixedProbe.dispose());
});

test("Collections is a native select that works with arrows and Enter and shortens long names", async ({ page, baseURL }) => {
  await mountMixedLibrary(page, baseURL);
  const library = pane(page), collections = library.getByLabel("Collections", { exact: true });
  await expect(collections).toHaveJSProperty("tagName", "SELECT");
  await expect(collections.locator("option")).toHaveText(["All collections", "Studio", "Studio portraits from the spring campaign and the summer launch"]);
  await library.getByLabel("Search media", { exact: true }).focus(); await page.keyboard.press("Tab");
  await expect(collections).toBeFocused();
  // Open, move down one, choose.
  await page.keyboard.press("Enter"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await expect(collections).toHaveValue("Studio");
  await expect.poll(() => tileNames(page)).toEqual(["images/studio.svg", "media/studio-tour.mp4"]);
  await expect(collections).toBeFocused();
  await page.keyboard.press("Enter"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await expect(collections).toHaveValue("Studio portraits from the spring campaign and the summer launch");
  await expect.poll(() => tileNames(page)).toEqual(["images/studio.svg"]);
  // The closed control keeps its width and shortens the name.
  const box = await collections.boundingBox(); expect(box?.height).toBe(44);
  expect(await collections.evaluate(select => {
    const shown = select.querySelector("selectedcontent");
    return shown ? shown.scrollWidth > shown.clientWidth : select.scrollWidth <= select.clientWidth + 1;
  })).toBe(true);
  await page.evaluate(() => (window as any).mixedProbe.dispose());
});
