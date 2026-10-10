import { expect, test } from "@playwright/test";
import { editorMounted, storedDraft } from "./drafts";

// Default fixture, real app. Variant rules are typed into a component CSS
// draft; fixtures/native-starter remains frozen.
test("HTML typing offers component variant attributes and their values from a CSS draft", async ({ page, baseURL }) => {
  const cssPath = "components/project-card/project-card.css";
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${cssPath}`);
  await editorMounted(page, cssPath);
  await page.evaluate(async path => {
    const { monaco } = await import("/src/components/monaco.ts");
    const editor = monaco.editor.getEditors().find(view => view.getModel()?.uri.path.endsWith(`/${path}`))!;
    editor.setPosition(editor.getModel()!.getPositionAt(editor.getModel()!.getValueLength()));
    editor.trigger("keyboard", "type", { text: '\n:host, :host([data-tone="light"]) {}\n:host([data-tone="dark"]) {}\n' });
  }, cssPath);
  await expect.poll(async () => (await storedDraft(page, cssPath))?.content).toContain('data-tone="dark"');
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await editorMounted(page);
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible();
  await expect(page.locator('#content .monaco-editor')).toBeVisible();
  await page.evaluate(async () => {
    const { monaco } = await import("/src/components/monaco.ts");
    const editor = monaco.editor.getEditors().find(view => view.getModel()?.uri.path.endsWith('/index.html'))!;
    const model = editor.getModel()!;
    await editor.getAction('editor.unfoldAll')?.run();
    editor.setPosition(model.getPositionAt(model.getValue().indexOf('<project-card') + '<project-card'.length));
    editor.revealPositionInCenter(editor.getPosition()!);
    editor.focus();
    editor.trigger("keyboard", "type", { text: ' data-t' });
    editor.trigger("test", "editor.action.triggerSuggest", {});
  });
  const widget = page.locator('.suggest-widget.visible');
  await expect(widget).toBeVisible();
  const attribute = widget.locator('.monaco-list-row').filter({ hasText: 'data-tone' }).first();
  await expect(attribute).toBeVisible();
  await attribute.click();
  await expect.poll(() => page.evaluate(async () => (await import('/src/components/code-editor.ts')).getMountedSource('index.html'))).toContain('data-tone=""');
  await page.evaluate(async () => {
    const { monaco } = await import("/src/components/monaco.ts");
    const editor = monaco.editor.getEditors().find(view => view.getModel()?.uri.path.endsWith('/index.html'))!;
    const model = editor.getModel()!;
    await editor.getAction('editor.unfoldAll')?.run();
    editor.setPosition(model.getPositionAt(model.getValue().indexOf('data-tone="') + 'data-tone="'.length));
    editor.revealPositionInCenter(editor.getPosition()!);
    editor.focus();
    editor.trigger('keyboard', 'type', { text: 'd' });
    editor.trigger("test", "editor.action.triggerSuggest", {});
  });
  await expect(widget).toBeVisible();
  await expect(widget).toContainText('dark');
  await widget.locator('.monaco-list-row').filter({ hasText: /^dark/ }).first().click();
  await expect.poll(() => page.evaluate(async () => (await import('/src/components/code-editor.ts')).getMountedSource('index.html'))).toContain('data-tone="dark"');
});

// A focused provider harness complements the real app path above: lifecycle
// and marker owners can be observed without depending on app navigation.
test("variant providers isolate models, refresh markers and dispose without clobbering other diagnostics", async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  const result = await page.evaluate(async () => {
    const api = await import('/src/components/code-editor.ts');
    const { monaco } = await import('/src/components/monaco.ts');
    const completionProviders: any[] = [];
    const hoverProviders: any[] = [];
    const registerCompletion = monaco.languages.registerCompletionItemProvider.bind(monaco.languages);
    const registerHover = monaco.languages.registerHoverProvider.bind(monaco.languages);
    monaco.languages.registerCompletionItemProvider = (language, provider) => {
      if (language === 'html') completionProviders.push(provider);
      return registerCompletion(language, provider);
    };
    monaco.languages.registerHoverProvider = (language, provider) => {
      if (language === 'html') hoverProviders.push(provider);
      return registerHover(language, provider);
    };
    const htmlHost = document.createElement('div'), cssHost = document.createElement('div');
    htmlHost.style.height = cssHost.style.height = '300px';
    document.body.replaceChildren(htmlHost, cssHost);
    let css = ':host[data-broken] {} :host([data-tone=dark]) {}';
    // The site's files (shared/variant-lookup.ts VariantFiles): project-card's own CSS is variants.css.
    const site = { pages: [], components: { 'project-card': 'variants.html' } };
    const lookup = { site: () => site, read: (path: string) => path === 'variants.css' ? css : undefined };
    const disposeCss = api.mountCodeEditor(cssHost, { key: 'variant-css', path: 'variants.css', source: css, variants: lookup });
    const disposeHtml = api.mountCodeEditor(htmlHost, { key: 'variant-html', path: 'variants.html', source: '<project-card data-tone="sepia">', variants: lookup });
    const htmlModel = monaco.editor.getModels().find(model => model.uri.path.endsWith('/variants.html'))!;
    const cssModel = monaco.editor.getModels().find(model => model.uri.path.endsWith('/variants.css'))!;
    const variantMarkers = (model: any) => monaco.editor.getModelMarkers({ resource: model.uri }).filter(marker => marker.owner.startsWith('native-variants:'));
    const initial = { html: variantMarkers(htmlModel), css: variantMarkers(cssModel) };
    const hover = hoverProviders[0].provideHover(htmlModel, htmlModel.getPositionAt(17));
    monaco.editor.setModelMarkers(cssModel, 'other-diagnostic', [{ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2, message: 'Other diagnostic', severity: monaco.MarkerSeverity.Warning }]);
    css = ':host {} :host([data-tone=dark]) {} :host([data-tone=sepia]) {}';
    cssModel.setValue(css);
    const refreshed = { html: variantMarkers(htmlModel), css: variantMarkers(cssModel), other: monaco.editor.getModelMarkers({ owner: 'other-diagnostic', resource: cssModel.uri }) };
    const foreign = monaco.editor.createModel('<project-card >', 'html');
    const unrelated = completionProviders[0].provideCompletionItems(foreign, { lineNumber: 1, column: 15 });
    const foreignHover = hoverProviders[0].provideHover(foreign, { lineNumber: 1, column: 3 });
    foreign.dispose();
    disposeHtml(); disposeCss();
    const disposed = completionProviders[0].provideCompletionItems(htmlModel, { lineNumber: 1, column: 15 });
    return { initial, hover, refreshed, unrelated, foreignHover, disposed,
      remaining: monaco.editor.getModelMarkers({}).filter(marker => marker.owner.startsWith('native-variants:')) };
  });
  expect(result.initial.html).toHaveLength(1);
  expect(result.initial.html[0].message).toContain('Custom');
  expect(result.initial.html[0].severity).toBe(2); // MarkerSeverity.Info
  expect(result.initial.css).toHaveLength(2);
  expect(result.initial.css.some(marker => marker.message.includes(':host([data-broken])'))).toBe(true);
  expect(JSON.stringify(result.hover)).toContain('Default look');
  expect(result.refreshed.html).toEqual([]);
  expect(result.refreshed.css).toEqual([]);
  expect(result.refreshed.other).toHaveLength(1);
  expect(result.unrelated.suggestions).toEqual([]);
  expect(result.foreignHover).toBeUndefined();
  expect(result.disposed.suggestions).toEqual([]);
  expect(result.remaining).toEqual([]);
});
