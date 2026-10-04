import { test, expect, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";
import { showStylePanel } from "./style-panel-controls";
test.beforeEach(({ page }) => { page.on("pageerror", error => console.log("PAGEERROR", error.stack)); page.on("console", message => { if (message.type() === "error") console.log("BROWSERERROR", message.text()); }); });
const panel = (page: Page) => page.getByRole("complementary", { name: "Style panel" });
async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.frameLocator(".native-preview-frame").locator(".lead")).toBeVisible();
  await expect.poll(() => page.evaluate(async () => typeof (await import("/src/components/code-editor.ts")).getMountedSource("index.html"))).toBe("string");
  await page.frameLocator(".native-preview-frame").locator(".lead").click();
  await showStylePanel(page);
  await panel(page).getByRole("searchbox", { name: "Search styles" }).fill("text colour");
}
test("right-click compatible variables writes var() with one Undo and keyboard Escape restores focus", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const color = panel(page).getByRole("textbox", { name: "Text colour", exact: true });
  await color.click({ button: "right" });
  const menu = panel(page).getByRole("menu", { name: "Text colour variables" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /--accent · #2f6d3a · styles\/site.css/ })).toBeVisible();
  await menu.getByRole("menuitem", { name: /--accent · #2f6d3a · styles\/site.css/ }).click();
  await expect.poll(async () => (await storedDraft(page, "styles/site.css"))?.content).toContain("color: var(--accent);");
  await color.press("ControlOrMeta+Z");
  await expect.poll(async () => (await storedDraft(page, "styles/site.css"))?.content ?? "").not.toContain("color: var(--accent);");
  await color.focus(); await color.press("Shift+F10"); await expect(menu).toBeVisible();
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("Escape"); await expect(menu).toHaveCount(0); await expect(color).toBeFocused();
});
test("variable definition opens the actual secondary CSS model at its native source offset", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await panel(page).getByRole("textbox", { name: "Text colour", exact: true }).click({ button: "right" });
  await panel(page).getByRole("menuitem", { name: "Go to --accent in styles/site.css", exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { monaco } = await import("/src/components/monaco.ts");
    const model = monaco.editor.getModels().find(model => model.uri.path.endsWith("/styles/site.css"));
    const editor = monaco.editor.getEditors().find(editor => editor.getModel() === model);
    return model && editor?.getPosition() ? model.getOffsetAt(editor.getPosition()!) : -1;
  })).toBe(await page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("styles/site.css")?.indexOf("--accent")));
  await expect(page.locator("#secondary-title")).toHaveText("styles/site.css");
  await expect.poll(() => page.evaluate(async () => (await import("/src/components/code-editor.ts")).isMounted("index.html"))).toBe(true);
});
test("a detached variable choice cannot write after another source selection", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await panel(page).getByRole("textbox", { name: "Text colour", exact: true }).click({ button: "right" });
  await page.evaluate(() => { (window as any).detachedVariable = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(button => button.getAttribute("aria-label")?.startsWith("--accent ·")); });
  await page.frameLocator(".native-preview-frame").locator("section.cards").evaluate(element => (element as HTMLElement).click());
  await page.evaluate(() => (window as any).detachedVariable.click());
  await expect(page.locator("#notice")).toContainText("style target changed");
  expect((await storedDraft(page, "styles/site.css"))?.content ?? "").not.toContain("color: var(--accent);");
});

test("real primary and secondary CSS models share workspace completion hover and definition", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.evaluate(async () => {
    const { monaco } = await import("/src/components/monaco.ts");
    const providers: Record<string, any[]> = {}; (window as any).workspaceProviders = providers;
    for (const [kind, method] of Object.entries({ completion: "registerCompletionItemProvider", hover: "registerHoverProvider", definition: "registerDefinitionProvider" })) {
      const original = (monaco.languages as any)[method].bind(monaco.languages);
      (monaco.languages as any)[method] = (language: string, provider: any) => { (providers[kind] ??= []).push(provider); return original(language, provider); };
    }
    location.hash = "repo=501&branch=main&file=components/card-note/card-note.css";
  });
  await expect.poll(() => page.evaluate(async () => typeof (await import("/src/components/code-editor.ts")).getMountedSource("components/card-note/card-note.css"))).toBe("string");
  await page.evaluate(async () => {
    const api = await import("/src/components/code-editor.ts"); const path = "components/card-note/card-note.css";
    const source = api.getMountedSource(path)!;
    api.replaceActiveRange({ path, start: source.length, end: source.length, expected: "", text: "\n:root { --remote-accent: oklch(0.5 0.1 60); }" });
    location.hash = "repo=501&branch=main&file=components/project-card/project-card.css";
  });
  await expect.poll(() => page.evaluate(async () => typeof (await import("/src/components/code-editor.ts")).getMountedSource("components/project-card/project-card.css"))).toBe("string");
  const result = await page.evaluate(async () => {
    const api = await import("/src/components/code-editor.ts"); const { monaco } = await import("/src/components/monaco.ts");
    const path = "components/project-card/project-card.css", source = api.getMountedSource(path)!;
    const start = source.indexOf("{") + 1;
    api.replaceActiveRange({ path, start, end: start, expected: "", text: "\n  --local-space: 14px;\n  color: var(--remote-accent);" });
    const model = monaco.editor.getModels().find(model => model.uri.path.endsWith("/" + path))!;
    const offset = model.getValue().indexOf("var(--remote-accent)") + 6;
    const providers = (window as any).workspaceProviders;
    const completions = await Promise.all(providers.completion.map((provider: any) => provider.provideCompletionItems(model, model.getPositionAt(offset))));
    const hovers = await Promise.all(providers.hover.map((provider: any) => provider.provideHover(model, model.getPositionAt(offset))));
    const pending = Promise.all(providers.definition.map((provider: any) => provider.provideDefinition(model, model.getPositionAt(offset), { isCancellationRequested: false })));
    const end = model.getValue().length, external = "\n/* external agent edit */";
    api.replaceActiveRange({ path, start: end, end, expected: "", text: external });
    const refused = (await pending).flat().filter(Boolean).length;
    api.replaceActiveRange({ path, start: end, end: end + external.length, expected: external, text: "" });
    const definitions = await Promise.all(providers.definition.map((provider: any) => provider.provideDefinition(model, model.getPositionAt(offset), { isCancellationRequested: false })));
    return { refused, names: completions.flatMap(result => result?.suggestions?.map((suggestion: any) => suggestion.label) ?? []), hover: JSON.stringify(hovers), definitions: definitions.flat().filter(Boolean).map((definition: any) => ({ path: definition.uri.path, range: definition.range })) };
  });
  await expect(page.locator("#secondary-title")).toHaveText("components/card-note/card-note.css");
  expect(result.refused).toBe(0); expect(result.names).toContain("--remote-accent"); expect(result.hover).toContain("components/card-note/card-note.css"); expect(result.definitions.some(definition => definition.path.endsWith("/components/card-note/card-note.css"))).toBe(true);
  const secondary = await page.evaluate(async () => {
    const api = await import("/src/components/code-editor.ts"); const { monaco } = await import("/src/components/monaco.ts");
    const model = monaco.editor.getModels().find(model => model.uri.path.endsWith("/components/card-note/card-note.css"))!;
    const source = model.getValue(), start = source.indexOf("{") + 1;
    api.replaceActiveRange({ path: "components/card-note/card-note.css", start, end: start, expected: "", text: "\ncolor: var(--remote-accent);" });
    const offset = model.getValue().indexOf("var(--remote-accent)") + 6;
    const providers = (window as any).workspaceProviders;
    const completions = await Promise.all(providers.completion.map((provider: any) => provider.provideCompletionItems(model, model.getPositionAt(offset))));
    const hovers = await Promise.all(providers.hover.map((provider: any) => provider.provideHover(model, model.getPositionAt(offset))));
    const definitions = await Promise.all(providers.definition.map((provider: any) => provider.provideDefinition(model, model.getPositionAt(offset), { isCancellationRequested: false })));
    return { mounted: api.isMounted("components/project-card/project-card.css"), names: completions.flatMap(result => result?.suggestions?.map((suggestion: any) => suggestion.label) ?? []), hover: JSON.stringify(hovers), definitions: definitions.flat().filter(Boolean).length };
  });
  expect(secondary.mounted).toBe(true); expect(secondary.names).toContain("--local-space"); expect(secondary.hover).toContain("components/card-note/card-note.css"); expect(secondary.definitions).toBeGreaterThan(0);
});

test("menu refresh restores its same-context field, rejects old scope choices and supports roving keys", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const color = panel(page).getByRole("textbox", { name: "Text colour", exact: true });
  await color.click({ button: "right" });
  await page.evaluate(() => { (window as any).oldMenuChoice = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(button => button.getAttribute("aria-label")?.startsWith("--accent ·")); });
  await page.evaluate(async () => { (await import("/src/page-builder/breakpoints.ts")).setCurrentBreakpoint("tablet"); });
  await expect(color).toBeFocused();
  await page.evaluate(() => (window as any).oldMenuChoice.click());
  await expect(page.locator("#notice")).toContainText("style target changed");
  expect((await storedDraft(page, "styles/site.css"))?.content ?? "").not.toContain("color: var(--accent);");
  await color.press("Shift+F10"); await page.keyboard.press("ArrowRight");
  await expect(panel(page).getByRole("menuitem", { name: "Go to --ink in styles/site.css" })).toBeFocused();
  await page.keyboard.press("ArrowLeft"); await page.keyboard.press("ArrowDown");
  await expect(panel(page).getByRole("menuitem", { name: /--muted ·/ })).toBeFocused();
  await page.keyboard.press("Tab"); await expect(color).toBeFocused();
  await expect(panel(page).getByRole("menu")).toHaveCount(0);
  await expect(panel(page).locator(".style-panel__shared-scope")).toHaveText('Edits apply to every element with class “lead”.');
  await expect(panel(page).getByText("Add a class to style this element in the site's CSS.", { exact: true })).toHaveCount(0);
});
test("Show in code reveals the active target and refuses a detached target after selection changes", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await panel(page).getByRole("button", { name: "Show in code", exact: true }).click();
  await expect(page.locator("#secondary-title")).toHaveText("styles/site.css");
  await expect.poll(() => page.evaluate(async () => {
    const { monaco } = await import("/src/components/monaco.ts"); const model = monaco.editor.getModels().find(model => model.uri.path.endsWith("/styles/site.css"));
    const editor = monaco.editor.getEditors().find(editor => editor.getModel() === model); return model && editor?.getPosition() ? model.getOffsetAt(editor.getPosition()!) : -1;
  })).toBe(await page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("styles/site.css")?.indexOf(".lead {")));
  await page.evaluate(() => { (window as any).oldShowCode = [...document.querySelectorAll<HTMLButtonElement>(".style-panel button")].find(button => button.textContent === "Show in code"); });
  await page.frameLocator(".native-preview-frame").locator("section.cards").evaluate(element => (element as HTMLElement).click());
  await page.evaluate(() => (window as any).oldShowCode.click());
  await expect(page.locator("#notice")).toContainText("style target changed");
});
test("without a workspace Style does not suppress the browser context menu", async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  const prevented = await page.evaluate(async () => {
    const { createStylePanel } = await import("/src/components/style-panel.ts");
    const workspace = document.createElement("main"); workspace.className = "has-preview"; workspace.style.height = "500px"; document.body.append(workspace);
    const context = { key: "native-a", className: "a", classes: ["a"], files: { "site.css": ".a {}" }, computed: {}, target: { path: "site.css", selector: ".a" } };
    const view = createStylePanel({ context: () => context, write: async () => {}, variable: async () => {}, addClass: async () => {}, selectClass: () => {}, showCode: async () => {}, history: () => {}, error: () => {} }, workspace);
    workspace.append(view.root); { const grip = view.root.querySelector<HTMLElement>('[role="separator"]')!; grip.focus(); grip.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); if (grip.getAttribute("aria-valuenow") === "0") throw new Error("The Style panel did not open from its separator."); }
    const input = view.root.querySelector<HTMLInputElement>('[data-property="color"]')!;
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true }); input.dispatchEvent(event);
    const prevented = event.defaultPrevented; view.dispose(); workspace.remove(); return prevented;
  });
  expect(prevented).toBe(false);
});

test("ordinary style field keydown does not request the variable workspace", async ({page,baseURL}) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  const reads = await page.evaluate(async () => {
    const { createStylePanel } = await import("/src/components/style-panel.ts");
    let workspaceReads = 0;
    const context = {key:"test",tag:"p",className:"test",classes:["test"],target:{path:"test.css",selector:".test",start:0},files:{"test.css":".test { color:red; }"},computed:{},get workspace(){ workspaceReads++; return undefined; }};
    const host = document.createElement("main"); document.body.append(host);
    const view = createStylePanel({context:()=>context,write:async()=>{},variable:async()=>{},selectClass:()=>{},addClass:async()=>{},showCode:async()=>{},history:()=>{},error:()=>{}},host);
    host.append(view.root); { const grip = view.root.querySelector<HTMLElement>('[role="separator"]')!; grip.focus(); grip.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); if (grip.getAttribute("aria-valuenow") === "0") throw new Error("The Style panel did not open from its separator."); }
    workspaceReads=0;
    view.root.querySelector('[data-property="margin-top"]')!.dispatchEvent(new KeyboardEvent("keydown",{key:"a",bubbles:true}));
    view.dispose();host.remove(); return workspaceReads;
  });
  expect(reads).toBe(0);
});
test("new class has no misleading Show in code until its first native CSS rule exists", async ({page,baseURL}) => {
  await open(page,baseURL);
  await panel(page).getByRole("textbox",{name:"Class name",exact:true}).fill("new-unwritten-class");
  await panel(page).getByRole("button",{name:"Add class",exact:true}).click();
  await expect(panel(page).getByRole("button",{name:"Show in code",exact:true})).toHaveCount(0);
  await expect(panel(page)).toContainText("No class rule yet. The first style edit creates it");
  await panel(page).getByRole("textbox",{name:"Text colour",exact:true}).fill("purple");
  await panel(page).getByRole("textbox",{name:"Text colour",exact:true}).press("Enter");
  await expect.poll(async () => (await storedDraft(page,"styles/site.css"))?.content).toContain(".new-unwritten-class");
  await expect(panel(page).getByRole("button",{name:"Show in code",exact:true})).toBeVisible();
});
